import type { AttentionState } from './attention-gate';
import type { FaceRegion } from './takeover-guard';

export interface AttentionCalibration {
  version: 2;
  cameraId: string;
  displayId: number | null;
  center: number[];
  tolerance: number[];
  createdAt: number;
}

export interface FaceSample {
  timestamp: number;
  faceCount: number;
  features: number[] | null;
  blink: boolean;
  region?: FaceRegion;
}

type Landmark = { x: number; y: number; z: number };

export function extractFaceRegion(points: readonly Landmark[]): FaceRegion | undefined {
  const outline = [10,152,234,454].map(i => points[i]);
  if (outline.some(p => !p || ![p.x,p.y].every(Number.isFinite))) return undefined;
  const x = Math.min(...outline.map(p => p.x)), y = Math.min(...outline.map(p => p.y));
  const width = Math.max(...outline.map(p => p.x))-x, height = Math.max(...outline.map(p => p.y))-y;
  return width > .04 && height > .04 ? {x,y,width,height} : undefined;
}

/** Iris position within each eye. Head translation is deliberately excluded. */
export function extractFaceFeatures(points: readonly Landmark[]): number[] | null {
  const required = [33, 133, 362, 263, 468, 473, 159, 145, 386, 374];
  if (required.some(i => !points[i] || ![points[i].x, points[i].y, points[i].z].every(Number.isFinite))) return null;
  const left = points[33], right = points[263];
  const width = Math.hypot(right.x - left.x, right.y - left.y);
  if (width < .04 || width > .8) return null;
  const eye = (iris: number, a: number, b: number, top: number, bottom: number): number[] | null => {
    const dx = points[b].x - points[a].x, dy = points[b].y - points[a].y;
    const squared = dx*dx + dy*dy;
    if (squared < .000025) return null;
    const length = Math.sqrt(squared);
    // Project onto the eye's own horizontal and vertical axes. Image axes
    // incorrectly change the inferred gaze when the person tilts their head.
    const vertical = (from: number, to: number) =>
      (-(points[to].x-points[from].x)*dy + (points[to].y-points[from].y)*dx) / length;
    const opening = vertical(top,bottom);
    if (opening < .002) return null;
    return [((points[iris].x-points[a].x)*dx + (points[iris].y-points[a].y)*dy) / squared,
      vertical(top,iris) / opening];
  };
  const leftEye = eye(468,33,133,159,145), rightEye = eye(473,362,263,386,374);
  if (!leftEye || !rightEye) return null;
  const values = [...leftEye, ...rightEye];
  return values.every(Number.isFinite) ? values : null;
}

/**
 * Gaze gating must work before setup has ever run, so an uncalibrated profile
 * is used until the user saves their own. Tolerances stay generous: wrongly
 * deciding "looking away" freezes control, which is worse than stopping late.
 * Feature order is [left iris x, left iris y, right iris x, right iris y].
 * This default is a permissive fallback; personal setup defines the screen area.
 */
export const DEFAULT_GAZE_PROFILE: AttentionCalibration = {
  version: 2, cameraId: '', displayId: null, createdAt: 0,
  center: [.5, .5, .5, .5],
  tolerance: [.3, .5, .3, .5],
};

export function classifyAttention(sample: FaceSample | null, profile: AttentionCalibration | null, now: number): AttentionState {
  const active = profile ?? DEFAULT_GAZE_PROFILE;
  // One face cycle (100 ms) plus slack: a single delayed detection must not
  // disarm control mid-gesture. The input lease and native watchdog still bound safety.
  if (!sample || !Number.isFinite(now) || !Number.isFinite(sample.timestamp) ||
      sample.faceCount !== 1 || !sample.features || sample.features.length !== 4 ||
      now - sample.timestamp > 250 || now < sample.timestamp ||
      active.center.length !== 4 || active.tolerance.length !== 4 ||
      !sample.features.every(Number.isFinite) || !active.center.every(Number.isFinite) ||
      !active.tolerance.every(n => Number.isFinite(n) && n > 0)) return 'unknown';
  if (sample.blink) return 'blink';
  return sample.features.every((n, i) => Number.isFinite(n) && Math.abs(n - active.center[i]) <= active.tolerance[i])
    ? 'attentive' : 'away';
}

export function calibrateAttention(looking: number[][], away: number[][], cameraId: string, displayId: number | null, now: number): AttentionCalibration {
  const valid = (row: number[]) => row.length === 4 && row.every(Number.isFinite);
  if (looking.length < 50 || away.length < 10 || !looking.every(valid) || !away.every(valid))
    throw new Error('Not enough clear samples. Improve lighting and repeat setup.');
  const fit = looking.filter((_, index) => index % 5 !== 0);
  const heldOut = looking.filter((_, index) => index % 5 === 0);
  const center: number[] = [], tolerance: number[] = [];
  const minimum = [.06, .12, .06, .12], maximum = [.4, .8, .4, .8];
  for (let i = 0; i < 4; i++) {
    const sorted = fit.map(row => row[i]).sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * .02)], high = sorted[Math.floor(sorted.length * .98)];
    center.push((low + high) / 2);
    tolerance.push(Math.max(minimum[i], (high - low) / 2 + minimum[i] * .3));
    if (tolerance[i] > maximum[i]) throw new Error('Camera position varied too much. Keep your head comfortable and repeat setup.');
  }
  const inside = (row: number[]) => row.every((value, index) =>
    Math.abs(value - center[index]) <= tolerance[index]);
  if (heldOut.filter(inside).length / heldOut.length < .9)
    throw new Error('Attention setup failed held-out screen samples. Keep your eyes on each target and repeat setup.');
  const distinguishable = away.filter(row => row.some((v, i) => Math.abs(v - center[i]) > tolerance[i] * 1.2)).length;
  if (distinguishable / away.length < .9)
    throw new Error('Setup could not distinguish eyes looking away. Keep your head facing the display and move only your eyes during the last step.');
  return { version: 2, cameraId, displayId, center, tolerance, createdAt: now };
}
