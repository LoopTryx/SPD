import { describe, expect, test } from "vitest";
import {
  GestureEngine as RawGestureEngine,
  scrollDeltaForPalmMovement,
} from "../spd/gesture-engine";
import { ContinuousGestureReplay as GestureEngine } from './continuous-gesture-replay';
import { distance3d } from "../spd/geometry";

const viewport = { width: 1920, height: 1080 };

function hand(
  options: {
    indexPinch?: boolean;
    pinkyPinch?: boolean;
    ringPinch?: boolean;
    pointer?: [number, number];
    openPalm?: boolean;
    grip?: boolean;
    scrollPose?: boolean;
  } = {},
): number[][] {
  const points = Array.from({ length: 21 }, () => [0.5, 0.7, 0]);
  points[0] = [0.5, 0.85, 0];
  points[5] = [0.42, 0.62, 0];
  points[9] = [0.5, 0.58, 0];
  points[13] = [0.58, 0.62, 0];
  points[17] = [0.66, 0.68, 0];
  points[4] = options.pointer && !options.indexPinch && !options.scrollPose && !options.pinkyPinch && !options.ringPinch
    ? [...options.pointer,0] : [0.32,0.63,0];
  points[6] = [0.42, 0.48, 0];
  points[7] = [0.42, 0.35, 0];
  points[8] = [...(options.pointer && (options.indexPinch || options.scrollPose) ? options.pointer : [0.42,0.2]),0];
  points[10] = [0.5, 0.46, 0];
  points[11] = [0.5, 0.33, 0];
  points[12] = [0.5, 0.18, 0];
  points[14] = [0.58, 0.49, 0];
  points[15] = [0.58, 0.37, 0];
  points[16] = [0.58, 0.22, 0];
  points[18] = [0.66, 0.54, 0];
  points[19] = [0.66, 0.43, 0];
  points[20] = [0.66, 0.3, 0];

  if (options.indexPinch)
    points[4] = [points[8][0] + 0.01, points[8][1] + 0.01, 0];
  if (options.pinkyPinch)
    points[4] = [points[20][0] + 0.01, points[20][1] + 0.01, 0];
  if (options.ringPinch) {
    points[16] = [0.5, 0.58, 0];
    points[4] = [0.49, 0.58, 0];
  }
  if (options.openPalm) points[4] = [0.47, 0.64, 0];
  if (options.grip) {
    points[12] = [0.5, 0.62, 0];
    points[16] = [0.58, 0.65, 0];
    points[20] = [0.66, 0.68, 0];
  }
  if (options.scrollPose) {
    const verticalOffset = points[8][1] - 0.2;
    points[6] = [points[8][0], 0.48 + verticalOffset, 0];
    points[7] = [points[8][0], 0.35 + verticalOffset, 0];
    points[10] = [points[8][0] + 0.012, 0.46 + verticalOffset, 0];
    points[11] = [points[8][0] + 0.012, 0.33 + verticalOffset, 0];
    points[12] = [points[8][0] + 0.012, points[8][1] + 0.008, 0];
    points[16] = [0.58, 0.65, 0];
    points[20] = [0.66, 0.68, 0];
  }
  return points;
}

function translateHand(points: number[][], dx: number, dy = 0): number[][] {
  return points.map(([x, y, z]) => [x + dx, y + dy, z]);
}

function scaleHand(points: number[][], factor: number): number[][] {
  const [originX, originY, originZ] = points[0];
  return points.map(([x, y, z]) => [
    originX + (x - originX) * factor,
    originY + (y - originY) * factor,
    originZ + (z - originZ) * factor,
  ]);
}

function setThumbPinchRatio(
  points: number[][],
  tipIndex: number,
  ratio: number,
): number[][] {
  const copy = points.map((point) => [...point]);
  const palmScale = distance3d(copy[0], copy[9]);
  copy[4] = [
    copy[tipIndex][0] - ratio * palmScale,
    copy[tipIndex][1],
    copy[tipIndex][2],
  ];
  return copy;
}

function frame(landmarks: number[][], timestamp: number, confidence = 0.95) {
  // Fixture timestamps are literal milliseconds.
  return { landmarks, timestamp, confidence };
}

