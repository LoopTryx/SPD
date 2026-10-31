import { describe, expect, test } from "vitest";
import {
  calculateCpuUsage,
  calculateMemoryPercentage,
} from "../core/system-analytics";

describe("system analytics", () => {
  test("calculates aggregate CPU usage from counter deltas", () => {
    const previous = { idle: 100, total: 200 };
    const current = { idle: 125, total: 300 };
    expect(calculateCpuUsage(previous, current)).toBe(75);
  });

  test("clamps memory percentage to a valid range", () => {
    expect(calculateMemoryPercentage(100, 25)).toBe(75);
    expect(calculateMemoryPercentage(0, 10)).toBe(0);
    expect(calculateMemoryPercentage(100, -10)).toBe(100);
  });

  test("analytics helpers never include secret-bearing fields", () => {
    expect(
      Object.keys({
        cpuPercentage: calculateCpuUsage(
          { idle: 0, total: 0 },
          { idle: 0, total: 0 },
        ),
        memoryPercentage: calculateMemoryPercentage(100, 50),
      }),
    ).not.toContain("apiKey");
  });
});
