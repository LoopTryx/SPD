import { describe, expect, test } from "vitest";
import { StableHandTracker } from "../spd/stable-hand-tracker";

function candidate(x: number, handedness: string, confidence = 0.9) {
  return {
    landmarks: Array.from({ length: 21 }, (_, index) => [
      x + index * 0.0001,
      0.6,
      0,
    ]),
    worldLandmarks: [],
    handedness,
    confidence,
  };
}

describe("StableHandTracker", () => {
  test("returns raw world poses and keeps geometric confidence separate from label confidence", () => {
    const tracker = new StableHandTracker();
    const original = { ...candidate(0.5, "Right"), worldLandmarks: [[0, 0, 0]], handednessConfidence: 0.95 };
    tracker.update([original], 0);
    for (const timestamp of [30, 60, 90, 120]) {
      const next = { ...candidate(0.51, "Left", 0.99), worldLandmarks: [[0.2, 0.3, 0.4]], handednessConfidence: 0.51 };
      const [tracked] = tracker.update([next], timestamp);
      expect(tracked.worldLandmarks).toEqual([[0.2, 0.3, 0.4]]);
      expect(tracked.confidence).toBe(0.99);
      expect(tracked.handedness).toBe("Right");
    }
  });

  test("returns raw landmarks so tracking never delays gesture decisions", () => {
    const tracker = new StableHandTracker();
    tracker.update([candidate(0.5, "Right")], 0);

    const jittered = tracker.update([candidate(0.52, "Right")], 16)[0];
    expect(jittered.landmarks[0][0]).toBe(0.52);

    const deliberate = tracker.update([candidate(0.8, "Right")], 116)[0];
    expect(deliberate.landmarks[0][0]).toBe(0.8);
  });

  test("preserves track identities when MediaPipe reverses result order", () => {
    const tracker = new StableHandTracker();
    const first = tracker.update(
      [candidate(0.2, "Right"), candidate(0.8, "Left")],
      0,
    );
    const rightId = first.find((track) => track.handedness === "Right")!.id;

    const second = tracker.update(
      [candidate(0.79, "Left"), candidate(0.21, "Right")],
      33,
    );
    expect(
      second.find((track) => track.id === rightId)!.landmarks[0][0],
    ).toBeLessThan(0.3);
  });

  test("does not swap identities when handedness labels flicker", () => {
    const tracker = new StableHandTracker();
    const first = tracker.update(
      [candidate(0.2, "Right"), candidate(0.8, "Left")],
      0,
    );
    const leftTrackId = first[0].id;

    const second = tracker.update(
      [candidate(0.21, "Left", 0.55), candidate(0.79, "Right", 0.55)],
      33,
    );
    expect(
      second.find((track) => track.id === leftTrackId)!.landmarks[0][0],
    ).toBeLessThan(0.3);
  });

  test("uses motion continuity to keep identities while two hands cross", () => {
    const tracker = new StableHandTracker();
    const first = tracker.update(
      [candidate(0.2, "Right"), candidate(0.8, "Left")],
      0,
    );
    const movingRightId = first[0].id;
    tracker.update([candidate(0.4, "Right"), candidate(0.6, "Left")], 33);

    const crossed = tracker.update(
      [candidate(0.42, "Left"), candidate(0.58, "Right")],
      66,
    );
    expect(
      crossed.find((track) => track.id === movingRightId)!.landmarks[0][0],
    ).toBeGreaterThan(0.5);
  });
});
