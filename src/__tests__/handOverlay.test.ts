import { expect, test } from "vitest";
import {
  mapNormalizedToViewport,
  projectOverlayHand,
  updateEdgeStableHands,
  updateHandScales,
  smoothHandsById,
} from "../HandOverlay";
import { EdgeStableHandFilter } from "../spd/edge-stable-hand-filter";

function sizedHand(palmSize: number): number[][] {
  const points = Array.from({ length: 21 }, () => [0.5, 0.5, 0]);
  points[0] = [0.5, 0.5, 0];
  points[9] = [0.5, 0.5 + palmSize, 0];
  return points;
}

test("expands the centered 60% camera workspace across the complete mirrored viewport", () => {
  expect(mapNormalizedToViewport(0.2, 0.2, 1920, 1080)).toEqual([1920, 0]);
  expect(mapNormalizedToViewport(0.35, 0.35, 1920, 1080)).toEqual([1440, 270]);
  expect(mapNormalizedToViewport(0.5, 0.5, 1920, 1080)).toEqual([960, 540]);
  expect(mapNormalizedToViewport(0.8, 0.8, 1920, 1080)).toEqual([0, 1080]);
});

test("pins camera overreach outside the 60% workspace to the viewport edges", () => {
  expect(mapNormalizedToViewport(0.05, 0.05, 1920, 1080)).toEqual([1920, 0]);
  expect(mapNormalizedToViewport(0.95, 0.95, 1920, 1080)).toEqual([0, 1080]);
});

test("keeps the rendered thumb landmark at the exact SPD pointer position on a widescreen", () => {
  const landmarks = sizedHand(0.16);
  landmarks[4] = [0.503, 0.42, -0.1];
  landmarks[0] = [0.72, 0.8, 0];
  landmarks[9] = [0.72, 0.64, 0];

  const projected = projectOverlayHand(landmarks, 1920, 1080, 1, 4 / 3);

  expect(projected[4]).toEqual(
    mapNormalizedToViewport(0.503, 0.42, 1920, 1080),
  );
});

test("uses fixed landmark sizing regardless of camera hand depth", () => {
  expect(updateHandScales([sizedHand(0.32), sizedHand(0.04)])).toEqual([1, 1]);
});

test("keeps edge guards attached to stable hand IDs when result order changes", () => {
  const filters = new Map<number, EdgeStableHandFilter>();
  const left = sizedHand(0.16).map(([x, y, z]) => [x - 0.1, y, z]);
  const right = sizedHand(0.16).map(([x, y, z]) => [x + 0.1, y, z]);
  updateEdgeStableHands(filters, [left, right], [7, 12]);

  const outsideRight = right.map(([x, y, z]) => [x + 0.4, y, z]);
  const reversed = updateEdgeStableHands(
    filters,
    [outsideRight, left],
    [12, 7],
  );
  expect(reversed[0]).not.toBeNull();
  expect(reversed[1]).toEqual(left);
});

test("smooths each hand using its own prior pose when detection order reverses", () => {
  const left = sizedHand(.16).map(([x, y, z]) => [x - .2, y, z]);
  const right = sizedHand(.16).map(([x, y, z]) => [x + .2, y, z]);
  const previous = new Map([[7, left], [12, right]]);
  const next = smoothHandsById(previous, [right, left], [12, 7], .5);
  expect(next.get(7)?.[0][0]).toBeCloseTo(left[0][0]);
  expect(next.get(12)?.[0][0]).toBeCloseTo(right[0][0]);
});

test('a briefly missing hand keeps its own smoothing history while the other hand remains', () => {
  const left = sizedHand(.16).map(([x, y, z]) => [x - .2, y, z]);
  const right = sizedHand(.16).map(([x, y, z]) => [x + .2, y, z]);
  const first = new Map([[7, left], [12, right]]);
  const missing = smoothHandsById(first, [right], [12], .5);
  const returned = left.map(([x, y, z]) => [x + .1, y, z]);
  const next = smoothHandsById(missing, [right, returned], [12, 7], .5);
  expect(next.get(7)?.[0][0]).toBeCloseTo(left[0][0] + .05);
});
