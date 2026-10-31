import { describe, expect, test } from "vitest";
import { GestureCoordinator } from "../spd/gesture-coordinator";

const viewport = { width: 1920, height: 1080 };
function points(pointerX: number, pinch = false): number[][] {
  const hand = Array.from({ length: 21 }, () => [0.5, 0.7, 0]);
  hand[0] = [0.5, 0.85, 0];
  hand[5] = [0.42, 0.62, 0];
  hand[9] = [0.5, 0.58, 0];
  hand[13] = [0.58, 0.62, 0];
  hand[17] = [0.66, 0.68, 0];
  hand[4] = [0.32, 0.63, 0];
  hand[6] = [0.42, 0.48, 0];
  hand[8] = [0.42, 0.2, 0];
  hand[10] = [0.5, 0.46, 0];
  hand[12] = [0.5, 0.18, 0];
  hand[14] = [0.58, 0.49, 0];
  hand[16] = [0.58, 0.22, 0];
  hand[18] = [0.66, 0.54, 0];
  hand[20] = [0.66, 0.3, 0];
  if (pinch) hand[4] = [0.43, 0.21, 0];
  return hand.map(([x, y, z]) => [x + pointerX - 0.42, y, z]);
}
function frame(x: number, timestamp: number, pinch = false, trackId = 1) {
  return {
    trackId,
    landmarks: points(x, pinch),
    handedness: "Right",
    confidence: 0.95,
    timestamp,
  };
}

describe("hand role coordination", () => {
  test("releases a secondary drag as soon as that hand disappears", () => {
    const coordinator = new GestureCoordinator();
    for (let i = 0; i < 4; i++)
      coordinator.update(
        frame(0.7, i * 100),
        frame(0.3, i * 100, false, 2),
        viewport,
      );
    for (let t = 400; t <= 1100; t += 100)
      coordinator.update(frame(0.7, t), frame(0.3, t, false, 2), viewport);
    coordinator.update(frame(0.7, 1200), frame(0.3, 1200, true, 2), viewport);
    coordinator.update(frame(0.7, 1460), frame(0.3, 1460, true, 2), viewport);
    expect(coordinator.update(frame(0.7, 1520), null, viewport)).toContainEqual({
      type: "button-up",
      button: "left",
    });
    expect(
      coordinator.update(frame(0.7, 1580), null, viewport),
    ).not.toContainEqual({ type: "button-up", button: "left" });
  });
  test("one hand controls movement and clicks", () => {
    const coordinator = new GestureCoordinator();
    coordinator.update(frame(0.6, 0), null, viewport);
    coordinator.update(frame(0.6, 300), null, viewport);
    coordinator.update(frame(0.6, 640, true), null, viewport);
    const events = coordinator.update(frame(0.6, 900, true), null, viewport);
    expect(events.some((event) => event.type === "move")).toBe(true);
    expect(events).toContainEqual({ type: "button-down", button: "left" });
  });
  test("300 ms with a secondary splits movement and gesture roles", () => {
    const coordinator = new GestureCoordinator();
    for (let index = 0; index < 4; index++)
      coordinator.update(
        frame(0.7, index * 100, false, 1),
        frame(0.3, index * 100, false, 2),
        viewport,
      );
    for (let t = 400; t <= 1100; t += 100)
      coordinator.update(frame(0.7, t), frame(0.3, t, false, 2), viewport);
    coordinator.update(
      frame(0.7, 1200, false, 1),
      frame(0.3, 1200, true, 2),
      viewport,
    );
    const events = coordinator.update(
      frame(0.7, 1460, false, 1),
      frame(0.3, 1460, true, 2),
      viewport,
    );
    expect(events.filter((event) => event.type === "move")).toHaveLength(1);
    expect(events).toContainEqual({ type: "button-down", button: "left" });
  });
});
