import { expect, test } from 'vitest';
import { cameraConstraints, cameraErrorMessage } from '../HandTracker';

test('camera negotiation does not reject devices below 30 FPS or request audio', () => {
  expect(cameraConstraints('')).toEqual({ audio: false, video: {
    facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 60 },
  } });
  expect((cameraConstraints('usb-camera').video as MediaTrackConstraints).deviceId).toEqual({ exact: 'usb-camera' });
});

test('permission and busy-camera failures have different recovery guidance', () => {
  const denied = new Error(); denied.name = 'NotAllowedError';
  const busy = new Error(); busy.name = 'NotReadableError';
  expect(cameraErrorMessage(denied)).toMatch(/privacy/);
  expect(cameraErrorMessage(busy)).toMatch(/Close other camera apps/);
});
