import { distance3d } from "./geometry";

export interface DetectedHand {
  landmarks: number[][];
  worldLandmarks: number[][];
  handedness: string;
  confidence: number;
  /** Classification certainty only; confidence describes tracking validity. */
  handednessConfidence?: number;
}

export interface StableHand extends DetectedHand {
  id: number;
}

interface TrackState extends StableHand {
  wrist: number[];
  velocity: number[];
  lastSeen: number;
  labelCandidate: string | null;
  labelFrames: number;
}

interface Pair {
  track: TrackState;
  candidateIndex: number;
  distance: number;
  score: number;
}

export class StableHandTracker {
  private tracks: TrackState[] = [];
  private nextId = 1;

  constructor(
    private readonly holdMs = 250,
    private readonly maxMatchDistance = 0.38,
  ) {}

  update(candidates: DetectedHand[], timestamp: number): StableHand[] {
    this.tracks = this.tracks.filter(
      (track) => timestamp - track.lastSeen <= this.holdMs,
    );
    const pairs: Pair[] = [];

    for (const track of this.tracks) {
      const elapsed = Math.max(0, Math.min(100, timestamp - track.lastSeen));
      const predicted = track.wrist.map(
        (value, axis) => value + (track.velocity[axis] ?? 0) * elapsed,
      );
      candidates.forEach((candidate, candidateIndex) => {
        const wrist = this.anchor(candidate.landmarks);
        const distance = distance3d(predicted, wrist);
        if (distance > this.maxMatchDistance) return;
        const labelPenalty =
          track.handedness !== "Unknown" &&
          candidate.handedness !== "Unknown" &&
          track.handedness !== candidate.handedness
            ? 0.025
            : 0;
        pairs.push({
          track,
          candidateIndex,
          distance,
          score: distance + labelPenalty,
        });
      });
    }

    pairs.sort((a, b) => a.score - b.score);
    const usedTracks = new Set<number>();
    const usedCandidates = new Set<number>();
    for (const pair of pairs) {
      if (
        usedTracks.has(pair.track.id) ||
        usedCandidates.has(pair.candidateIndex)
      )
        continue;
      this.updateTrack(pair.track, candidates[pair.candidateIndex], timestamp);
      usedTracks.add(pair.track.id);
      usedCandidates.add(pair.candidateIndex);
    }

    candidates.forEach((candidate, index) => {
      if (usedCandidates.has(index)) return;
      const wrist = this.anchor(candidate.landmarks);
      this.tracks.push({
        ...candidate,
        id: this.nextId++,
        landmarks: candidate.landmarks.map((point) => [...point]),
        worldLandmarks: candidate.worldLandmarks.map((point) => [...point]),
        wrist,
        velocity: [0, 0, 0],
        lastSeen: timestamp,
        labelCandidate: null,
        labelFrames: 0,
      });
    });

    return this.tracks
      .filter((track) => track.lastSeen === timestamp)
      .sort((a, b) => a.id - b.id)
      .map(
        ({
          wrist: _wrist,
          velocity: _velocity,
          lastSeen: _lastSeen,
          labelCandidate: _labelCandidate,
          labelFrames: _labelFrames,
          ...track
        }) => ({
          ...track,
          landmarks: track.landmarks.map((point) => [...point]),
          worldLandmarks: track.worldLandmarks.map((point) => [...point]),
        }),
      );
  }

  reset(): void {
    this.tracks = [];
    this.nextId = 1;
  }

  private updateTrack(
    track: TrackState,
    candidate: DetectedHand,
    timestamp: number,
  ): void {
    const nextWrist = this.anchor(candidate.landmarks);
    const elapsed = Math.max(1, timestamp - track.lastSeen);
    const measuredVelocity = nextWrist.map(
      (value, axis) => (value - (track.wrist[axis] ?? 0)) / elapsed,
    );
    track.velocity = measuredVelocity.map(
      (value, axis) => value * 0.65 + (track.velocity[axis] ?? 0) * 0.35,
    );
    // Identity prediction must never delay the live pose used for gestures.
    track.landmarks = candidate.landmarks.map((point) => [...point]);
    track.worldLandmarks = candidate.worldLandmarks.map((point) => [...point]);
    track.wrist = nextWrist;
    track.confidence = candidate.confidence;
    track.handednessConfidence = candidate.handednessConfidence;
    track.lastSeen = timestamp;

    if (
      candidate.handedness === track.handedness ||
      candidate.handedness === "Unknown"
    ) {
      track.labelCandidate = null;
      track.labelFrames = 0;
    } else if (track.labelCandidate === candidate.handedness) {
      track.labelFrames++;
      if (track.labelFrames >= 4 && (candidate.handednessConfidence ?? 0) >= 0.8) {
        track.handedness = candidate.handedness;
        track.labelCandidate = null;
        track.labelFrames = 0;
      }
    } else {
      track.labelCandidate = candidate.handedness;
      track.labelFrames = 1;
    }
  }

  private anchor(landmarks: number[][]): number[] {
    const wrist = landmarks[0] ?? [0, 0, 0];
    const palm = landmarks[9] ?? wrist;
    return [0, 1, 2].map(
      (axis) => (wrist[axis] ?? 0) * 0.7 + (palm[axis] ?? 0) * 0.3,
    );
  }
}
