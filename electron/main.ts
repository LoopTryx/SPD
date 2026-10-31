import { app, BrowserWindow, dialog, globalShortcut, Menu, nativeImage, powerMonitor, screen, Tray, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, promises as fs } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { autoUpdater } from 'electron-updater';
import { claimSingleInstance } from './core/single-instance';
import { getSystemAnalyticsMonitor } from './core/system-analytics';
import { getCursorController } from './desktop/cursor-controller';
import { TargetService } from './desktop/target-service';
import { registerValidatedHandler, type InvokeChannel } from './ipc/validation';
import type { AttentionCalibration, DiagnosticSnapshot, ProductState, RuntimeStatus, SettingsChange } from './product/contracts';
import { loadSettings, saveSettings } from './product/settings';
import { ProductSession } from './product/session';
import { freshLease, senderAllowed } from './product/policy';
import { approvedRelease, UpdateController } from './product/updates';
import { diagnosticReport } from './product/diagnostics';

let overlay: BrowserWindow | null = null;
let center: BrowserWindow | null = null;
let centerPromise: Promise<BrowserWindow> | null = null;
let tray: Tray | null = null;
let quitting = false;
let calibrationTimer: ReturnType<typeof setTimeout> | undefined;
let session: ProductSession;
let updates: UpdateController;
let traceRecording = false;
let traceConsented = false;
let pendingDiagnostics: ((snapshot: DiagnosticSnapshot) => void) | null = null;
const cursor = getCursorController();
const targets = new TargetService();
const entry = path.join(__dirname, '..', 'dist', 'index.html');
const overlayUrl = pathToFileURL(entry).href;
const centerUrl = overlayUrl + '#control';
const webPreferences = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false };
async function ensureCenter(): Promise<BrowserWindow> {
  if (center && !center.isDestroyed()) return center;
  if (centerPromise) return centerPromise;
  centerPromise = (async () => {
    const win = new BrowserWindow({ width: 760, height: 820, minWidth: 560, minHeight: 600, focusable: true, show: false,
      title: 'SPD Settings', backgroundColor: '#10151d', webPreferences });
    protect(win);
    win.on('close', event => { if (!quitting) { event.preventDefault(); win.hide(); } });
    await win.loadFile(entry, { hash: 'control' });
    center = win;
    return win;
  })().finally(() => { centerPromise = null; });
  return centerPromise;
}
const showCenter = () => {
  void app.whenReady().then(ensureCenter).then(win => { win.show(); win.focus(); })
    .catch(error => { dialog.showErrorBox('SPD Settings', String(error)); });
};
function state(): ProductState {
  return { settings: session.settings, paused: session.paused, runtime: session.runtime,
    displays: screen.getAllDisplays().map(d => ({ id: d.id, label: d.label || 'Display ' + d.id })),
    updateStatus: updates?.status ?? 'disabled', traceRecording };
}
function broadcast(): void {
  if (!session) return;
  for (const win of [overlay, center]) if (win && !win.isDestroyed()) win.webContents.send('spd:product-state', state());
}
function finishCalibration(): void {
  if (calibrationTimer) { clearTimeout(calibrationTimer); calibrationTimer = undefined; showCenter(); }
}
function pause(reason: string): void {
  targets.stop();
  session.pause(reason);
  finishCalibration();
  overlay?.webContents.send('spd:emergency-reset');
}
function toggleInput(): void {
  if (session.paused) session.resume();
  else pause('Paused. Ctrl+Alt+Space resumes control.');
}
function authorize(event: IpcMainInvokeEvent, channel: InvokeChannel): boolean {
  return senderAllowed(channel, { id: event.sender.id, url: event.senderFrame?.url ?? '',
    mainFrame: event.senderFrame === event.sender.mainFrame },
  { overlayId: overlay?.webContents.id, centerId: center?.webContents.id, overlayUrl, centerUrl });
}
function registerHandlers(): void {
  const handle = (channel: InvokeChannel, fn: (payload: any) => unknown) =>
    registerValidatedHandler(channel, (_event, payload) => fn(payload), authorize);
  handle('pointer-targets', p => session.paused ? [] : targets.query(p.x,p.y,session.settings.displayId));
  handle('cursor-move', p => !session.paused && cursor.moveNormalized(p.x, p.y));
  handle('cursor-button', p => !session.paused && cursor.setButton(p.button, p.pressed));
  handle('cursor-scroll', p => !session.paused && cursor.scroll(p.delta));
  handle('workspace-switch', p => !session.paused && cursor.switchWorkspace(p.direction));
  handle('overlay-visible', () => true);
  handle('system-analytics', () => getSystemAnalyticsMonitor().read());
  handle('product-state', state);
  handle('runtime-publish', (runtime: RuntimeStatus) => {
    session.publishRuntime(runtime);
    if (runtime.status === 'error' || runtime.status === 'recovering') finishCalibration();
  });
  handle('input-lease', async capturedAt => {
    if (!freshLease(capturedAt, Date.now(), session.paused)) { await cursor.releaseAll(); return false; }
    return cursor.renewLease(capturedAt);
  });
  handle('input-release', async () => { await cursor.releaseAll(); });
  handle('settings-change', async (change: SettingsChange) => {
    if (change.displayId !== undefined && change.displayId !== null &&
        !screen.getAllDisplays().some(d => d.id === change.displayId)) throw new Error('Display is unavailable');
    finishCalibration();
    if(change.startWithWindows !== undefined) {
      if(!app.isPackaged) throw new Error('Install SPD before enabling Windows startup');
      app.setLoginItemSettings({openAtLogin:change.startWithWindows});
      if(app.getLoginItemSettings().openAtLogin !== change.startWithWindows) throw new Error('Windows did not apply the startup setting');
    }
    session.changeSettings(change);
    await cursor.setDisplayId(session.settings.displayId);
    positionOverlay();
  });
  handle('product-pause', () => pause('Paused by you.'));
  handle('product-resume', () => session.resume());
  handle('calibration-start', () => {
    finishCalibration();
    if (session.settings.displayId === null) session.changeSettings({ displayId: screen.getPrimaryDisplay().id });
    void cursor.setDisplayId(session.settings.displayId);
    positionOverlay();
    session.startCalibration();
    center?.hide();
    overlay?.showInactive();
    overlay?.webContents.send('spd:command', 'calibrate');
    calibrationTimer = setTimeout(() => pause('Calibration timed out. Retry when ready.'), 60_000);
  });
  handle('calibration-save', (calibration: AttentionCalibration) => {
    try { session.saveCalibration(calibration); }
    finally { finishCalibration(); }
  });
  handle('camera-retry', () => { pause('Retrying camera. Input remains paused.'); overlay?.webContents.send('spd:command', 'retry'); });
  handle('update-check', () => updates.check());
  handle('update-download', () => updates.download());
  handle('update-install', () => { if (updates.status !== 'downloaded') return false; pause('Installing update.'); return updates.install(); });
  handle('diagnostics-trace', (enabled: boolean) => {
    traceRecording = enabled;
    if (enabled) traceConsented = true;
    overlay?.webContents.send('spd:trace-recording', enabled);
    broadcast();
    return true;
  });
  handle('diagnostics-publish', (snapshot: DiagnosticSnapshot) => {
    pendingDiagnostics?.(snapshot);
    return true;
  });
  handle('diagnostics-save', async () => {
    const result = await dialog.showSaveDialog(center!, { title: 'Save SPD diagnostics', defaultPath: 'SPD-diagnostics.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return false;
    if (pendingDiagnostics) throw new Error('Diagnostics export is already running.');
    const measured = await new Promise<DiagnosticSnapshot | null>(resolve => {
      const timer = setTimeout(() => { pendingDiagnostics = null; resolve(null); }, 2000);
      pendingDiagnostics = snapshot => { clearTimeout(timer); pendingDiagnostics = null; resolve(snapshot); };
      overlay?.webContents.send('spd:diagnostics-request');
    });
    await fs.writeFile(result.filePath,
      JSON.stringify(diagnosticReport(state(), process.platform, app.getVersion(), measured, traceConsented), null, 2), 'utf8');
    return true;
  });
}
function positionOverlay(): void {
  const display = screen.getAllDisplays().find(d => d.id === session.settings.displayId) ?? screen.getPrimaryDisplay();
  overlay?.setBounds(display.workArea);
}
function protect(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
}
async function createWindows(): Promise<void> {
  overlay = new BrowserWindow({ ...screen.getPrimaryDisplay().workArea, transparent: true, backgroundColor: '#00000000', frame: false,
    focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, webPreferences });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true, { forward: true });
  protect(overlay);
  overlay.webContents.on('render-process-gone', () => { pause('Camera renderer stopped. Restart SPD.'); void cursor.stop(); showCenter(); });
  overlay.webContents.on('did-finish-load', () => {
    if (traceRecording) overlay?.webContents.send('spd:trace-recording', true);
  });
  await overlay.loadFile(entry);
  positionOverlay();
}
function configureUpdates(): UpdateController {
  let release = null;
  try {
    const metadata = JSON.parse(readFileSync(path.join(process.resourcesPath, 'spd-release.json'), 'utf8'));
    const config = parseYaml(readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8'));
    const publishers = Array.isArray(config.publisherName) ? config.publisherName : [config.publisherName];
    const publisher = publishers.includes(metadata.publisherName) && config.url === metadata.updateUrl ? metadata.publisherName : null;
    release = approvedRelease(metadata, app.isPackaged, process.platform, publisher);
  } catch { /* Unsigned development/beta builds intentionally have no update feed. */ }
  return new UpdateController(autoUpdater, release, broadcast);
}
const primary = claimSingleInstance(app, argv => { if (argv.includes('--settings')) showCenter(); });
if (primary) {
  app.whenReady().then(async () => {
    const directory = path.join(app.getPath('userData'), 'product');
    session = new ProductSession(loadSettings(directory), () => { void cursor.releaseAll(); }, value => saveSettings(directory, value), broadcast);
    updates = configureUpdates();
    await cursor.setDisplayId(session.settings.displayId);
    registerHandlers();
    await createWindows();
    if (process.argv.includes('--settings') || session.settings.setupComplete === false) showCenter();
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');
    tray = new Tray(icon);
    tray.setToolTip('Spatial Pointer Device');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open SPD Settings', click: showCenter },
      { label: 'Resume / pause input (Ctrl+Alt+Space)', click: toggleInput },
      { label: 'Pause input', click: () => pause('Paused from tray.') },
      { type: 'separator' }, { label: 'Quit SPD', click: () => app.quit() },
    ]));
    tray.on('double-click', showCenter);
    globalShortcut.register('CommandOrControl+Alt+Escape', () => { pause('Emergency pause. Resume from SPD Settings.'); showCenter(); });
    globalShortcut.register('CommandOrControl+Alt+Space', toggleInput);
    powerMonitor.on('suspend', () => pause('Computer suspended. Resume when ready.'));
    powerMonitor.on('lock-screen', () => pause('Screen locked. Resume when ready.'));
    screen.on('display-removed', () => { pause('Display disconnected. Check your display selection.'); positionOverlay(); broadcast(); });
    screen.on('display-added', broadcast);
    screen.on('display-metrics-changed', () => { pause('Display changed. Review calibration.'); positionOverlay(); broadcast(); });
  });
  app.on('before-quit', () => { quitting = true; targets.stop(); if (calibrationTimer) clearTimeout(calibrationTimer); globalShortcut.unregisterAll(); void cursor.stop(); });
  app.on('activate', showCenter);
  app.on('window-all-closed', () => app.quit());
}
