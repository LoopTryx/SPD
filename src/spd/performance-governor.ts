export type PerformanceTier = 'balanced' | 'economy';

/** Balanced sustains ~45 fps at the measured ~22 ms inference; economy ~20 fps. */
export const BALANCED_FPS = 45;
export const ECONOMY_FPS = 20;
/** Inference must be genuinely slow (below ~25 fps) before the tier drops. */
const SLOW_P95_MS = 40;
const FAST_P95_MS = 22;
const SLOW_HOLD_MS = 2500;
const FAST_HOLD_MS = 6000;

export class PerformanceGovernor {
  tier: PerformanceTier = 'balanced';
  private samples: number[] = [];
  private slowSince: number | null = null;
  private fastSince: number | null = null;
  private first: number | null = null;
  private latest = 0;

  record(durationMs: number, timestamp: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.first ??= timestamp;
    this.latest = timestamp;
    this.samples.push(durationMs);
    if (this.samples.length > 120) this.samples.shift();
    const p95 = this.p95;
    this.slowSince = p95 > SLOW_P95_MS ? (this.slowSince ?? timestamp) : null;
    this.fastSince = p95 < FAST_P95_MS ? (this.fastSince ?? timestamp) : null;
    if (this.slowSince !== null && timestamp - this.slowSince >= SLOW_HOLD_MS) this.tier = 'economy';
    if (this.fastSince !== null && timestamp - this.fastSince >= FAST_HOLD_MS) this.tier = 'balanced';
  }

  get p95(): number {
    if (!this.samples.length) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * .95) - 1];
  }

  get ready(): boolean {
    return this.samples.length >= 20 && this.first !== null && this.latest - this.first >= 1500 && this.p95 <= 120;
  }

  get frameIntervalMs(): number { return 1000 / (this.tier === 'balanced' ? BALANCED_FPS : ECONOMY_FPS); }
}
