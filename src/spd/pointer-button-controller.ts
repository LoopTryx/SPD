export type PointerButton = "left" | "right";
export type SensitivityPreset = "deliberate" | "balanced" | "responsive";
export type ButtonPhase =
  | "open"
  | "closing"
  | "armed"
  | "pressed"
  | "dragging"
  | "releasing";

export type PointerButtonEvent =
  | { type: "button-down"; button: PointerButton }
  | { type: "button-up"; button: PointerButton };

export interface PointerButtonObservation {
  timestamp: number;
  valid: boolean;
  leftRatio: number;
  rightRatio: number;
  leftClosingVelocity: number;
  rightClosingVelocity: number;
  movementPalms: number;
  leftPoseAllowed: boolean;
  rightPoseAllowed: boolean;
  systemGestureActive: boolean;
}

interface ButtonState {
  lastContactAt: number | null;
  phase: ButtonPhase;
  phaseSince: number | null;
  pressed: boolean;
  lastValidAt: number | null;
  dwellMs: number;
}

export interface PointerButtonSnapshot {
  left: Readonly<ButtonState>;
  right: Readonly<ButtonState>;
}

export const BUTTON_CLOSE_RATIO: Record<PointerButton, number> = {
  left: 0.18,
  right: 0.20,
};
const RELEASE_RATIO: Record<PointerButton, number> = {
  left: 0.30,
  right: 0.33,
};
const PRESS_DWELL_MS: Record<SensitivityPreset, number> = {
  deliberate: 300,
  balanced: 140,
  responsive: 110,
};
const RELEASE_CONFIRM_MS = 45;
const PRESSED_DROPOUT_GRACE_MS = 120;
const DRAG_MOVEMENT_PALMS = 0.08;
const MAX_CANDIDATE_MOVEMENT_PALMS = 0.18;

export class PointerButtonController {
  private pressDwellMs = PRESS_DWELL_MS.balanced;
  private left = this.emptyState();
  private right = this.emptyState();

  setSensitivity(preset: SensitivityPreset): PointerButtonEvent[] {
    const releases = this.releaseAll();
    this.pressDwellMs = PRESS_DWELL_MS[preset];
    return releases;
  }

  update(observation: PointerButtonObservation): PointerButtonEvent[] {
    if (!Number.isFinite(observation.timestamp)) return this.releaseAll();
    if (observation.systemGestureActive) return this.releaseAll();
    if (!observation.valid)
      return this.handleTrackingDropout(observation.timestamp);

    this.left.lastValidAt = observation.timestamp;
    this.right.lastValidAt = observation.timestamp;

    const conflicting =
      this.isEngaged(this.left, "left", observation.leftRatio) &&
      this.isEngaged(this.right, "right", observation.rightRatio);
    if (conflicting) return this.releaseAll();

    return [
      ...this.updateButton(
        this.left,
        "left",
        observation.leftRatio,
        observation.leftClosingVelocity,
        observation.movementPalms,
        observation.leftPoseAllowed,
        observation.timestamp,
      ),
      ...this.updateButton(
        this.right,
        "right",
        observation.rightRatio,
        observation.rightClosingVelocity,
        observation.movementPalms,
        observation.rightPoseAllowed,
        observation.timestamp,
      ),
    ];
  }

  releaseAll(): PointerButtonEvent[] {
    const events: PointerButtonEvent[] = [];
    if (this.left.pressed) events.push({ type: "button-up", button: "left" });
    if (this.right.pressed) events.push({ type: "button-up", button: "right" });
    this.left = this.emptyState();
    this.right = this.emptyState();
    return events;
  }

  cancelCandidates(): void {
    if (!this.left.pressed) this.left = this.emptyState();
    if (!this.right.pressed) this.right = this.emptyState();
  }

  snapshot(): PointerButtonSnapshot {
    return {
      left: { ...this.left },
      right: { ...this.right },
    };
  }

