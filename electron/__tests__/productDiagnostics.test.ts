import { expect, test } from 'vitest';
import { diagnosticReport } from '../product/diagnostics';
import { defaultSettings } from '../product/settings';
test('diagnostics include numeric health counters but never camera identifiers, paths, calibration or free text', () => {
  const report = diagnosticReport({
    settings: { ...defaultSettings(), cameraId: 'SECRET-CAMERA', displayId: 123 },
    paused: true, displays: [{ id: 123, label: 'SECRET-SCREEN' }], updateStatus: 'error',
    runtime: { status: 'error', reason: 'C:/Users/SECRET-PATH', tier: 'balanced', inferenceP95Ms: 40, frameAgeMs: 51, droppedFrames: 7, attention: 'SECRET-FACE' },
  }, 'win32', '1.0.0');
  expect(report).toMatchObject({ platform: 'win32', version: '1.0.0', paused: true, displayCount: 1, runtime: { inferenceP95Ms: 40, frameAgeMs: 51, droppedFrames: 7 } });
  expect(JSON.stringify(report)).not.toContain('SECRET');
  expect(JSON.stringify(report)).not.toContain('123');
});

test('landmark traces are excluded without explicit consent and included only after consent', () => {
  const state = { settings: defaultSettings(),
    paused: false, displays: [], updateStatus: 'disabled',
    runtime: { status: 'ready' as const, reason: '', tier: 'balanced' as const,
      inferenceP95Ms: 20, frameAgeMs: 25, droppedFrames: 0, attention: 'attentive' } };
  const measured = { captureIntervalP95Ms: 33, inferenceP95Ms: 20, inputLatencyP95Ms: 70,
    stationaryJitterRms: .01, droppedFrames: 0, gestureInterruptions: 1,
    frameCount: 10, inputCount: 10, traceEnabled: false,
    trace: [{ timestamp: 1, landmarks: [[[.1,.2,.3]]] }] };
  expect(JSON.stringify(diagnosticReport(state, 'win32', 'test', measured, false))).not.toContain('landmarks');
  expect(JSON.stringify(diagnosticReport(state, 'win32', 'test', measured, true))).toContain('landmarks');
});
