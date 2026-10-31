import {
  CAMERA_WORKSPACE_MAX,
  CAMERA_WORKSPACE_MIN,
  clamp01,
  type Point2D,
} from "./geometry";
import type { StableHand } from "./stable-hand-tracker";

const PALM_INDICES = [0, 5, 9, 13, 17];
const REENTRY_MARGIN = 0.03;

export function palmCentroid(landmarks: number[][]): Point2D {
  const points = PALM_INDICES.map((index) => landmarks[index]).filter(
    (point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1]),
  );
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  return {
    x: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    y: points.reduce((sum, point) => sum + point[1], 0) / points.length,
  };
}

export class EdgeStableHandFilter {
  private lastValid: number[][] | null = null;
  private frozen = false;

  update(landmarks: number[][]): number[][] | null {
    if (
      landmarks.length < 21 ||
      landmarks.some(
        (point) =>
          point.length < 2 || point.some((value) => !Number.isFinite(value)),
      )
    ) {
      return this.lastValid ? this.clone(this.lastValid) : null;
    }

    const anchor = palmCentroid(landmarks);
    const insideWorkspace = this.inside(anchor, 0);
    if (!this.lastValid) {
      if (!insideWorkspace) return null;
      this.lastValid = this.clone(landmarks);
      return this.clone(landmarks);
    }

    if (this.frozen) {
      if (this.inside(anchor, REENTRY_MARGIN)) {
        this.frozen = false;
        this.lastValid = this.clone(landmarks);
        return this.clone(landmarks);
      }
      return this.frozenAtBoundary(anchor);
    }

    if (insideWorkspace) {
      this.lastValid = this.clone(landmarks);
      return this.clone(landmarks);
    }

    this.frozen = true;
    return this.frozenAtBoundary(anchor);
  }

  reset(): void {
    this.lastValid = null;
    this.frozen = false;
  }

  private frozenAtBoundary(currentAnchor: Point2D): number[][] {
    const stable = this.lastValid!;
    const stableAnchor = palmCentroid(stable);
    const target = {
      x: Math.max(
        CAMERA_WORKSPACE_MIN,
        Math.min(CAMERA_WORKSPACE_MAX, clamp01(currentAnchor.x)),
      ),
      y: Math.max(
        CAMERA_WORKSPACE_MIN,
        Math.min(CAMERA_WORKSPACE_MAX, clamp01(currentAnchor.y)),
      ),
    };
    const dx = target.x - stableAnchor.x;
    const dy = target.y - stableAnchor.y;
    return stable.map(([x, y, ...rest]) => [x + dx, y + dy, ...rest]);
  }

  private inside(point: Point2D, margin: number): boolean {
    return (
      point.x >= CAMERA_WORKSPACE_MIN + margin &&
      point.x <= CAMERA_WORKSPACE_MAX - margin &&
      point.y >= CAMERA_WORKSPACE_MIN + margin &&
      point.y <= CAMERA_WORKSPACE_MAX - margin
    );
  }

  private clone(landmarks: number[][]): number[][] {
    return landmarks.map((point) => [...point]);
  }
}

export function stabilizeWorkspaceHands(
  filters: Map<number, EdgeStableHandFilter>,
  hands: readonly StableHand[],
): StableHand[] {
  const activeIds = new Set(hands.map((hand) => hand.id));
  for (const id of filters.keys()) if (!activeIds.has(id)) filters.delete(id);
  const guarded: StableHand[] = [];
  for (const hand of hands) {
    let filter = filters.get(hand.id);
    if (!filter) {
      filter = new EdgeStableHandFilter();
      filters.set(hand.id, filter);
    }
    const landmarks = filter.update(hand.landmarks);
    if (landmarks) guarded.push({ ...hand, landmarks });
  }
  return guarded;
}
