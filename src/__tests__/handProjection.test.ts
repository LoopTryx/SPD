import { describe, expect, test } from "vitest";
import { projectHandLandmarks } from "../spd/hand-projection";

function hand(anchorX: number, palmSize = 0.16): number[][] {
  const points = Array.from({ length: 21 }, () => [anchorX, 0.5, 0]);
  points[8] = [anchorX, 0.5, 0];
  points[0] = [anchorX - 0.1, 0.5, 0];
  points[9] = [anchorX - 0.1, 0.5 + palmSize, 0];
  points[7] = [anchorX - 0.1, 0.5, 0];
  return points;
}

describe("hand projection", () => {
  test("renders equal camera-pixel X and Y distances equally", () => {
    const landmarks = Array.from({ length: 21 }, () => [0.5, 0.5, 0]);
    landmarks[0] = [0.5, 0.5, 0];
    landmarks[5] = [0.6, 0.5, 0];
    landmarks[9] = [0.5, 0.5 + (0.1 * 4) / 3, 0];

    const projected = projectHandLandmarks({
      landmarks,
      viewportWidth: 1920,
      viewportHeight: 1080,
      scale: 1,
      sourceAspectRatio: 4 / 3,
    });

    expect(Math.abs(projected[5][0] - projected[0][0])).toBeCloseTo(
      Math.abs(projected[9][1] - projected[0][1]),
      5,
    );
  });

  test("falls back to a 4:3 camera aspect", () => {
    const landmarks = hand(0.5);
    const shared = {
      landmarks,
      viewportWidth: 1920,
      viewportHeight: 1080,
      scale: 1,
    };

    expect(projectHandLandmarks(shared)).toEqual(
      projectHandLandmarks({ ...shared, sourceAspectRatio: 4 / 3 }),
    );
  });

  test("does not move the whole skeleton when only the index fingertip jitters", () => {
    const stable = hand(0.5);
    const jittered = stable.map((point) => [...point]);
    jittered[8] = [stable[8][0] + 0.1, stable[8][1], stable[8][2]];

    const first = projectHandLandmarks({
      landmarks: stable,
      viewportWidth: 1920,
      viewportHeight: 1080,
      scale: 1,
    });
    const second = projectHandLandmarks({
      landmarks: jittered,
      viewportWidth: 1920,
      viewportHeight: 1080,
      scale: 1,
    });
    expect(second[0]).toEqual(first[0]);
  });

  test("keeps landmark spacing when the index anchor passes the right camera boundary", () => {
    const projected = projectHandLandmarks({
      landmarks: hand(0.8),
      viewportWidth: 1920,
      viewportHeight: 1080,
      scale: 1,
      mirror: true,
      anchorIndex: 8,
    });

    expect(projected[8]).toEqual([0, 540]);
    expect(projected[7][0]).toBeCloseTo(240, 5);
  });
});
