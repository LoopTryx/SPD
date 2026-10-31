import { expect, test } from 'vitest';
import { ProductSession } from '../product/session';
import { defaultSettings } from '../product/settings';
import type { RuntimeStatus } from '../product/contracts';
const ready: RuntimeStatus = { status: 'ready', reason: '', tier: 'balanced', inferenceP95Ms: 25, frameAgeMs: 20, droppedFrames: 0, attention: 'neutral' };
const calibration = { version: 2 as const, cameraId: '', displayId: null, center: [.5, .5, .5, .5], tolerance: [.1, .1, .1, .1], createdAt: 1000 };
test('calibration survives loading and completes paused', () => {
  const { session } = setup();
  session.startCalibration();
  session.publishRuntime({ ...ready, status: 'loading' });
  session.saveCalibration(calibration);
  expect(session.runtime.status).toBe('paused');
  expect(session.paused).toBe(true);
  expect(session.resume()).toBe(true);
});
function setup() {
  let releases = 0; const events: boolean[] = [];
  const session = new ProductSession(defaultSettings(), () => { releases++; }, () => {}, () => events.push(session.paused));
  return { session, events, releases: () => releases };
}
test('start stays paused; resume works before calibration on default gaze gating', () => {
  const { session } = setup();
  expect(session.paused).toBe(true);
  session.publishRuntime(ready);
  expect(session.resume()).toBe(true);
  expect(session.paused).toBe(false);
});

test('resume still requires a healthy runtime and no calibration in progress', () => {
  const { session } = setup();
  session.publishRuntime({ ...ready, status: 'recovering' });
  expect(session.resume()).toBe(false);
  session.publishRuntime(ready);
  session.startCalibration();
  expect(session.resume()).toBe(false);
  session.saveCalibration(calibration);
  expect(session.resume()).toBe(true);
});
test('recovery releases immediately and never auto-resumes when ready returns', () => {
  const { session, releases, events } = setup();
  session.startCalibration(); session.saveCalibration(calibration); session.publishRuntime(ready); session.resume();
  const before = releases();
  session.publishRuntime({ ...ready, status: 'recovering' });
  expect(session.paused).toBe(true); expect(releases()).toBeGreaterThan(before);
  expect(session.resume()).toBe(false); expect(events.at(-1)).toBe(true);
  session.publishRuntime(ready); expect(session.paused).toBe(true);
  expect(session.resume()).toBe(true);
});
test('settings change releases before persistence and invalidates device calibration', () => {
  const order: string[] = [];
  const session = new ProductSession(defaultSettings(), () => order.push('release'), () => order.push('save'), () => order.push('broadcast'));
  session.startCalibration(); session.saveCalibration(calibration); session.publishRuntime(ready); session.resume(); order.length = 0;
  session.changeSettings({ cameraId: 'new-camera' });
  expect(order[0]).toBe('release');
  expect(order.indexOf('broadcast')).toBeLessThan(order.indexOf('save'));
  expect(session.paused).toBe(true); expect(session.settings.calibration).toBeNull();
  expect(session.settings.cameraId).toBe('new-camera');
});
test('failed persistence keeps old settings but pauses safely', () => {
  const session = new ProductSession(defaultSettings(), () => {}, () => { throw new Error('disk full'); }, () => {});
  expect(() => session.changeSettings({ sensitivity: 'responsive' })).toThrow('disk full');
  expect(session.settings.sensitivity).toBe('balanced'); expect(session.paused).toBe(true);
});
test('calibration cannot be saved outside a requested calibration or for another camera', () => {
  const { session } = setup();
  expect(() => session.saveCalibration(calibration)).toThrow();
  session.startCalibration();
  expect(() => session.saveCalibration({ ...calibration, cameraId: 'another' })).toThrow();
});