describe("SPD geometry and smoothing", () => {
  test("uses Phase 2 high-sensitivity bounded scrolling", () => {
    expect(scrollDeltaForPalmMovement(0.1)).toBe(-90);
    expect(scrollDeltaForPalmMovement(-0.1)).toBe(90);
    expect(scrollDeltaForPalmMovement(2)).toBe(-1200);
  });

  test("measures normalized landmark distance", () => {
    expect(distance3d([0, 0, 0], [3, 4, 0])).toBe(5);
  });

});

describe("GestureEngine", () => {
  test('replays 100 deliberate left clicks without an extra or missing press', () => {
    const engine = new GestureEngine();
    const events: Array<{ type: string; button?: string }> = [];
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    for (let index = 0; index < 100; index++) {
      const start = 700 + index * 500;
      events.push(...engine.update(frame(hand({ indexPinch: true }), start), viewport));
      events.push(...engine.update(frame(hand({ indexPinch: true }), start + 240), viewport));
      events.push(...engine.update(frame(hand(), start + 300), viewport));
      events.push(...engine.update(frame(hand(), start + 400), viewport));
    }
    expect(events.filter(event => event.type === 'button-down' && event.button === 'left')).toHaveLength(100);
    expect(events.filter(event => event.type === 'button-up' && event.button === 'left')).toHaveLength(100);
  });
  test("keeps the thumb as the click anchor and translates a held drag with the hand", () => {
    const engine = new GestureEngine();
    const open = hand();
    const pinch = hand({ indexPinch: true, pointer: [0.49, 0.25] });
    engine.update(frame(open, 0), viewport);
    const hover = engine.update(frame(open, 600), viewport).find(event => event.type === "move");
    const candidate = engine.update(frame(pinch, 640), viewport);
    const approach = candidate.find(event => event.type === 'move')!;
    expect(approach.x).toBeLessThan(hover!.x);
    expect(approach.x).toBeCloseTo(.5, 6);
    expect(approach.x).toBeLessThan(.5084);
    const pressed = engine.update(frame(pinch, 900), viewport);
    expect(pressed).toContainEqual({ type: "button-down", button: "left" });
    const midpoint = pressed.find(event => event.type === 'move')!;
    expect(midpoint.x).toBeCloseTo(.5,3);
    expect(midpoint.y).toBeCloseTo(.1,3);
    const drag = engine.update(frame(translateHand(pinch, 0.05), 1000), viewport);
    expect(drag.find(event => event.type === "move")?.x).toBeCloseTo(midpoint.x - 0.05 / 0.6, 3);
  });
  test("counts workspace swipe motion during the hold interval", () => {
    const engine = new GestureEngine();
    const pose = hand({ ringPinch: true });
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(pose, 640), viewport);
    engine.update(frame(translateHand(pose, 0.05), 760), viewport);
    expect(
      engine.update(frame(translateHand(pose, 0.1), 900), viewport),
    ).toContainEqual({ type: "workspace-switch", direction: "next" });
  });
  test.each(["workspace"] as const)(
    "keeps pointer updates live during %s swipes",
    (kind) => {
      const engine = new GestureEngine();
      const pose =
        kind === "workspace"
          ? hand({ ringPinch: true })
          : hand({ openPalm: true });
      engine.update(frame(hand(), 0), viewport);
      engine.update(frame(pose, 600), viewport);
      engine.update(frame(pose, 1200), viewport);
      const events = engine.update(
        frame(translateHand(pose, 0.04), 1300),
        viewport,
      );
      expect(events.some((event) => event.type === "move")).toBe(true);
    },
  );
  test.each([0.2, 1, 3])(
    "scroll movement is independent of world-pose scale %s",
    (scale) => {
      const engine = new GestureEngine();
      const pose = hand({ scrollPose: true, pointer: [0.5, 0.35] });
      const submit = (points: number[][], timestamp: number) =>
        engine.update(
          {
            ...frame(points, timestamp),
            poseLandmarks: scaleHand(points, scale),
          },
          viewport,
        );
      submit(hand(), 0);
      submit(pose, 600);
      submit(pose, 880);
      expect(submit(translateHand(pose, 0, 0.027), 960)).toContainEqual({
        type: "scroll",
        delta: -90,
      });
    },
  );
  test("arms a deliberate click quickly after a stable hand appears", () => {
    const engine = new GestureEngine();
    const pinch = hand({ indexPinch: true });
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 240), viewport);
    engine.update(frame(pinch, 260), viewport);

    expect(engine.update(frame(pinch, 480), viewport)).toContainEqual({
      type: "button-down",
      button: "left",
    });
  });

  test("rejects a depth-only pinch across a visible camera gap, then accepts agreeing contact", () => {
    const engine = new GestureEngine();
    const frozen = hand({ pointer: [0.8, 0.5] });
    const livePinch = hand({ indexPinch: true, pointer: [0.8, 0.5] });
    engine.update({ ...frame(frozen, 0), poseLandmarks: hand() }, viewport);
    engine.update({ ...frame(frozen, 600), poseLandmarks: hand() }, viewport);
    engine.update(
      { ...frame(frozen, 640), poseLandmarks: livePinch },
      viewport,
    );

    expect(
      engine.update(
        { ...frame(frozen, 900), poseLandmarks: livePinch },
        viewport,
      ),
    ).not.toContainEqual({ type: "button-down", button: "left" });
    engine.update({ ...frame(livePinch, 940), poseLandmarks:livePinch },viewport);
    expect(engine.update({ ...frame(livePinch, 1200),poseLandmarks:livePinch },viewport))
      .toContainEqual({type:'button-down',button:'left'});
  });

  test.each([
    ["left", 8, 0.10],
    ["right", 20, 0.12],
  ] as const)("accepts a deliberate firm %s pinch", (button, tip, ratio) => {
    const engine = new GestureEngine();
    const pinch = setThumbPinchRatio(hand(), tip, ratio);
    if (button === "right") {
      const palmScale = distance3d(pinch[0], pinch[9]);
      pinch[4] = [pinch[20][0] + ratio * palmScale, pinch[20][1], pinch[20][2]];
    }
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(pinch, 640), viewport);

    expect(engine.update(frame(pinch, 900), viewport)).toContainEqual({
      type: "button-down",
      button,
    });
  });

  test("keeps recognizing a deliberate pinch through usable confidence flicker", () => {
    const engine = new GestureEngine();
    const pinch = hand({ indexPinch: true });
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(pinch, 640, 0.65), viewport);

    expect(engine.update(frame(pinch, 900, 0.65), viewport)).toContainEqual({
      type: "button-down",
      button: "left",
    });
  });

  test("accepts an index pinch when two other fingers remain clearly extended", () => {
    const engine = new GestureEngine();
    const pinch = hand({ indexPinch: true });
    pinch[16] = [0.58, 0.6, 0];
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(pinch, 640), viewport);

    expect(engine.update(frame(pinch, 900), viewport)).toContainEqual({
      type: "button-down",
      button: "left",
    });
  });

  test("prioritizes an armed ring pinch and switches after a compact deliberate swipe", () => {
    const engine = new GestureEngine();
    const ringPinch = setThumbPinchRatio(hand({ ringPinch: true }), 16, 0.12);
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(ringPinch, 640), viewport);
    engine.update(frame(ringPinch, 920), viewport);

    expect(
      engine.update(frame(translateHand(ringPinch, 0.1), 1040), viewport),
    ).toContainEqual({ type: "workspace-switch", direction: "next" });
  });

  test("maps the centered 60% camera workspace to both desktop edges", () => {
    const leftEdge = new GestureEngine().update(
      frame(hand({ pointer: [0.8, 0.5] }), 0),
      viewport,
    );
    const rightEdge = new GestureEngine().update(
      frame(hand({ pointer: [0.2, 0.5] }), 0),
      viewport,
    );
    const interior = new GestureEngine().update(
      frame(hand({ pointer: [0.35, 0.5] }), 0),
      viewport,
    );

    expect(leftEdge).toContainEqual({ type: "move", x: 0, y: 0.5 });
    expect(rightEdge).toContainEqual({ type: "move", x: 1, y: 0.5 });
    expect(interior).toContainEqual({ type: "move", x: 0.75, y: 0.5 });
  });

  test("emits the current stabilized camera target without internal pointer filtering", () => {
    const engine = new GestureEngine();
    const open = (x:number) => hand({pointer:[x,.5]});
    engine.update(frame(open(.5), 0), viewport);
    const events = engine.update(
      frame(open(.35), 66),
      viewport,
    );

    expect(events).toContainEqual({ type: "move", x: 0.75, y: 0.5 });
  });

  test("clamps pointer motion beyond the 60% workspace to a stable screen edge", () => {
    const overreach = new GestureEngine().update(
      frame(hand({ pointer: [0.95, 0.9] }), 0),
      viewport,
    );
    expect(overreach).toContainEqual({ type: "move", x: 0, y: 1 });
  });

  test("emits no events when the same camera frame is submitted twice", () => {
    const engine = new GestureEngine();
    expect(
      engine
        .update(frame(hand(), 200), viewport)
        .some((event) => event.type === "move"),
    ).toBe(true);
    expect(engine.update(frame(hand(), 200), viewport)).toEqual([]);
  });

  test("holds the left button until the index-thumb pinch is released", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(hand({ indexPinch: true }), 640), viewport);
    expect(
      engine.update(frame(hand({ indexPinch: true }), 900), viewport),
    ).toContainEqual({ type: "button-down", button: "left" });
    expect(
      engine.update(frame(hand({ indexPinch: true }), 1000), viewport),
    ).not.toContainEqual({ type: "button-down", button: "left" });
    expect(engine.update(frame(hand(), 1100), viewport)).not.toContainEqual({
      type: "button-up",
      button: "left",
    });
    expect(engine.update(frame(hand(), 1200), viewport)).toContainEqual({
      type: "button-up",
      button: "left",
    });
  });

  test("holds the right button until the pinky-thumb pinch is released", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(hand({ pinkyPinch: true }), 640), viewport);
    expect(
      engine.update(frame(hand({ pinkyPinch: true }), 900), viewport),
    ).toContainEqual({ type: "button-down", button: "right" });
    expect(engine.update(frame(hand(), 1000), viewport)).not.toContainEqual({
      type: "button-up",
      button: "right",
    });
    expect(engine.update(frame(hand(), 1100), viewport)).toContainEqual({
      type: "button-up",
      button: "right",
    });
  });

  test("keeps a held pinch down while its distance is inside the release hysteresis band", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(hand({ indexPinch: true }), 640), viewport);
    engine.update(frame(hand({ indexPinch: true }), 900), viewport);

    const uncertain = setThumbPinchRatio(hand(), 8, 0.20);
    expect(engine.update(frame(uncertain, 1000), viewport)).not.toContainEqual({
      type: "button-up",
      button: "left",
    });
    expect(
      engine.update(frame(setThumbPinchRatio(hand(), 8, 0.62), 1160), viewport),
    ).not.toContainEqual({ type: "button-up", button: "left" });
    expect(
      engine.update(frame(setThumbPinchRatio(hand(), 8, 0.62), 1260), viewport),
    ).toContainEqual({ type: "button-up", button: "left" });
  });

  test("recognizes the same pinch at very different camera hand sizes", () => {
    for (const factor of [0.08, 1.6]) {
      const engine = new GestureEngine();
      engine.update(frame(scaleHand(hand(), factor), 0), viewport);
      engine.update(frame(scaleHand(hand(), factor), 600), viewport);
      engine.update(
        frame(scaleHand(hand({ indexPinch: true }), factor), 640),
        viewport,
      );
      expect(
        engine.update(
          frame(scaleHand(hand({ indexPinch: true }), factor), 900),
          viewport,
        ),
      ).toContainEqual({ type: "button-down", button: "left" });
    }
  });

  test("rejects ambiguous thumb contact with multiple curled fingers", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    const grip=hand({ indexPinch: true, grip: true });
    grip[12]=[grip[4][0]+.005,grip[4][1]+.005,0];
    engine.update(frame(grip, 640), viewport);
    expect(
      engine.update(
        frame(grip, 1000),
        viewport,
      ),
    ).not.toContainEqual({ type: "button-down", button: "left" });
  });

  test("requires a pinch to remain spatially stable before pressing", () => {
    const engine = new RawGestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 200), viewport);
    engine.update(frame(hand(), 400), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(
      frame(hand({ indexPinch: true, pointer: [0.45, 0.4] }), 640),
      viewport,
    );
    expect(
      engine.update(
        frame(hand({ indexPinch: true, pointer: [0.55, 0.4] }), 920),
        viewport,
      ),
    ).not.toContainEqual({ type: "button-down", button: "left" });
  });

  test("scrolls vertically while the extended index and middle fingertips are joined", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(
      frame(hand({ scrollPose: true, pointer: [0.5, 0.35] }), 640),
      viewport,
    );
    engine.update(
      frame(hand({ scrollPose: true, pointer: [0.5, 0.35] }), 960),
      viewport,
    );
    const events = engine.update(
      frame(hand({ scrollPose: true, pointer: [0.5, 0.45] }), 1040),
      viewport,
    );
    expect(
      events.some((event) => event.type === "scroll" && event.delta < 0),
    ).toBe(true);
    expect(events.some((event) => event.type === "button-down")).toBe(false);
  });

  test("continues scrolling through a 100 ms pose dropout", () => {
    const engine = new GestureEngine();
    const pose = hand({ scrollPose: true, pointer: [0.5, 0.35] });
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 300), viewport);
    engine.update(frame(pose, 320), viewport);
    engine.update(frame(pose, 440), viewport);
    engine.update(frame(hand(), 500), viewport);

    const events = engine.update(
      frame(translateHand(pose, 0, 0.027), 540),
      viewport,
    );
    expect(events).toContainEqual({ type: "scroll", delta: -90 });
  });

  test.each([0.08, 0.32])(
    "uses palm-normalized scroll output at palm size %s",
    (palmSize) => {
      const engine = new GestureEngine();
      const base = hand({ scrollPose: true, pointer: [0.5, 0.35] });
      const factor = palmSize / distance3d(base[0], base[9]);
      const pose = scaleHand(base, factor);
      engine.update(frame(scaleHand(hand(), factor), 0), viewport);
      engine.update(frame(scaleHand(hand(), factor), 600), viewport);
      engine.update(frame(pose, 640), viewport);
      engine.update(frame(pose, 880), viewport);

      const events = engine.update(
        frame(translateHand(pose, 0, palmSize * 0.1), 960),
        viewport,
      );
      expect(events).toContainEqual({ type: "scroll", delta: -90 });
    },
  );

  test("does not classify a joined index-middle scroll pose as a workspace swipe", () => {
    const engine = new GestureEngine();
    const pose = setThumbPinchRatio(hand({ scrollPose: true }), 16, 0.2);
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(pose, 640), viewport);
    engine.update(frame(pose, 1040), viewport);

    expect(
      engine.update(frame(translateHand(pose, 0.16), 1200), viewport),
    ).not.toContainEqual({ type: "workspace-switch", direction: "next" });
  });

  test("treats a top-right index pinch as a normal left-button hold", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(
      frame(hand({ indexPinch: true, pointer: [0.05, 0.08] }), 640),
      viewport,
    );
    const events = engine.update(
      frame(hand({ indexPinch: true, pointer: [0.05, 0.08] }), 900),
      viewport,
    );
    expect(events).toContainEqual({ type: "button-down", button: "left" });
  });

  test("switches Windows workspaces once per held ring-thumb swipe", () => {
    const engine = new GestureEngine();
    const pinch = hand({ ringPinch: true });
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(pinch, 640), viewport);
    engine.update(frame(pinch, 1040), viewport);

    expect(
      engine.update(frame(translateHand(pinch, 0.16), 1200), viewport),
    ).toContainEqual({ type: "workspace-switch", direction: "next" });
    expect(
      engine.update(frame(translateHand(pinch, 0.22), 1520), viewport),
    ).not.toContainEqual({ type: "workspace-switch", direction: "next" });

    engine.update(frame(hand(), 1800), viewport);
    engine.update(frame(pinch, 2000), viewport);
    engine.update(frame(pinch, 2400), viewport);
    expect(
      engine.update(frame(translateHand(pinch, -0.16), 2560), viewport),
    ).toContainEqual({ type: "workspace-switch", direction: "previous" });
  });

  test("releases a held button on the first low-confidence frame", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(hand({ indexPinch: true }), 640), viewport);
    engine.update(frame(hand({ indexPinch: true }), 900), viewport);
    expect(
      engine.update(frame(hand({ indexPinch: true }), 1000, 0.2), viewport),
    ).toContainEqual({ type: "button-up", button: "left" });
    expect(
      engine.update(frame(hand({ indexPinch: true }), 1260, 0.2), viewport),
    ).not.toContainEqual({ type: "button-up", button: "left" });
  });

  test("reset releases every held button after complete tracking loss", () => {
    const engine = new GestureEngine();
    engine.update(frame(hand(), 0), viewport);
    engine.update(frame(hand(), 600), viewport);
    engine.update(frame(hand({ indexPinch: true }), 640), viewport);
    engine.update(frame(hand({ indexPinch: true }), 900), viewport);
    expect(engine.reset()).toContainEqual({
      type: "button-up",
      button: "left",
    });
  });
});
