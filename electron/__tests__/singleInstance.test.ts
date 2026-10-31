import { expect, test, vi } from "vitest";
import { claimSingleInstance } from "../core/single-instance";

test("quits a second instance", () => {
  const app = {
    requestSingleInstanceLock: () => false,
    quit: vi.fn(),
    on: vi.fn(),
  };
  expect(claimSingleInstance(app, vi.fn())).toBe(false);
  expect(app.quit).toHaveBeenCalledOnce();
});