  private updateButton(
    state: ButtonState,
    button: PointerButton,
    ratio: number,
    closingVelocity: number,
    movementPalms: number,
    poseAllowed: boolean,
    timestamp: number,
  ): PointerButtonEvent[] {
    if (!Number.isFinite(ratio)) return this.releaseButton(state, button);
    const closeRatio = BUTTON_CLOSE_RATIO[button];
    const releaseRatio = RELEASE_RATIO[button];

    if (state.pressed) {
      if (state.phase === "releasing") {
        if (ratio <= closeRatio) {
          state.phase =
            movementPalms >= DRAG_MOVEMENT_PALMS ? "dragging" : "pressed";
          state.phaseSince = timestamp;
          return [];
        }
        if (
          ratio > releaseRatio &&
          state.phaseSince !== null &&
          timestamp - state.phaseSince >= RELEASE_CONFIRM_MS
        ) {
          return this.releaseButton(state, button);
        }
        return [];
      }

      if (ratio > releaseRatio) {
        state.phase = "releasing";
        state.phaseSince = timestamp;
        return [];
      }
      if (movementPalms >= DRAG_MOVEMENT_PALMS) state.phase = "dragging";
      return [];
    }

    if (!poseAllowed || ratio > releaseRatio) {
      Object.assign(state, this.emptyState());
      state.lastValidAt = timestamp;
      return [];
    }

    if (state.phase === "open") {
      if (ratio > closeRatio) return [];
      state.phase = "closing";
      state.phaseSince = timestamp;
      state.dwellMs = this.pressDwellMs;
      state.lastContactAt = timestamp;
      return [];
    }

    if (ratio > closeRatio) {
      // Bridge one noisy near-contact sample, but never press on a gap or
      // extend this grace indefinitely. A fresh close sample must confirm it.
      if(state.lastContactAt!==null && timestamp-state.lastContactAt<=70 && ratio<releaseRatio)return [];
      Object.assign(state, this.emptyState());
      state.lastValidAt = timestamp;
      return [];
    }

    state.lastContactAt=timestamp;

    if (movementPalms > MAX_CANDIDATE_MOVEMENT_PALMS) {
      state.phase = "closing";
      state.phaseSince = timestamp;
      state.dwellMs = this.pressDwellMs;
      return [];
    }

    if (
      state.phaseSince !== null &&
      timestamp - state.phaseSince >= state.dwellMs
    ) {
      state.phase = "pressed";
      state.phaseSince = timestamp;
      state.pressed = true;
      return [{ type: "button-down", button }];
    }
    state.phase = "armed";
    return [];
  }

  private handleTrackingDropout(timestamp: number): PointerButtonEvent[] {
    const events: PointerButtonEvent[] = [];
    for (const [button, state] of [
      ["left", this.left],
      ["right", this.right],
    ] as const) {
      if (!state.pressed) {
        Object.assign(state, this.emptyState());
        continue;
      }
      if (
        state.lastValidAt === null ||
        timestamp - state.lastValidAt > PRESSED_DROPOUT_GRACE_MS
      ) {
        events.push(...this.releaseButton(state, button));
      }
    }
    return events;
  }

  private releaseButton(
    state: ButtonState,
    button: PointerButton,
  ): PointerButtonEvent[] {
    const wasPressed = state.pressed;
    Object.assign(state, this.emptyState());
    return wasPressed ? [{ type: "button-up", button }] : [];
  }

  private isEngaged(
    state: ButtonState,
    button: PointerButton,
    ratio: number,
  ): boolean {
    return (
      Number.isFinite(ratio) &&
      ratio <
        (state.phase === "open"
          ? BUTTON_CLOSE_RATIO[button]
          : RELEASE_RATIO[button])
    );
  }

  private emptyState(): ButtonState {
    return {
      lastContactAt: null,
      phase: "open",
      phaseSince: null,
      pressed: false,
      lastValidAt: null,
      dwellMs: this.pressDwellMs,
    };
  }
}
