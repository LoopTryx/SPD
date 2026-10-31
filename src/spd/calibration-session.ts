import { calibrateAttention, type FaceSample, type AttentionCalibration } from './attention-estimator';

const targets = [[.5,.5],[.12,.12],[.88,.12],[.88,.88],[.12,.88],[.5,.5]];
export interface CalibrationProgress { step: number; secondsLeft: number; done: boolean; x: number; y: number; away: boolean }

export class CalibrationSession {
  private samples: number[][][] = Array.from({ length: 6 }, () => []);
  private lastFace = -Infinity;
  constructor(private readonly startedAt: number) {}

  progress(now: number): CalibrationProgress {
    const elapsed = Math.max(0, now - this.startedAt);
    const step = Math.min(5, Math.floor(elapsed / 5000));
    return { step, secondsLeft: Math.max(0, Math.ceil((30000 - elapsed) / 1000)), done: elapsed >= 30000,
      x: targets[step][0], y: targets[step][1], away: step === 5 };
  }

  observe(face: FaceSample | null, now: number): void {
    const progress = this.progress(now);
    if (progress.done || !face || face.timestamp <= this.lastFace || now - face.timestamp > 150 ||
      face.faceCount !== 1 || face.blink || !face.features) return;
    this.lastFace = face.timestamp;
    // Discard the first second at each target while the user shifts their gaze.
    if ((now - this.startedAt) % 5000 < 1000) return;
    if (this.samples[progress.step].length < 100) this.samples[progress.step].push([...face.features]);
  }

  finish(cameraId: string, displayId: number | null, now: number): AttentionCalibration {
    if (!this.progress(now).done || this.samples.some(samples => samples.length < 15))
      throw new Error('Setup needs a clear view of your eyes at every target. Adjust lighting and repeat setup.');
    return calibrateAttention(this.samples.slice(0, 5).flat(), this.samples[5], cameraId, displayId, Date.now());
  }
}
