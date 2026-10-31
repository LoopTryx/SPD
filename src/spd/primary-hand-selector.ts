import { distance3d } from "./geometry";

export interface HandCandidate {
  id?: number;
  wrist: number[];
  handedness: string;
  confidence: number;
}

export class PrimaryHandSelector {
  private trackId: number | null = null;
  private wrist: number[] | null = null;
  private handedness: string | null = null;
  private lastSeen = -Infinity;
  private holding = false;

  constructor(private readonly holdMs = 500) {}

  update(candidates: HandCandidate[], timestamp: number): number | null {
    if (this.trackId !== null) {
      const ownedIndex = candidates.findIndex(
        (candidate) => candidate.id === this.trackId,
      );
      if (ownedIndex >= 0) {
        const owned = candidates[ownedIndex];
        this.wrist = [...owned.wrist];
        this.lastSeen = timestamp;
        this.holding = false;
        return ownedIndex;
      }
      if (timestamp - this.lastSeen <= this.holdMs) {
        this.holding = true;
        return null;
      }
      this.trackId = null;
    }

    if (this.wrist && this.handedness) {
      const matches = candidates
        .map((candidate, index) => ({ candidate, index }))
        .map(({ candidate, index }) => {
          const distance = distance3d(candidate.wrist, this.wrist!);
          const labelPenalty =
            candidate.handedness !== this.handedness ? 0.04 : 0;
          return { candidate, index, distance, score: distance + labelPenalty };
        })
        .sort((a, b) => a.score - b.score);

      if (matches[0] && matches[0].distance <= 0.25) {
        this.wrist = [...matches[0].candidate.wrist];
        this.trackId = matches[0].candidate.id ?? null;
        if (
          matches[0].candidate.handedness === this.handedness ||
          matches[0].candidate.confidence >= 0.9
        ) {
          this.handedness = matches[0].candidate.handedness;
        }
        this.lastSeen = timestamp;
        this.holding = false;
        return matches[0].index;
      }

      if (timestamp - this.lastSeen <= this.holdMs) {
        this.holding = true;
        return null;
      }
    }

    const selected = candidates
      .map((candidate, index) => ({ candidate, index }))
      .sort((a, b) => {
        const rightA = a.candidate.handedness === "Right" ? 1 : 0;
        const rightB = b.candidate.handedness === "Right" ? 1 : 0;
        return (
          rightB - rightA || b.candidate.confidence - a.candidate.confidence
        );
      })[0];

    if (!selected) {
      this.holding = false;
      return null;
    }

    this.wrist = [...selected.candidate.wrist];
    this.trackId = selected.candidate.id ?? null;
    this.handedness = selected.candidate.handedness;
    this.lastSeen = timestamp;
    this.holding = false;
    return selected.index;
  }

  isHoldingOwnership(timestamp: number): boolean {
    return this.holding && timestamp - this.lastSeen <= this.holdMs;
  }

  reset(): void {
    this.trackId = null;
    this.wrist = null;
    this.handedness = null;
    this.lastSeen = -Infinity;
    this.holding = false;
  }
}
