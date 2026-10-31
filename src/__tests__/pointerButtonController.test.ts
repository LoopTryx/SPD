import { describe, expect, test } from "vitest";
import {
  PointerButtonController,
  type PointerButtonObservation,
} from "../spd/pointer-button-controller";

function observation(
  timestamp: number,
  overrides: Partial<PointerButtonObservation> = {},
): PointerButtonObservation {
  return {
    timestamp: timestamp * 3,
    valid: true,
    leftRatio: 0.8,
    rightRatio: 0.8,
    leftClosingVelocity: 0,
    rightClosingVelocity: 0,
    movementPalms: 0,
    leftPoseAllowed: true,
    rightPoseAllowed: true,
    systemGestureActive: false,
    ...overrides,
  };
}

describe("PointerButtonController", () => {
  test("a left pinch emits one down and one confirmed up", () => {
    const buttons = new PointerButtonController();

    expect(buttons.update(observation(0))).toEqual([]);
    expect(
      buttons.update(
        observation(20, { leftRatio: 0.12, leftClosingVelocity: -0.02 }),
      ),
    ).toEqual([]);
    expect(buttons.update(observation(95, { leftRatio: 0.10 }))).toContainEqual(
      {
        type: "button-down",
        button: "left",
      },
    );
    expect(buttons.update(observation(130, { leftRatio: 0.09 }))).toEqual([]);
    expect(buttons.update(observation(170, { leftRatio: 0.64 }))).toEqual([]);
    expect(
      buttons.update(observation(220, { leftRatio: 0.66 })),
    ).toContainEqual({
      type: "button-up",
      button: "left",
    });
  });

  test("movement after button-down becomes dragging without repeating down", () => {
    const buttons = new PointerButtonController();
    buttons.update(
      observation(0, { leftRatio: 0.12, leftClosingVelocity: -0.02 }),
    );
    buttons.update(observation(80, { leftRatio: 0.10 }));

    const events = buttons.update(
      observation(120, { leftRatio: 0.09, movementPalms: 0.25 }),
    );

    expect(events).toEqual([]);
    expect(buttons.snapshot().left.phase).toBe("dragging");
    expect(buttons.snapshot().left.pressed).toBe(true);
  });

  test("brief tracking dropout keeps a drag held but sustained loss releases it", () => {
    const buttons = new PointerButtonController();
    buttons.update(
      observation(0, { leftRatio: 0.12, leftClosingVelocity: -0.02 }),
    );
    buttons.update(observation(80, { leftRatio: 0.10 }));
    buttons.update(observation(100, { leftRatio: 0.09, movementPalms: 0.2 }));

    expect(buttons.update(observation(130, { valid: false }))).toEqual([]);
    expect(buttons.snapshot().left.pressed).toBe(true);
    expect(buttons.update(observation(150, { valid: false }))).toContainEqual({
      type: "button-up",
      button: "left",
    });
  });

  test("two complete pinch cycles produce two independent clicks", () => {
    const buttons = new PointerButtonController();
    const events = [
      ...buttons.update(
        observation(0, { leftRatio: 0.12, leftClosingVelocity: -0.02 }),
      ),
      ...buttons.update(observation(80, { leftRatio: 0.10 })),
      ...buttons.update(observation(120, { leftRatio: 0.65 })),
      ...buttons.update(observation(170, { leftRatio: 0.66 })),
      ...buttons.update(
        observation(230, { leftRatio: 0.12, leftClosingVelocity: -0.02 }),
      ),
      ...buttons.update(observation(310, { leftRatio: 0.10 })),
      ...buttons.update(observation(350, { leftRatio: 0.65 })),
      ...buttons.update(observation(400, { leftRatio: 0.66 })),
    ];

    expect(
      events.filter(
        (event) => event.type === "button-down" && event.button === "left",
      ),
    ).toHaveLength(2);
    expect(
      events.filter(
        (event) => event.type === "button-up" && event.button === "left",
      ),
    ).toHaveLength(2);
  });

  test("right pinch holds the right button until confirmed release", () => {
    const buttons = new PointerButtonController();
    buttons.update(
      observation(0, { rightRatio: 0.12, rightClosingVelocity: -0.02 }),
    );
    expect(
      buttons.update(observation(80, { rightRatio: 0.10 })),
    ).toContainEqual({
      type: "button-down",
      button: "right",
    });
    buttons.update(observation(120, { rightRatio: 0.65 }));
    expect(
      buttons.update(observation(170, { rightRatio: 0.65 })),
    ).toContainEqual({
      type: "button-up",
      button: "right",
    });
  });

  test("conflicting pinches and gripping poses cannot press a button", () => {
    const conflicting = new PointerButtonController();
    conflicting.update(
      observation(0, {
        leftRatio: 0.12,
        rightRatio: 0.12,
        leftClosingVelocity: -0.02,
        rightClosingVelocity: -0.02,
      }),
    );
    expect(
      conflicting.update(
        observation(150, { leftRatio: 0.10, rightRatio: 0.10 }),
      ),
    ).not.toContainEqual(expect.objectContaining({ type: "button-down" }));

    const gripping = new PointerButtonController();
    gripping.update(
      observation(0, {
        leftRatio: 0.12,
        leftClosingVelocity: -0.02,
        leftPoseAllowed: false,
      }),
    );
    expect(
      gripping.update(
        observation(150, { leftRatio: 0.10, leftPoseAllowed: false }),
      ),
    ).not.toContainEqual(expect.objectContaining({ type: "button-down" }));
  });

  test("system gesture capture releases a held button immediately", () => {
    const buttons = new PointerButtonController();
    buttons.update(
      observation(0, { leftRatio: 0.12, leftClosingVelocity: -0.02 }),
    );
    buttons.update(observation(80, { leftRatio: 0.10 }));

    expect(
      buttons.update(
        observation(100, { leftRatio: 0.09, systemGestureActive: true }),
      ),
    ).toContainEqual({ type: "button-up", button: "left" });
    expect(buttons.snapshot().left.phase).toBe("open");
  });
});
