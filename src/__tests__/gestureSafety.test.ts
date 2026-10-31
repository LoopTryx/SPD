import { describe, expect, test } from "vitest";
import { GestureEngine, isNeutralHand } from "../spd/gesture-engine";
import { GestureCoordinator } from "../spd/gesture-coordinator";

const viewport = { width: 1920, height: 1080 };
function pose(tip?: number): number[][] {
  const p = Array.from({ length: 21 }, () => [0.5, 0.7, 0]);
  p[0] = [0.5, 0.85, 0]; p[9] = [0.5, 0.58, 0];
  p[4] = [0.32, 0.63, 0];
  p[6] = [0.42, 0.48, 0]; p[8] = [0.42, 0.2, 0];
  p[10] = [0.5, 0.46, 0]; p[12] = [0.5, 0.18, 0];
  p[14] = [0.58, 0.49, 0]; p[16] = [0.58, 0.22, 0];
  p[18] = [0.66, 0.54, 0]; p[20] = [0.66, 0.3, 0];
  if (tip) p[4] = [p[tip][0] + 0.005, p[tip][1], 0];
  return p;
}
function frame(timestamp: number, trackId = 1, tip?: number) {
  return { landmarks: pose(tip), confidence: 0.95, timestamp, trackId };
}
function pressed(engine: GestureEngine) {
  engine.update(frame(0), viewport);
  engine.update(frame(200, 1, 8), viewport);
  expect(engine.update(frame(420, 1, 8), viewport)).toContainEqual({ type: "button-down", button: "left" });
}

describe("gesture interruption safety", () => {
  test.each(["reset", "cancelGestures"] as const)("%s requires neutral before another click", method => {
    const engine = new GestureEngine();
    pressed(engine);
    expect(engine[method]()).toContainEqual({ type: "button-up", button: "left" });
    expect([500, 700, 1000].flatMap(t => engine.update(frame(t, 1, 8), viewport)).some(e => e.type === "button-down")).toBe(false);
    engine.update(frame(1100), viewport);
    engine.update(frame(1300, 1, 8), viewport);
    expect(engine.update(frame(1520, 1, 8), viewport)).toContainEqual({ type: "button-down", button: "left" });
  });
  test("changing IDs releases a held button and blocks the new closed hand", () => {
    const engine = new GestureEngine();
    pressed(engine);
    expect(engine.update(frame(450, 2, 8), viewport)).toContainEqual({ type: "button-up", button: "left" });
    expect([650, 1000].flatMap(t => engine.update(frame(t, 2, 8), viewport)).some(e => e.type === "button-down")).toBe(false);
  });
  test.each(["confidence", "landmarks", "timestamp", "low confidence"] as const)("invalid %s immediately releases and requires neutral rearm", kind => {
    const engine = new GestureEngine();
    pressed(engine);
    const invalid = frame(450, 1, 8);
    if (kind === "confidence") invalid.confidence = NaN;
    if (kind === "low confidence") invalid.confidence = 0.2;
    if (kind === "landmarks") invalid.landmarks[4][0] = NaN;
    if (kind === "timestamp") invalid.timestamp = NaN;
    expect(engine.update(invalid, viewport)).toContainEqual({ type: "button-up", button: "left" });
    expect([650, 1000].flatMap(t => engine.update(frame(t, 1, 8), viewport)).some(e => e.type === "button-down")).toBe(false);
  });
  test.each([8, 12, 16, 20])("closed tip %s cannot arm on startup", tip => {
    const engine = new GestureEngine();
    const events = [0, 200, 600, 1000].flatMap(t => engine.update(frame(t, 1, tip), viewport));
    expect(events.every(e => e.type === "move")).toBe(true);
  });
});

describe("neutral hand gate", () => {
  test("accepts open pinches and rejects every closed pinch", () => {
    expect(isNeutralHand(pose())).toBe(true);
    for (const tip of [8, 12, 16, 20]) expect(isNeutralHand(pose(tip))).toBe(false);
  });
  test.each([8, 12, 16, 20])("requires an open margin of 0.45 palm lengths at tip %s", tip => {
    const p = pose();
    p[4] = [0, 0, 0]; p[0] = [0, 1, 0]; p[9] = [0, 2, 0];
    for (const other of [8, 12, 16, 20]) p[other] = [0.9, 0, 0];
    p[tip] = [0.45, 0, 0];
    expect(isNeutralHand(p)).toBe(true);
    p[tip] = [0.449, 0, 0];
    expect(isNeutralHand(p)).toBe(false);
  });
  test("rejects two-finger scrolling even with the thumb open", () => {
    const p = pose();
    p[12] = [0.43, 0.2, 0]; p[16] = [0.58, 0.65, 0]; p[20] = [0.66, 0.68, 0];
    expect(isNeutralHand(p)).toBe(false);
  });
  test("rejects incomplete, nonfinite, and degenerate geometry", () => {
    expect(isNeutralHand([])).toBe(false);
    const p = pose(); p[0] = [...p[9]];
    expect(isNeutralHand(p)).toBe(false);
    const invalid = pose(); invalid[4][0] = NaN;
    expect(isNeutralHand(invalid)).toBe(false);
  });
});

