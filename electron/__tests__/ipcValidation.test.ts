import { describe, expect, test, vi } from "vitest";
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }));
import { validatePayload } from "../ipc/validation";

describe("IPC validation", () => {
  test("accepts bounded numeric diagnostics but rejects image-like or oversized trace payloads", () => {
    const snapshot = { captureIntervalP95Ms: 33, inferenceP95Ms: 20, inputLatencyP95Ms: 40,
      stationaryJitterRms: .01, droppedFrames: 1, gestureInterruptions: 0,
      frameCount: 20, inputCount: 10, traceEnabled: false, trace: [] };
    expect(validatePayload('diagnostics-publish', snapshot).valid).toBe(true);
    expect(validatePayload('diagnostics-publish', { ...snapshot, bitmap: 'private' }).valid).toBe(false);
    expect(validatePayload('diagnostics-publish', { ...snapshot, trace: Array(901).fill({ timestamp: 0, landmarks: [] }) }).valid).toBe(false);
  });
  test("accepts only finite normalized cursor coordinates", () => {
    expect(validatePayload("cursor-move", { x: 0.4, y: 0.8 }).valid).toBe(true);
    expect(validatePayload("cursor-move", { x: 2, y: 0.8 }).valid).toBe(false);
    expect(
      validatePayload("cursor-move", { x: 0.4, y: Number.NaN }).valid,
    ).toBe(false);
  });
  test("rejects unknown channels and extra fields", () => {
    expect(validatePayload("shell", null).valid).toBe(false);
    expect(
      validatePayload("cursor-button", {
        button: "left",
        pressed: true,
        extra: true,
      }).valid,
    ).toBe(false);
  });
});
