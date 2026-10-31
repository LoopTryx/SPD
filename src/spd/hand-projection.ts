import {
  CAMERA_WORKSPACE_MAX,
  CAMERA_WORKSPACE_MIN,
  mapCameraPointToScreen,
} from "./geometry";
import { palmCentroid } from "./edge-stable-hand-filter";

export interface HandProjectionOptions {
  landmarks: number[][];
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  mirror?: boolean;
  anchorIndex?: number;
  sourceAspectRatio?: number;
}

export function projectHandLandmarks({
  landmarks,
  viewportWidth,
  viewportHeight,
  scale,
  mirror = true,
  anchorIndex,
  sourceAspectRatio = 4 / 3,
}: HandProjectionOptions): Array<[number, number]> {
  const centroid = palmCentroid(landmarks);
  const anchor =
    anchorIndex === undefined
      ? [centroid.x, centroid.y, 0]
      : (landmarks[anchorIndex] ?? [0.5, 0.5, 0]);
  const mappedAnchor = mapCameraPointToScreen({ x: anchor[0], y: anchor[1] });
  const anchorX =
    (mirror ? 1 - mappedAnchor.x : mappedAnchor.x) * viewportWidth;
  const anchorY = mappedAnchor.y * viewportHeight;
  const workspaceSize = CAMERA_WORKSPACE_MAX - CAMERA_WORKSPACE_MIN;
  const pixelsPerCameraUnit =
    Math.min(viewportWidth, viewportHeight) / workspaceSize;
  const safeAspectRatio =
    Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0
      ? sourceAspectRatio
      : 4 / 3;
  const xScale = pixelsPerCameraUnit * safeAspectRatio;
  const yScale = pixelsPerCameraUnit;

  return landmarks.map((point) => {
    const dx = (point[0] - anchor[0]) * xScale * scale * (mirror ? -1 : 1);
    const dy = (point[1] - anchor[1]) * yScale * scale;
    return [anchorX + dx, anchorY + dy];
  });
}
