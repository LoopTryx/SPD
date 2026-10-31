export type AttentionState = 'attentive' | 'away' | 'blink' | 'unknown' | 'occluded' | 'manual';

/** Time, attention and a neutral pose must agree before any OS input is allowed. */
export class AttentionGate {
  private since: number | null = null;
  private last = -Infinity;
  private armed = false;
  private lastAttentive = -Infinity;
  inAttentionGrace = false;
  get inBlinkGrace(): boolean { return this.inAttentionGrace; }

  update(attention: AttentionState, timestamp: number, neutral: boolean): boolean {
    // Tolerate a scheduling hitch while still rejecting a stalled tracker:
    // one dropped capture must not disarm control mid-gesture.
    const discontinuity = timestamp <= this.last || timestamp - this.last > 400;
    if ((attention === 'blink' || attention === 'unknown') && !discontinuity &&
      this.armed && timestamp - this.lastAttentive <= 150) {
      this.last = timestamp;
      this.inAttentionGrace = true;
      return false;
    }
    if (!Number.isFinite(timestamp) || discontinuity || (attention !== 'attentive' && attention !== 'blink')) {
      this.since = null;
      this.armed = false;
    }
    this.last = timestamp;
    if (attention !== 'attentive' || !Number.isFinite(timestamp)) {
      this.inAttentionGrace = false;
      this.since = null;
      this.armed = false;
      return false;
    }
    this.inAttentionGrace = false;
    this.lastAttentive = timestamp;
    this.since ??= timestamp;
    if (timestamp - this.since >= 500 && neutral) this.armed = true;
    return this.armed;
  }

  reset(): void {
    this.since = null;
    this.last = -Infinity;
    this.armed = false;
    this.lastAttentive = -Infinity;
    this.inAttentionGrace = false;
  }
}
