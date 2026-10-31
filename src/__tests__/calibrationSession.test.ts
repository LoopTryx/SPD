import { expect, test } from 'vitest';
import { CalibrationSession } from '../spd/calibration-session';

test('calibration requires clear observations at every target, not only the center', () => {
  const calibration = new CalibrationSession(0);
  for (let t = 1000; t < 5000; t += 100) calibration.observe({ timestamp: t, faceCount: 1, blink: false, features: [0,.8,.5,.5] }, t);
  expect(() => calibration.finish('', null, 30000)).toThrow(/every target/);
});

test('a complete timed session produces values without storing images or landmarks', () => {
  const calibration = new CalibrationSession(0);
  for (let t = 0; t < 30000; t += 100) calibration.observe({ timestamp: t, faceCount: 1, blink: false, features: [t < 25000 ? .5 : .9,.5,.5,.5] }, t);
  const result = calibration.finish('camera', 2, 30000);
  expect(result.cameraId).toBe('camera');
  expect(result.version).toBe(2);
  expect(result.center).toHaveLength(4);
  expect(result.tolerance).toHaveLength(4);
  expect(calibration.progress(30000).done).toBe(true);
});
