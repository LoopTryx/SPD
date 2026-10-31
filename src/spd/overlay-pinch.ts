const CLOSE_RATIO = 0.18;
const RELEASE_RATIO = 0.32;
const HOLD_MS = 300;
const RELEASE_MS = 150;

export class OverlayPinch {
  private since: number | null = null;
  private latched = false;
  private releasedSince: number | null = null;

  update(
    ratio: number,
    selected: boolean,
    timestamp: number,
  ): { captured: boolean; toggle: boolean } {
    if (!Number.isFinite(ratio) || !Number.isFinite(timestamp)) {
      this.cancelCandidate();
      return { captured: false, toggle: false };
    }
    if (this.latched) {
      if (ratio > RELEASE_RATIO) {
        this.releasedSince ??= timestamp;
        if (timestamp - this.releasedSince >= RELEASE_MS) this.latched = false;
      } else {
        this.releasedSince = null;
      }
      return { captured: ratio <= RELEASE_RATIO, toggle: false };
    }
    if (!selected || ratio > CLOSE_RATIO) {
      this.since = null;
      return { captured: false, toggle: false };
    }
    this.since ??= timestamp;
    if (timestamp - this.since < HOLD_MS)
      return { captured: true, toggle: false };
    this.latched = true;
    this.since = null;
    this.releasedSince = null;
    return { captured: true, toggle: true };
  }

  cancelCandidate(): void {
    this.since = null;
    this.releasedSince = null;
    // Tracking loss is not a release: a returning closed pinch must not toggle again.
  }
}
