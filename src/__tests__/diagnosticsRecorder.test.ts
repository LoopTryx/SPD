import { expect, test } from 'vitest';
import { DiagnosticsRecorder } from '../spd/diagnostics-recorder';

test('reports measured cadence, inference and input latency without keeping camera images', () => {
  const recorder = new DiagnosticsRecorder();
  recorder.frame({ timestamp: 0, inferenceMs: 10, droppedFrames: 0, landmarks: [] });
  recorder.frame({ timestamp: 33, inferenceMs: 20, droppedFrames: 1, landmarks: [] });
  recorder.input({ capturedAtEpoch: 1000, acknowledgedAtEpoch: 1040, target: { x: .5, y: .5 }, actual: { x: .5, y: .5 } });
  const report = recorder.snapshot();
  expect(report.captureIntervalP95Ms).toBe(33);
  expect(report.inferenceP95Ms).toBe(20);
  expect(report.inputLatencyP95Ms).toBe(40);
  expect(report.droppedFrames).toBe(1);
  expect(report.trace).toEqual([]);
  expect(JSON.stringify(report)).not.toContain('bitmap');
});

test('retains bounded landmark-only traces only after explicit enablement', () => {
  const recorder = new DiagnosticsRecorder();
  recorder.frame({ timestamp: 0, inferenceMs: 1, droppedFrames: 0, landmarks: [[[.1,.2,.3]]] });
  expect(recorder.snapshot().trace).toEqual([]);
  recorder.setTraceEnabled(true);
  for (let i = 0; i < 1000; i++)
    recorder.frame({ timestamp: i, inferenceMs: 1, droppedFrames: 0, landmarks: [[[.1,.2,.3]]] });
  recorder.setTraceEnabled(false);
  expect(recorder.snapshot().trace).toHaveLength(900);
  expect(recorder.snapshot().trace[0].timestamp).toBe(100);
  recorder.frame({ timestamp: 1001, inferenceMs: 1, droppedFrames: 0, landmarks: [[[.4,.5,.6]]] });
  expect(recorder.snapshot().trace).toHaveLength(900);
});

test('counts interrupted gestures and measures stationary output jitter', () => {
  const recorder = new DiagnosticsRecorder();
  recorder.input({ capturedAtEpoch: 1000, acknowledgedAtEpoch: 1010, target: { x: .5, y: .5 }, actual: { x: .5, y: .5 } });
  recorder.input({ capturedAtEpoch: 1033, acknowledgedAtEpoch: 1043, target: { x: .501, y: .5 }, actual: { x: .51, y: .5 } });
  expect(recorder.snapshot().stationaryJitterRms).toBe(0);
  recorder.input({ capturedAtEpoch: 1300, acknowledgedAtEpoch: 1310, target: { x: .501, y: .5 }, actual: { x: .5, y: .5 } });
  recorder.input({ capturedAtEpoch: 1333, acknowledgedAtEpoch: 1343, target: { x: .501, y: .5 }, actual: { x: .51, y: .5 } });
  recorder.interruption();
  expect(recorder.snapshot().gestureInterruptions).toBe(1);
  expect(recorder.snapshot().stationaryJitterRms).toBeCloseTo(.01, 4);
});
