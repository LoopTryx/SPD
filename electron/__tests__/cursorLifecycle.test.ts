import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() }, screen: {} }));
vi.mock("child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "child_process";
import { CursorController } from "../desktop/cursor-controller";
import { fakeHelper } from "./native-test-utils";
let child: ReturnType<typeof fakeHelper>;
let cursor: CursorController;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(10000); vi.clearAllMocks();
  child = fakeHelper(); vi.mocked(spawn).mockReturnValue(child as never); cursor = new CursorController();
});
afterEach(() => { void cursor.stop(); vi.runAllTimers(); vi.useRealTimers(); });
async function lease() { const result = cursor.renewLease(Date.now()); child.ack(); expect(await result).toBe(true); }
test("stop terminates child; only an explicit fresh lease can restart without replay", async () => {
  await lease(); const down = cursor.setButton("left", true); child.ack(); await down;
  const stopping = cursor.stop(); expect(child.sent.at(-1)).toMatchObject({ type: "stop", seq: 3 }); child.ack(); expect(await stopping).toBe(true);
  expect(child.stdin.end).toHaveBeenCalled(); expect(await cursor.setButton("left", true)).toBe(false); expect(spawn).toHaveBeenCalledTimes(1);
  const current = fakeHelper(); vi.mocked(spawn).mockReturnValue(current as never);
  vi.advanceTimersByTime(1); const fresh = cursor.renewLease(Date.now()); current.ack(); expect(await fresh).toBe(true);
  child.emit("exit", 0); expect(current.sent.map((c) => c.type)).toEqual(["lease"]);
  const press = cursor.setButton("right", true); current.ack(); expect(await press).toBe(true);
});
test.each(["exit", "error", "pipe", "malformed", "ack-timeout"])("%s fails pending input and never replays presses", async (fault) => {
  await lease(); const pending = cursor.setButton("left", true);
  if (fault === "exit") child.emit("exit", 1);
  if (fault === "error") child.emit("error", new Error("helper fault"));
  if (fault === "pipe") child.stdin.emit("error", new Error("EPIPE"));
  if (fault === "malformed") child.stdout.emit("data", Buffer.from("not json\n"));
  if (fault === "ack-timeout") vi.advanceTimersByTime(251);
  expect(await pending).toBe(false); expect(await cursor.setButton("left", true)).toBe(false);
  const current = fakeHelper(); vi.mocked(spawn).mockReturnValue(current as never);
  vi.advanceTimersByTime(1); const fresh = cursor.renewLease(Date.now()); current.ack(); expect(await fresh).toBe(true);
  expect(current.sent.map((c) => c.type)).toEqual(["lease"]);
});
test("releaseAll bypasses queued input and revokes the lease", async () => {
  await lease(); const pending = cursor.setButton("left", true); const queued = cursor.scroll(100); const released = cursor.releaseAll();
  expect(await pending).toBe(false); expect(await queued).toBe(false); expect(child.sent.at(-1)).toMatchObject({ type: "release", seq: 3 });
  child.ack(); expect(await released).toBe(true); expect(await cursor.setButton("right", true)).toBe(false);
});
test("wrong session cannot acknowledge or authorize input", async () => {
  const pending = cursor.renewLease(Date.now());
  child.stdout.emit("data", Buffer.from(JSON.stringify({ type: "ack", session: "other", seq: 1, ok: true }) + "\n"));
  vi.advanceTimersByTime(251); expect(await pending).toBe(false); expect(await cursor.setButton("left", true)).toBe(false);
});