describe("elapsed hand roles", () => {
  test.each([
    ["deliberate", 300], ["balanced", 140], ["responsive", 110],
  ] as const)("%s sensitivity uses %sms click dwell in either role", (preset, dwell) => {
    for (const dual of [false, true]) {
      const c = new GestureCoordinator();
      c.setSensitivity(preset);
      c.update(frame(0), dual ? frame(0, 2) : null, viewport);
      c.update(frame(300), dual ? frame(300, 2) : null, viewport);
      const submit = (t: number) => c.update(frame(t, 1, dual ? undefined : 8), dual ? frame(t, 2, 8) : null, viewport);
      submit(500);
      expect(submit(500 + dwell - 1).some(e => e.type === "button-down")).toBe(false);
      expect(submit(500 + dwell)).toContainEqual({ type: "button-down", button: "left" });
      expect(c.setSensitivity("balanced")).toContainEqual({ type: "button-up", button: "left" });
      expect([1000, 1300, 1600].flatMap(submit).some(e => e.type === "button-down")).toBe(false);
    }
  });

  test.each([15, 30, 60])("acquires at 300ms and exits after 400ms absence at %sfps", fps => {
    const c = new GestureCoordinator();
    for (let sample = 0; sample * 1000 / fps < 300; sample++) {
      const t = sample * 1000 / fps;
      c.update(frame(t), frame(t, 2), viewport);
      expect(c.snapshot().dualHandMode).toBe(false);
    }
    c.update(frame(300), frame(300, 2), viewport);
    expect(c.snapshot().dualHandMode).toBe(true);
    for (let sample = 0; sample * 1000 / fps < 400; sample++) {
      c.update(frame(500 + sample * 1000 / fps), null, viewport);
      expect(c.snapshot().dualHandMode).toBe(true);
    }
    c.update(frame(900), null, viewport);
    expect(c.snapshot().dualHandMode).toBe(false);
  });
  test("secondary ID changes restart acquisition", () => {
    const c = new GestureCoordinator();
    c.update(frame(0), frame(0, 2), viewport);
    c.update(frame(200), frame(200, 3), viewport);
    c.update(frame(300), frame(300, 3), viewport);
    c.update(frame(400), frame(400, 3), viewport);
    expect(c.snapshot().dualHandMode).toBe(false);
    c.update(frame(500), frame(500, 3), viewport);
    expect(c.snapshot().dualHandMode).toBe(true);
  });
  test.each(["primary", "secondary", "swap", "absent"] as const)("releases a secondary drag when %s ownership changes", change => {
    const c = new GestureCoordinator();
    c.update(frame(0), frame(0, 2), viewport);
    c.update(frame(300), frame(300, 2), viewport);
    c.update(frame(500), frame(500, 2, 8), viewport);
    expect(c.update(frame(720), frame(720, 2, 8), viewport)).toContainEqual({ type: "button-down", button: "left" });
    const primaryId = change === "primary" ? 3 : change === "swap" ? 2 : 1;
    const secondaryId = change === "secondary" ? 3 : change === "swap" ? 1 : 2;
    expect(c.update(frame(750, primaryId), change === "absent" ? null : frame(750, secondaryId, 8), viewport)).toContainEqual({ type: "button-up", button: "left" });
    const events = [900, 1100, 1400].flatMap(t => c.update(frame(t, primaryId, 8), change === "absent" ? null : frame(t, secondaryId, 8), viewport));
    expect(events.some(e => e.type === "button-down")).toBe(false);
  });
});

test.each([15, 30, 60])("preserves click140 and overlay300 dwell at %sfps", fps => {
  for (const [tip, dwell, event] of [[8, 140, "button-down"], [20, 140, "button-down"], [12, 300, "overlay-toggle"]] as const) {
    const engine = new GestureEngine();
    engine.update(frame(0), viewport);
    const emitted: number[] = [];
    for (let sample = 0; sample <= Math.ceil(400 * fps / 1000); sample++) {
      const elapsed = sample * 1000 / fps;
      if (engine.update(frame(200 + elapsed, 1, tip), viewport).some(e => e.type === event)) emitted.push(elapsed);
    }
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBeGreaterThanOrEqual(dwell);
    expect(emitted[0]).toBeLessThan(dwell + 1000 / fps);
  }
});
