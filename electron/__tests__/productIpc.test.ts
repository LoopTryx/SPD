import { expect, test, vi } from 'vitest';
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
import { freshLease, senderAllowed } from '../product/policy';
import { validatePayload } from '../ipc/validation';

const identity = { overlayId: 10, centerId: 20, overlayUrl: 'file:///app/index.html', centerUrl: 'file:///app/index.html#control' };
const sender = (id: number, url: string, mainFrame = true) => ({ id, url, mainFrame });
test('only the exact overlay main frame can inject or renew input', () => {
  expect(senderAllowed('cursor-move', sender(10, identity.overlayUrl), identity)).toBe(true);
  for (const channel of ['cursor-move', 'input-lease', 'runtime-publish', 'calibration-save']) {
    for (const value of [sender(20, identity.centerUrl), sender(10, identity.overlayUrl, false), sender(10, 'https://example.test'), sender(30, identity.overlayUrl)]) {
      expect(senderAllowed(channel, value, identity)).toBe(false);
    }
  }
});
test('only the control center can change settings or resume; unknown channels denied', () => {
  for (const channel of ['settings-change', 'product-resume', 'update-install']) {
    expect(senderAllowed(channel, sender(20, identity.centerUrl), identity)).toBe(true);
    expect(senderAllowed(channel, sender(10, identity.overlayUrl), identity)).toBe(false);
  }
  expect(senderAllowed('unknown', sender(20, identity.centerUrl), identity)).toBe(false);
  expect(senderAllowed('product-state', sender(10, identity.overlayUrl), identity)).toBe(true);
  expect(senderAllowed('product-state', sender(20, identity.centerUrl), identity)).toBe(true);
});
test('leases reject stale and future frames, paused state and invalid timestamps', () => {
  expect(freshLease(850, 1000, false)).toBe(true);
  expect(freshLease(1001, 1000, false)).toBe(false);
  for (const time of [849, 1021, NaN, Infinity]) expect(freshLease(time, 1000, false)).toBe(false);
  expect(freshLease(1000, 1000, true)).toBe(false);
});
test('product payload validation bounds counters, settings and calibration input', () => {
  expect(validatePayload('pointer-targets', { x:.5,y:.5 }).valid).toBe(true);
  expect(validatePayload('pointer-targets', { x:2,y:.5 }).valid).toBe(false);
  expect(senderAllowed('pointer-targets',sender(10,identity.overlayUrl),identity)).toBe(true);
  expect(senderAllowed('pointer-targets',sender(20,identity.centerUrl),identity)).toBe(false);
  expect(validatePayload('settings-change', { sensitivity: 'responsive' }).valid).toBe(true);
  expect(validatePayload('settings-change', { paused: false }).valid).toBe(false);
  expect(validatePayload('settings-change', {}).valid).toBe(false);
  expect(validatePayload('input-lease', 1234).valid).toBe(true);
  expect(validatePayload('input-lease', Infinity).valid).toBe(false);
  const runtime = { status: 'ready', reason: '', tier: 'balanced', inferenceP95Ms: 25, frameAgeMs: 30, droppedFrames: 0, attention: 'neutral' };
  expect(validatePayload('runtime-publish', runtime).valid).toBe(true);
  expect(validatePayload('runtime-publish', { ...runtime, droppedFrames: -1 }).valid).toBe(false);
  expect(validatePayload('runtime-publish', { ...runtime, reason: 'x'.repeat(513) }).valid).toBe(false);
});
