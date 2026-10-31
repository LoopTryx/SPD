import { describe, expect, test } from "vitest";
import { PointerMotionFilter } from "../spd/pointer-motion-filter";

describe("PointerMotionFilter", () => {
  test.each([15, 30, 60])("does not treat filter lag as continued motion at %sfps", fps => {
    const filter = new PointerMotionFilter();
    filter.update({ x: 0.2, y: 0.5 }, 0);
    const first = filter.update({ x: 0.5, y: 0.5 }, 1000 / fps).x;
    const second = filter.update({ x: 0.5, y: 0.5 }, 2000 / fps).x;
    const firstFraction = (first - 0.2) / 0.3;
    const secondFraction = (second - first) / (0.5 - first);
    expect(second).toBeGreaterThan(first);
    expect(secondFraction).toBeLessThan(firstFraction);
  });

  test("damps sub-pixel noise but follows deliberate motion quickly", () => {
    const filter = new PointerMotionFilter();
    filter.update({ x: 0.5, y: 0.5 }, 0);

    expect(filter.update({ x: 0.5002, y: 0.4998 }, 16)).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(filter.update({ x: 0.8, y: 0.5 }, 32).x).toBeGreaterThan(0.62);
  });

  test("rejects one impossible jump and accepts the confirming frame", () => {
    const filter = new PointerMotionFilter();
    filter.update({ x: 0.3, y: 0.5 }, 0);

    expect(filter.update({ x: 0.9, y: 0.5 }, 33)).toEqual({ x: 0.3, y: 0.5 });
    expect(filter.update({ x: 0.89, y: 0.5 }, 66).x).toBeGreaterThan(0.5);
  });

  test("clamps output and clears state on reset", () => {
    const filter = new PointerMotionFilter();
    expect(filter.update({ x: -1, y: 2 }, 0)).toEqual({ x: 0, y: 1 });
    filter.reset();
    expect(filter.update({ x: 0.25, y: 0.75 }, 10)).toEqual({
      x: 0.25,
      y: 0.75,
    });
  });
});
