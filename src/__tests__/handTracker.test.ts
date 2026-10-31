import { describe, expect, test } from "vitest";
import {
  buildHandResult,
  extractPointerData,
  HandTracker,
  selectPoseLandmarks,
  selectSecondaryControlHand,
  selectPrimaryHandIndex,
} from "../HandTracker";
import { PrimaryHandSelector } from "../spd/primary-hand-selector";

const landmarks = (x: number, y: number, z = -0.1) =>
  Array.from({ length: 21 }, (_, index) => ({
    x: index === 4 ? x : 0.5,
    y: index === 4 ? y : 0.5,
    z: index === 4 ? z : 0,
    visibility: 0.9,
  }));

describe("SPD pointer extraction", () => {
  test("prefers complete world coordinates for gesture geometry", () => {
    const screen = Array.from({ length: 21 }, () => [0.5, 0.5, 0]);
    const world = Array.from({ length: 21 }, () => [0.02, -0.03, 0.01]);
    expect(selectPoseLandmarks(screen, world)).toBe(world);
    expect(selectPoseLandmarks(screen, world.slice(0, 20))).toBe(screen);
  });

  test("reports a live video aspect ratio with a 4:3 fallback", () => {
    const tracker = new HandTracker();
    expect(tracker.getVideoAspectRatio()).toBe(4 / 3);

    Object.defineProperty(tracker, "videoEl", {
      value: { videoWidth: 1280, videoHeight: 720 },
    });
    expect(tracker.getVideoAspectRatio()).toBe(16 / 9);
  });

  test("keeps stable track IDs aligned with every rendered hand field", () => {
    const result = buildHandResult([
      {
        id: 7,
        landmarks: [[0.2, 0.4, 0]],
        worldLandmarks: [[1, 2, 3]],
        handedness: "Right",
        confidence: 0.91,
      },
      {
        id: 12,
        landmarks: [[0.8, 0.4, 0]],
        worldLandmarks: [[4, 5, 6]],
        handedness: "Left",
        confidence: 0.88,
      },
    ]);

    expect(result.trackIds).toEqual([7, 12]);
    expect(result.handedness).toEqual(["Right", "Left"]);
    expect(result.confidences).toEqual([0.91, 0.88]);
    expect(result.landmarks).toEqual([[[0.2, 0.4, 0]], [[0.8, 0.4, 0]]]);
  });

  test("selects the gesture hand by stable ID rather than detection order", () => {
    const result = buildHandResult([
      {
        id: 12,
        landmarks: [[0.8, 0.4, 0]],
        worldLandmarks: [],
        handedness: "Left",
        confidence: 0.88,
      },
      {
        id: 7,
        landmarks: [[0.2, 0.4, 0]],
        worldLandmarks: [],
        handedness: "Right",
        confidence: 0.91,
      },
    ]);

    expect(selectSecondaryControlHand(result, 7, 123)).toEqual({
      cameraAspectRatio:4/3,
      trackId: 12,
      landmarks: [[0.8, 0.4, 0]],
      handedness: "Left",
      confidence: 0.88,
      timestamp: 123,
    });
  });

  test("prefers the right hand when two hands are detected", () => {
    expect(
      selectPrimaryHandIndex([
        [{ categoryName: "Left", score: 0.95 }],
        [{ categoryName: "Right", score: 0.8 }],
      ]),
    ).toBe(1);
  });

  test("extracts a clamped thumb-tip pointer and classification confidence", () => {
    expect(
      extractPointerData(landmarks(1.4, -0.2, -0.25), [
        { categoryName: "Right", score: 0.87 },
      ]),
    ).toEqual({
      x: 1,
      y: 0,
      z: -0.25,
      handedness: "Right",
      confidence: 0.87,
      visibility: 0.9,
      presence: null,
    });
  });

  test("returns null when the thumb fingertip is unavailable", () => {
    expect(extractPointerData(landmarks(0.4, 0.6).slice(0, 4), [])).toBeNull();
  });
});

describe("primary hand ownership", () => {
  test("keeps the same physical hand when detection order changes", () => {
    const selector = new PrimaryHandSelector();
    expect(
      selector.update(
        [
          { wrist: [0.2, 0.7, 0], handedness: "Right", confidence: 0.9 },
          { wrist: [0.8, 0.7, 0], handedness: "Left", confidence: 0.95 },
        ],
        0,
      ),
    ).toBe(0);

    expect(
      selector.update(
        [
          { wrist: [0.79, 0.7, 0], handedness: "Left", confidence: 0.95 },
          { wrist: [0.21, 0.7, 0], handedness: "Right", confidence: 0.88 },
        ],
        33,
      ),
    ).toBe(1);
  });

  test("keeps the nearest physical hand when handedness labels briefly flip", () => {
    const selector = new PrimaryHandSelector();
    expect(
      selector.update(
        [
          { wrist: [0.2, 0.7, 0], handedness: "Right", confidence: 0.9 },
          { wrist: [0.8, 0.7, 0], handedness: "Left", confidence: 0.9 },
        ],
        0,
      ),
    ).toBe(0);

    expect(
      selector.update(
        [
          { wrist: [0.21, 0.7, 0], handedness: "Left", confidence: 0.6 },
          { wrist: [0.79, 0.7, 0], handedness: "Right", confidence: 0.6 },
        ],
        33,
      ),
    ).toBe(0);
  });

  test("keeps an explicit track owner while two hands cross", () => {
    const selector = new PrimaryHandSelector();
    expect(
      selector.update(
        [
          { id: 7, wrist: [0.2, 0.7, 0], handedness: "Right", confidence: 0.9 },
          { id: 8, wrist: [0.8, 0.7, 0], handedness: "Left", confidence: 0.9 },
        ],
        0,
      ),
    ).toBe(0);

    expect(
      selector.update(
        [
          {
            id: 7,
            wrist: [0.55, 0.7, 0],
            handedness: "Right",
            confidence: 0.9,
          },
          { id: 8, wrist: [0.45, 0.7, 0], handedness: "Left", confidence: 0.9 },
        ],
        33,
      ),
    ).toBe(0);
  });

  test("holds ownership briefly through loss and then permits reassignment", () => {
    const selector = new PrimaryHandSelector(500);
    expect(
      selector.update(
        [{ wrist: [0.2, 0.7, 0], handedness: "Right", confidence: 0.9 }],
        0,
      ),
    ).toBe(0);
    expect(selector.update([], 300)).toBeNull();
    expect(selector.isHoldingOwnership(300)).toBe(true);
    expect(
      selector.update(
        [{ wrist: [0.8, 0.7, 0], handedness: "Left", confidence: 0.9 }],
        600,
      ),
    ).toBe(0);
    expect(selector.isHoldingOwnership(600)).toBe(false);
  });
});
