import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => process.cwd() },
  screen: {
    getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1001, height: 801 } }),
    getAllDisplays: () => [{ id: 2, workArea: { x: -1000, y: -400, width: 1001, height: 801 } }],
    dipToScreenPoint: (p: {x: number; y: number}) => ({ x: p.x * 2, y: p.y * 2 }),
  },
}));
vi.mock("child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "child_process";
import { CursorController } from "../desktop/cursor-controller";
import { fakeHelper } from "./native-test-utils";
let cursor: CursorController;
let child: ReturnType<typeof fakeHelper>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(10000); vi.clearAllMocks();
  child = fakeHelper(); vi.mocked(spawn).mockReturnValue(child as never); cursor = new CursorController();
});
afterEach(() => { void cursor.stop(); vi.runAllTimers(); vi.useRealTimers(); });
async function lease() { const result = cursor.renewLease(Date.now()); child.ack(); expect(await result).toBe(true); }

test("input requires an explicitly acknowledged fresh lease", async () => {
  expect(await cursor.setButton("left", true)).toBe(false); expect(spawn).not.toHaveBeenCalled();
  const result = cursor.renewLease(9900);
  expect(child.sent[0]).toMatchObject({ type: "lease", seq: 1, expiresAt: 10150, capturedAt: 9900 });
  let settled = false; void result.then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false); child.ack(); expect(await result).toBe(true);
  const down = cursor.setButton("left", true); child.ack(); expect(await down).toBe(true);
  expect(child.sent[1]).toMatchObject({ type: "button", button: "left", pressed: true, seq: 2, expiresAt: 10150, session: child.sent[0].session });
});
test.each([NaN, Infinity, 9750, 10001])("rejects invalid, stale or future lease %s", async (timestamp) => {
  expect(await cursor.renewLease(timestamp)).toBe(false); expect(spawn).not.toHaveBeenCalled();
});
test("input does not renew lease and overdue acknowledgements settle false", async () => {
  await lease(); vi.advanceTimersByTime(100);
  const down = cursor.setButton("left", true); child.ack(); expect(await down).toBe(true);
  const move = cursor.moveNormalized(0.5, 0.5);
  vi.advanceTimersByTime(151); expect(await move).toBe(false);
  expect(await cursor.setButton("right", true)).toBe(false); expect(spawn).toHaveBeenCalledTimes(1);
});
test("selected display DIP work area maps to physical coordinates with negative origins", async () => {
  await lease(); expect(await cursor.setDisplayId(2)).toBe(true);
  const move = cursor.moveNormalized(0.25, 0.5); child.ack(); expect(await move).toBe(true);
  expect(child.sent.at(-1)).toMatchObject({ type: "move", x: -1500, y: 0 });
  expect(await cursor.moveNormalized(NaN, 1)).toBe(false); expect(await cursor.moveNormalized(2, 1)).toBe(false);
  expect(await cursor.setDisplayId(99)).toBe(false);
});
test("bounds wheel movement and reports native rejection", async () => {
  await lease(); const wheel = cursor.scroll(9000);
  expect(child.sent.at(-1)).toMatchObject({ type: "scroll", delta: 1200 }); child.ack(); expect(await wheel).toBe(true);
  expect(await cursor.scroll(NaN)).toBe(false); expect(await cursor.switchWorkspace("bad" as never)).toBe(false);
  const workspace = cursor.switchWorkspace("previous"); expect(child.sent.at(-1)).toMatchObject({ type: "workspace", direction: "previous" });
  child.ack(undefined, false); expect(await workspace).toBe(false);
});
test("coalesces adjacent queued motion while preserving button order", async () => {
  await lease(); const first = cursor.moveNormalized(0, 0); const old = cursor.moveNormalized(0.1, 0.1);
  const latest = cursor.moveNormalized(0.2, 0.2); const press = cursor.setButton("left", true); const last = cursor.moveNormalized(1, 1);
  expect(await old).toBe(false); expect(child.sent).toHaveLength(2);
  child.ack(); expect(await first).toBe(true); expect(child.sent.at(-1)).toMatchObject({ type: "move", x: 400, y: 320 });
  child.ack(); expect(await latest).toBe(true); expect(child.sent.at(-1)).toMatchObject({ type: "button", pressed: true });
  child.ack(); expect(await press).toBe(true); child.ack(); expect(await last).toBe(true);
});
test("queue overflow fails closed and settles all outstanding promises", async () => {
  await lease(); const work = Array.from({ length: 100 }, () => cursor.scroll(1)); vi.advanceTimersByTime(251);
  expect((await Promise.all(work)).every((ok) => !ok)).toBe(true); expect(child.sent.length).toBeLessThan(5);
  expect(await cursor.setButton("left", true)).toBe(false);
});
