import { expect, test } from "vitest";
import { ContinuousGestureReplay as GestureEngine } from './continuous-gesture-replay';

const viewport = { width: 1920, height: 1080 };
function pose(tip?: number) {
  const p = Array.from({ length: 21 }, () => [0.5, 0.7, 0]);
  p[0] = [0.5, 0.85, 0];
  p[9] = [0.5, 0.58, 0];
  p[4] = [0.32, 0.63, 0];
  p[6] = [0.42, 0.48, 0];
  p[8] = [0.42, 0.2, 0];
  p[10] = [0.5, 0.46, 0];
  p[12] = [0.5, 0.18, 0];
  p[14] = [0.58, 0.49, 0];
  p[16] = [0.58, 0.22, 0];
  p[18] = [0.66, 0.54, 0];
  p[20] = [0.66, 0.3, 0];
  if (tip) p[4] = [p[tip][0] + 0.005, p[tip][1], 0];
  return p;
}
function submit(engine: GestureEngine, time: number, tip?: number) {
  return engine.update(
    { landmarks: pose(tip), confidence: 0.95, timestamp: time },
    viewport,
  );
}

test.each([
  [8, "left"],
  [20, "right"],
] as const)(
  "rejects a brief %s pinch, then holds a deliberate %s pinch",
  (tip, button) => {
    const engine = new GestureEngine();
    submit(engine, 0);
    submit(engine, 200, tip);
    expect(submit(engine, 330, tip)).not.toContainEqual({
      type: "button-down",
      button,
    });
    expect(submit(engine, 440, tip)).toContainEqual({
      type: "button-down",
      button,
    });
    expect(submit(engine, 800, tip)).not.toContainEqual({
      type: "button-down",
      button,
    });
    submit(engine, 850);
    expect(submit(engine, 910)).toContainEqual({ type: "button-up", button });
  },
);

test("a stationary middle pinch toggles once and requires release before toggling again", () => {
  const engine = new GestureEngine();
  submit(engine, 0);
  submit(engine, 200, 12);
  expect(submit(engine, 400, 12).some((e) => e.type === "overlay-toggle")).toBe(
    false,
  );
  const toggle = submit(engine, 520, 12);
  expect(toggle.filter((e) => e.type === "overlay-toggle")).toHaveLength(1);
  expect(
    toggle.some(
      (e) =>
        e.type === "button-down" ||
        e.type === "workspace-switch" ||
        e.type === "scroll",
    ),
  ).toBe(false);
  expect(toggle.some((e) => e.type === "move")).toBe(true);
  expect(
    submit(engine, 1100, 12).some((e) => e.type === "overlay-toggle"),
  ).toBe(false);
  submit(engine, 1200);
  submit(engine, 1400);
  submit(engine, 1500, 12);
  expect(
    submit(engine, 1820, 12).filter((e) => e.type === "overlay-toggle"),
  ).toHaveLength(1);
});

test("a brief middle pinch cannot hide the overlay", () => {
  const engine = new GestureEngine();
  const events = [
    ...submit(engine, 0),
    ...submit(engine, 200, 12),
    ...submit(engine, 300, 12),
    ...submit(engine, 330),
    ...submit(engine, 700),
  ];
  expect(
    events.some((e) => e.type === "overlay-toggle" || e.type === "button-down"),
  ).toBe(false);
});

test("the old thumb-tucked swipe no longer toggles visibility", () => {
  const engine = new GestureEngine();
  const p = pose();
  p[4] = [0.47, 0.64, 0];
  submit(engine, 0);
  const events = [200, 600, 1000].flatMap((timestamp, i) =>
    engine.update(
      {
        landmarks: p.map(([x, y, z]) => [x + i * 0.1, y, z]),
        confidence: 0.95,
        timestamp,
      },
      viewport,
    ),
  );
  expect(events.some((e) => e.type === "overlay-toggle")).toBe(false);
});

test("tracking loss does not retrigger a middle pinch that is still closed", () => {
  const engine = new GestureEngine();
  submit(engine, 0);
  submit(engine, 200, 12);
  expect(submit(engine, 520, 12).some((e) => e.type === "overlay-toggle")).toBe(
    true,
  );
  engine.reset();
  submit(engine, 800, 12);
  submit(engine, 1000, 12);
  expect(
    submit(engine, 1500, 12).some((e) => e.type === "overlay-toggle"),
  ).toBe(false);
});

test.each([
  [8, 0.4],
  [20, 0.46],
] as const)(
  "a loose pinch at tip %s does not click even when held",
  (tip, ratio) => {
    const engine = new GestureEngine();
    const p = pose();
    p[4] = [p[tip][0] + ratio * 0.27, p[tip][1], 0];
    submit(engine, 0);
    const update = (timestamp: number) =>
      engine.update({ landmarks: p, confidence: 0.95, timestamp }, viewport);
    update(200);
    expect(update(1000).some((e) => e.type === "button-down")).toBe(false);
  },
);
