import { describe, expect, test } from "vitest";
import {
  EdgeStableHandFilter,
  palmCentroid,
  stabilizeWorkspaceHands,
} from "../spd/edge-stable-hand-filter";
import { distance3d } from "../spd/geometry";

function hand(): number[][] {
  return [
    [0.5, 0.75, 0],
    [0.44, 0.68, 0],
    [0.4, 0.61, 0],
    [0.36, 0.54, 0],
    [0.32, 0.47, 0],
    [0.44, 0.58, 0],
    [0.43, 0.47, 0],
    [0.42, 0.36, 0],
    [0.41, 0.25, 0],
    [0.5, 0.55, 0],
    [0.5, 0.42, 0],
    [0.5, 0.3, 0],
    [0.5, 0.18, 0],
    [0.56, 0.58, 0],
    [0.57, 0.46, 0],
    [0.58, 0.35, 0],
    [0.59, 0.24, 0],
    [0.62, 0.62, 0],
    [0.64, 0.52, 0],
    [0.66, 0.43, 0],
    [0.68, 0.34, 0],
  ];
}

function translate(points: number[][], dx: number, dy = 0): number[][] {
  return points.map(([x, y, z]) => [x + dx, y + dy, z]);
}

describe("60% camera edge guard", () => {
  test("freezes the last valid rigid hand shape when new landmarks enter the unsafe margin", () => {
    const filter = new EdgeStableHandFilter();
    const valid = hand();
    filter.update(valid);
    const distorted = translate(valid, 0.4);
    distorted[8] = [0.1, 0.95, 0.8];

    const guarded = filter.update(distorted)!;
    expect(palmCentroid(guarded).x).toBeCloseTo(0.8, 10);
    expect(distance3d(guarded[0], guarded[8])).toBeCloseTo(
      distance3d(valid[0], valid[8]),
      10,
    );
  });

  test("does not render an unstable hand first detected outside the safe workspace", () => {
    const filter = new EdgeStableHandFilter();
    expect(filter.update(translate(hand(), 0.4))).toBeNull();
  });

  test("requires a small re-entry margin before accepting live landmark updates again", () => {
    const filter = new EdgeStableHandFilter();
    const valid = hand();
    filter.update(valid);
    filter.update(translate(valid, 0.4));

    const barelyInside = translate(valid, 0.26);
    barelyInside[8] = [0.77, 0.1, 0];
    const stillFrozen = filter.update(barelyInside)!;
    expect(distance3d(stillFrozen[0], stillFrozen[8])).toBeCloseTo(
      distance3d(valid[0], valid[8]),
      10,
    );

    const safelyInside = translate(valid, 0.1);
    safelyInside[8] = [0.67, 0.1, 0];
    expect(filter.update(safelyInside)?.[8]).toEqual([0.67, 0.1, 0]);
  });

  test("gives every consumer the same guarded landmarks for a stable track", () => {
    const filters = new Map<number, EdgeStableHandFilter>();
    const stable = hand();
    const first = stabilizeWorkspaceHands(filters, [
      {
        id: 7,
        landmarks: stable,
        worldLandmarks: [],
        handedness: "Right",
        confidence: 0.95,
      },
    ]);
    const distorted = translate(stable, 0.4);
    distorted[8] = [0.1, 0.95, 0.8];
    const second = stabilizeWorkspaceHands(filters, [
      {
        id: 7,
        landmarks: distorted,
        worldLandmarks: [],
        handedness: "Right",
        confidence: 0.95,
      },
    ]);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(
      distance3d(second[0].landmarks[0], second[0].landmarks[8]),
    ).toBeCloseTo(distance3d(stable[0], stable[8]), 10);
  });
});
