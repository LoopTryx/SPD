import { expect, test } from 'vitest';
import { approvedRelease, UpdateController } from '../product/updates';
const release = { version: 1, signed: true, publisherName: 'SPD Test Publisher', updateUrl: 'https://updates.example.test/beta/', channel: 'beta' } as const;
test('updates require a packaged signed Windows application and bundled HTTPS identity', () => {
  expect(approvedRelease(release, true, 'win32', 'SPD Test Publisher')).toEqual(release);
  for (const candidate of [{ ...release, signed: false }, { ...release, updateUrl: 'http://example.test' },
    { ...release, updateUrl: 'https://user:pass@example.test' }, { ...release, updateUrl: 'https://example.test/?token=x' },
    { ...release, channel: 'nightly' }, null]) expect(approvedRelease(candidate, true, 'win32', 'SPD Test Publisher')).toBeNull();
  expect(approvedRelease(release, false, 'win32', 'SPD Test Publisher')).toBeNull();
  expect(approvedRelease(release, true, 'linux', 'SPD Test Publisher')).toBeNull();
  expect(approvedRelease(release, true, 'win32', 'Other Publisher')).toBeNull();
});
function updater() {
  const events = new Map<string, (...args: any[]) => void>();
  const effects: string[] = [];
  return {
    autoDownload: true, autoInstallOnAppQuit: true, allowDowngrade: true, allowPrerelease: false,
    on(name: string, callback: (...args: any[]) => void) { events.set(name, callback); },
    setFeedURL(feed: unknown) { effects.push('feed:' + JSON.stringify(feed)); },
    async checkForUpdates() { effects.push('check'); },
    async downloadUpdate() { effects.push('download'); },
    quitAndInstall() { effects.push('install'); },
    emit(name: string, ...args: any[]) { events.get(name)?.(...args); }, effects,
  };
}
test('updates require separate check, download and install actions and never install on quit', async () => {
  const adapter = updater(); const controller = new UpdateController(adapter, release, () => {});
  expect(adapter.autoDownload).toBe(false); expect(adapter.autoInstallOnAppQuit).toBe(false);
  expect(adapter.allowDowngrade).toBe(false);
  expect(await controller.download()).toBe(false); expect(controller.install()).toBe(false);
  expect(await controller.check()).toBe(true);
  adapter.emit('update-available', { files: [{ url: 'SPD-Setup.exe' }] });
  expect(controller.status).toBe('available'); expect(adapter.effects.some(x => x === 'download')).toBe(false);
  expect(await controller.download()).toBe(true); expect(controller.install()).toBe(false);
  adapter.emit('update-downloaded');
  expect(controller.status).toBe('downloaded'); expect(controller.install()).toBe(true);
  expect(adapter.effects.filter(x => x === 'install')).toHaveLength(1);
});
test('unsigned builds cannot access any updater action and errors never authorize installation', async () => {
  const adapter = updater(); const disabled = new UpdateController(adapter, null, () => {});
  expect(await disabled.check()).toBe(false); expect(await disabled.download()).toBe(false); expect(disabled.install()).toBe(false);
  expect(adapter.effects).toEqual([]);
  const controller = new UpdateController(adapter, release, () => {});
  await controller.check(); adapter.emit('error', new Error('private download path'));
  expect(controller.status).toBe('error'); expect(controller.install()).toBe(false);
  expect(controller.status).not.toContain('private');
});
test('update metadata cannot redirect downloads to HTTP or a different origin', async () => {
  for (const url of ['http://updates.example.test/Setup.exe', 'https://elsewhere.example.test/Setup.exe', '//elsewhere.example.test/Setup.exe']) {
    const adapter = updater(); const controller = new UpdateController(adapter, release, () => {});
    await controller.check(); adapter.emit('update-available', { files: [{ url }] });
    expect(await controller.download()).toBe(false); expect(controller.status).toBe('error');
  }
});
