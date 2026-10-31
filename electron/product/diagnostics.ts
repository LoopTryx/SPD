import type { DiagnosticSnapshot, ProductState } from './contracts';
export function diagnosticReport(state: ProductState, platform: string, version: string,
  measured?: DiagnosticSnapshot | null, traceConsented = false): unknown {
  const { status, tier, inferenceP95Ms, frameAgeMs, droppedFrames } = state.runtime;
  return { platform, version, paused: state.paused, displayCount: state.displays.length,
    calibrated: state.settings.calibration !== null, sensitivity: state.settings.sensitivity,
    runtime: { status, tier, inferenceP95Ms, frameAgeMs, droppedFrames },
    ...(measured ? { measured: { captureIntervalP95Ms: measured.captureIntervalP95Ms,
      inferenceP95Ms: measured.inferenceP95Ms, inputLatencyP95Ms: measured.inputLatencyP95Ms,
      stationaryJitterRms: measured.stationaryJitterRms, droppedFrames: measured.droppedFrames,
      gestureInterruptions: measured.gestureInterruptions, frameCount: measured.frameCount,
      inputCount: measured.inputCount,
      ...(traceConsented ? { trace: measured.trace } : {}) } } : {}) };
}
