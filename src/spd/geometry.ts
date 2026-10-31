export interface Point2D {
  x: number;
  y: number;
}

export const CAMERA_WORKSPACE_MIN = 0.2;
export const POINTER_TIP_INDEX = 4;
export const CAMERA_WORKSPACE_MAX = 0.8;

export function distance3d(a: readonly number[], b: readonly number[]): number {
  const dx = (a[0] ?? 0) - (b[0] ?? 0);
  const dy = (a[1] ?? 0) - (b[1] ?? 0);
  const dz = (a[2] ?? 0) - (b[2] ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Expands the centered 60% of a camera axis to the full normalized screen
 * axis. The outer camera margins remain usable as overreach and are pinned to
 * the nearest screen edge, which prevents unstable edge detections from
 * pulling the cursor back into the desktop.
 */
export function mapCameraAxisToScreen(value: number): number {
  const mapped =
    (value - CAMERA_WORKSPACE_MIN) /
    (CAMERA_WORKSPACE_MAX - CAMERA_WORKSPACE_MIN);
  const clamped = clamp01(mapped);
  return Math.round(clamped * 1e12) / 1e12;
}

export function mapCameraPointToScreen(point: Point2D): Point2D {
  return {
    x: mapCameraAxisToScreen(point.x),
    y: mapCameraAxisToScreen(point.y),
  };
}
