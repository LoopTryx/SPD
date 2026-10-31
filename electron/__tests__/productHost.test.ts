import { expect, test, vi } from 'vitest';
const host = vi.hoisted(() => ({ handlers: new Map<string, Function>(), ready: undefined as undefined | (() => Promise<void>), windows: [] as any[], secondInstance: undefined as undefined | ((args: string[]) => void), lease: vi.fn(async () => true), release: vi.fn(async () => true) }));
vi.mock('electron', () => {
  class Window {
    id = host.windows.length + 1;
    webContents = { id: this.id, mainFrame: {}, send: vi.fn(), on: vi.fn(), setWindowOpenHandler: vi.fn() };
    constructor(public options: any) { host.windows.push(this); }
    on() {} setAlwaysOnTop() {} setIgnoreMouseEvents() {} setBounds() {} show = vi.fn(); showInactive() {} focus() {} hide() {} isDestroyed() { return false; }
    async loadFile() {}
  }
  return { BrowserWindow: Window, app: { isPackaged: false, whenReady: () => host.ready ? Promise.resolve() : ({ then: (fn: any) => { host.ready = fn; } }), on: vi.fn(), getPath: () => 'unused', getVersion: () => 'test', quit: vi.fn() },
    ipcMain: { handle: (name: string, fn: Function) => host.handlers.set(name, fn) },
    screen: { getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 100, height: 100 } }), getAllDisplays: () => [{ id: 1, label: 'Display', workArea: { x: 0, y: 0, width: 100, height: 100 } }], on: vi.fn() },
    globalShortcut: { register: vi.fn(), unregisterAll: vi.fn() }, powerMonitor: { on: vi.fn() },
    Tray: class { setToolTip() {} setContextMenu() {} on() {} }, Menu: { buildFromTemplate: (x: any) => x },
    nativeImage: { createFromDataURL: () => ({}) }, dialog: { showSaveDialog: async () => ({ canceled: true }) } };
});
vi.mock('../core/single-instance', () => ({ claimSingleInstance: (_app: unknown, callback: (args: string[]) => void) => { host.secondInstance = callback; return true; } }));
vi.mock('../desktop/cursor-controller', () => ({ getCursorController: () => ({ renewLease: host.lease, releaseAll: host.release, setDisplayId: async () => true, stop: async () => true }) }));
vi.mock('../product/settings', async importOriginal => ({ ...await importOriginal<any>(), loadSettings: () => ({ version: 1, cameraId: '', displayId: 1, sensitivity: 'balanced', calibration: null }), saveSettings: vi.fn() }));
vi.mock('electron-updater', () => ({ autoUpdater: { on() {}, setFeedURL() {} } }));
test('host creates separate focusable center and rejects foreign frames and paused input leases', async () => {
  await import('../main');
  await host.ready!();
  expect(host.windows).toHaveLength(1);
  expect(host.windows[0].options.focusable).toBe(false);
  expect(host.handlers.has('input-lease')).toBe(true);
  const overlay = host.windows[0];
  const { pathToFileURL } = await import('node:url');
  const path = await import('node:path');
  const url = pathToFileURL(path.resolve('dist/index.html')).href;
  const frame = overlay.webContents.mainFrame;
  Object.assign(frame, { url });
  const event = { sender: overlay.webContents, senderFrame: frame };
  expect(await host.handlers.get('input-lease')!(event, Date.now())).toBe(false);
  expect(host.lease).not.toHaveBeenCalled();
  expect(() => host.handlers.get('input-lease')!({ ...event, senderFrame: { url } }, Date.now())).toThrow('Unauthorized');
  expect(() => host.handlers.get('product-resume')!(event)).toThrow('Unauthorized');
});

test('settings launch from a second instance creates the center without another camera window', async () => {
  host.secondInstance!(['SPD.exe', '--settings']);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(host.windows).toHaveLength(2);
  expect(host.windows[1].options.focusable).toBe(true);
  expect(host.windows[1].show).toHaveBeenCalledOnce();
});

test('keyboard engagement resumes and pauses control without opening settings', async () => {
  const { globalShortcut } = await import('electron');
  const toggle = vi.mocked(globalShortcut.register).mock.calls.find(([key]) => key === 'CommandOrControl+Alt+Space')?.[1];
  expect(toggle).toBeTypeOf('function');
  const overlay = host.windows[0];
  const event = { sender: overlay.webContents, senderFrame: overlay.webContents.mainFrame };
  await host.handlers.get('runtime-publish')!(event, { status: 'ready', reason: 'Camera ready', tier: 'balanced',
    inferenceP95Ms: 10, frameAgeMs: 10, droppedFrames: 0, attention: 'attentive' });
  const windows = host.windows.length;
  toggle!();
  expect(await host.handlers.get('input-lease')!(event, Date.now())).toBe(true);
  toggle!();
  expect(await host.handlers.get('input-lease')!(event, Date.now())).toBe(false);
  expect(host.windows).toHaveLength(windows);
});
