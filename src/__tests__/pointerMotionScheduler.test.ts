import { describe, expect, test } from "vitest";
import { PointerMotionScheduler } from "../spd/pointer-motion-scheduler";

describe("PointerMotionScheduler", () => {
  test("does not kick forward when a moving target reverses", () => {
    const scheduler = new PointerMotionScheduler();
    scheduler.setTarget({ x: 0.2, y: 0.5 }, 0);
    scheduler.setTarget({ x: 0.8, y: 0.5 }, 1);
    const before = scheduler.sample(34)!.x;
    scheduler.setTarget({ x: before - 0.01, y: 0.5 }, 34);
    expect(scheduler.sample(42)!.x).toBeLessThanOrEqual(before);
  });
  test("emits monotonic bounded samples between camera targets", () => {
    const scheduler = new PointerMotionScheduler();
    scheduler.setTarget({ x: 0.2, y: 0.5 }, 0);
    scheduler.setTarget({ x: 0.8, y: 0.5 }, 33);

    const xs = [41, 49, 57, 65].map((time) => scheduler.sample(time)!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs.every((x) => x >= 0.2 && x <= 0.8)).toBe(true);
  });

  test("never extrapolates past the latest clamped target", () => {
    const scheduler = new PointerMotionScheduler();
    scheduler.setTarget({ x: 0.5, y: 0.5 }, 0);
    scheduler.setTarget({ x: 2, y: -1 }, 16);

    const sample = scheduler.sample(1000)!;
    expect(sample.x).toBeLessThanOrEqual(1);
    expect(sample.y).toBeGreaterThanOrEqual(0);
  });

  test("returns no point after reset", () => {
    const scheduler = new PointerMotionScheduler();
    scheduler.setTarget({ x: 0.5, y: 0.5 }, 0);
    scheduler.reset();
    expect(scheduler.sample(8)).toBeNull();
  });

  test("stops producing native cursor positions when hand control is suspended", () => {
    const scheduler = new PointerMotionScheduler();
    scheduler.setTarget({ x: 0.4, y: 0.6 }, 0);
    scheduler.suspend();

    expect(scheduler.sample(8)).toBeNull();
  });
});
