import type { Point2D } from './geometry';
import type { DiagnosticSnapshot } from '../../electron/product/contracts';

type FrameObservation = { timestamp: number; inferenceMs: number; droppedFrames: number; landmarks: number[][][] };
type InputObservation = { capturedAtEpoch: number; acknowledgedAtEpoch: number; target: Point2D; actual: Point2D };
type TraceFrame = DiagnosticSnapshot['trace'][number];

const keep = (values: number[], value: number, limit = 600): void => {
  if (!Number.isFinite(value) || value < 0) return;
  values.push(value);
  if (values.length > limit) values.shift();
};
const p95 = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * .95) - 1];
};

/** Local, bounded telemetry. Camera images are never accepted by this API. */
export class DiagnosticsRecorder {
  private intervals: number[] = [];
  private inference: number[] = [];
  private latency: number[] = [];
  private jitterSquared: number[] = [];
  private previousFrameAt: number | null = null;
  private previousInput: InputObservation | null = null;
  private stationarySince: number | null = null;
  private droppedFrames = 0;
  private gestureInterruptions = 0;
  private frameCount = 0;
  private inputCount = 0;
  private traceEnabled = false;
  private trace: TraceFrame[] = [];

  frame(sample: FrameObservation): void {
    if (this.previousFrameAt !== null)
      keep(this.intervals, sample.timestamp - this.previousFrameAt);
    this.previousFrameAt = sample.timestamp;
    keep(this.inference, sample.inferenceMs);
    this.droppedFrames = Math.max(this.droppedFrames, sample.droppedFrames);
    this.frameCount++;
    if (this.traceEnabled) {
      this.trace.push({ timestamp: sample.timestamp,
        landmarks: sample.landmarks.map(hand => hand.map(point => [...point])) });
      if (this.trace.length > 900) this.trace.shift();
    }
  }

  input(sample: InputObservation): void {
    keep(this.latency, sample.acknowledgedAtEpoch - sample.capturedAtEpoch);
    if (this.previousInput &&
      Math.hypot(sample.target.x - this.previousInput.target.x,
        sample.target.y - this.previousInput.target.y) <= .004) {
      this.stationarySince ??= this.previousInput.acknowledgedAtEpoch;
      if (sample.acknowledgedAtEpoch - this.stationarySince >= 250)
        keep(this.jitterSquared,
          Math.hypot(sample.actual.x - this.previousInput.actual.x,
            sample.actual.y - this.previousInput.actual.y) ** 2);
    } else this.stationarySince = null;
    this.previousInput = sample;
    this.inputCount++;
  }

  interruption(): void { this.gestureInterruptions++; }
  setTraceEnabled(enabled: boolean): void {
    if (enabled && !this.traceEnabled) this.trace = [];
    this.traceEnabled = enabled;
  }

  snapshot(): DiagnosticSnapshot {
    return {
      captureIntervalP95Ms: p95(this.intervals), inferenceP95Ms: p95(this.inference),
      inputLatencyP95Ms: p95(this.latency),
      stationaryJitterRms: this.jitterSquared.length
        ? Math.sqrt(this.jitterSquared.reduce((sum, value) => sum + value, 0) / this.jitterSquared.length) : 0,
      droppedFrames: this.droppedFrames, gestureInterruptions: this.gestureInterruptions,
      frameCount: this.frameCount, inputCount: this.inputCount, traceEnabled: this.traceEnabled,
      trace: this.trace.map(frame => ({ timestamp: frame.timestamp,
        landmarks: frame.landmarks.map(hand => hand.map(point => [...point])) })),
    };
  }
}
