import { distance3d, mapCameraPointToScreen, POINTER_TIP_INDEX, type Point2D } from "./geometry";
import { pinchContactRatio } from './pinch-contact';
import {
  PointerButtonController,
  BUTTON_CLOSE_RATIO,
  type SensitivityPreset,
} from "./pointer-button-controller";
export type { SensitivityPreset } from "./pointer-button-controller";
import { OverlayPinch } from "./overlay-pinch";

export interface GestureFrame {
  trackId?: number;
  landmarks: number[][];
  poseLandmarks?: number[][];
  handedness?: string;
  confidence: number;
  timestamp: number;
  cameraAspectRatio?: number;
}

export interface GestureCapabilities {
  pointer: boolean;
  gestures: boolean;
  systemGestures?: boolean;
}

const COMBINED_CAPABILITIES: GestureCapabilities = {
  pointer: true,
  gestures: true,
  systemGestures: true,
};

export type GestureEvent =
  | { type: "move"; x: number; y: number }
  | { type: "button-down"; button: "left" | "right" }
  | { type: "button-up"; button: "left" | "right" }
  | { type: "scroll"; delta: number }
  | { type: "overlay-toggle" }
  | { type: "workspace-switch"; direction: "next" | "previous" };

interface WorkspaceSwipeState {
  since: number;
  startX: number;
  triggered: boolean;
}

const SAFE_CONFIDENCE = 0.55;
const ARM_DELAY_MS = 120;
const WORKSPACE_CLOSE_RATIO = 0.22;
const WORKSPACE_RELEASE_RATIO = 0.36;
const SCROLL_HOLD_MS = 120;
const SCROLL_DROPOUT_MS = 120;
const SCROLL_DEAD_ZONE_PALMS = 0.015;
const SCROLL_GAIN = 900;
const MAX_SCROLL_DELTA = 1200;
const WORKSPACE_HOLD_MS = 120;
const WORKSPACE_SWIPE_PALMS = 0.28;
const PINCH_WINNER_MARGIN = 0.08;
const MAX_OBSERVATION_GAP_MS = 350;

type PinchIntent = "left" | "overlay" | "workspace" | "right" | null;

function hasValidLandmarks(points: number[][]): boolean {
  return points.length === 21 &&
    points.every(point => point?.length >= 3 && point.slice(0, 3).every(Number.isFinite)) &&
    distance3d(points[0], points[9]) > 0.0001;
}

export function isUsableGestureFrame(frame: GestureFrame): boolean {
  return Number.isFinite(frame.timestamp) &&
    Number.isFinite(frame.confidence) && frame.confidence >= SAFE_CONFIDENCE &&
    hasValidLandmarks(frame.landmarks) &&
    (!frame.poseLandmarks || hasValidLandmarks(frame.poseLandmarks));
}

function isFingerExtended(points: number[][], tip: number, pip: number): boolean {
  const wrist = points[0];
  return distance3d(points[tip], wrist) - distance3d(points[pip], wrist) >
    distance3d(wrist, points[9]) * 0.12;
}

function isScrollPose(points: number[][], palmScale: number): boolean {
  return distance3d(points[8], points[12]) / palmScale < 0.20 &&
    isFingerExtended(points, 8, 6) && isFingerExtended(points, 12, 10) &&
    !isFingerExtended(points, 16, 14) && !isFingerExtended(points, 20, 18);
}

/** Safe to arm: every thumb pinch is open and no two-finger scroll is active. */
export function isNeutralHand(landmarks: number[][]): boolean {
  if (!hasValidLandmarks(landmarks)) return false;
  const scale = distance3d(landmarks[0], landmarks[9]);
  return [8, 12, 16, 20].every(tip => distance3d(landmarks[4], landmarks[tip]) / scale >= 0.45) &&
    !isScrollPose(landmarks, scale);
}

// Motion is measured in camera coordinates; world landmarks are only for poses.
function cameraPalmScale(frame: GestureFrame): number {
  return Math.max(0.0001, distance3d(frame.landmarks[0], frame.landmarks[9]));
}

export function scrollDeltaForPalmMovement(movementInPalms: number): number {
  return Math.max(
    -MAX_SCROLL_DELTA,
    Math.min(MAX_SCROLL_DELTA, Math.round(-movementInPalms * SCROLL_GAIN)),
  );
}

export class GestureEngine {
  private features = {scrollEnabled:true,workspaceEnabled:true,overlayGestureEnabled:true};
  setFeatures(features: typeof this.features): void { this.cancelGestures(); this.features=features; }
  private readonly buttons = new PointerButtonController();
  private previousButtonTip: Point2D | null = null;
  private previousLeftRatio: number | null = null;
  private previousRightRatio: number | null = null;
  private scroll: {
    since: number;
    active: boolean;
    lastY: number;
    lastPalmScale: number;
    lastEmitAt: number;
    lastValidAt: number;
  } | null = null;
  private readonly overlayPinch = new OverlayPinch();
  private workspaceSwipe: WorkspaceSwipeState | null = null;
  private stableSince: number | null = null;
  private lastFrameTimestamp = -Infinity;
  private ownerId: number | undefined | null = null;
  private needsNeutral = true;
  private engagement: Exclude<PinchIntent, null> | 'scroll' | null = null;

  update(
    frame: GestureFrame,
    _viewport: { width: number; height: number },
    capabilities: GestureCapabilities = COMBINED_CAPABILITIES,
  ): GestureEvent[] {
    if (!Number.isFinite(frame.timestamp)) return this.cancelGestures();
    if (frame.timestamp <= this.lastFrameTimestamp) return [];
    const interrupted = Number.isFinite(this.lastFrameTimestamp) &&
      frame.timestamp - this.lastFrameTimestamp > MAX_OBSERVATION_GAP_MS;
    this.lastFrameTimestamp = frame.timestamp;
    if (!isUsableGestureFrame(frame)) return this.cancelGestures();
    const events: GestureEvent[] = interrupted ? this.cancelGestures() : [];
    if (this.ownerId !== null && this.ownerId !== frame.trackId)
      events.push(...this.cancelGestures());
    this.ownerId = frame.trackId;

    const tip = frame.landmarks[POINTER_TIP_INDEX];
    const cameraTip = { x: tip[0], y: tip[1] };
    const mappedTip = mapCameraPointToScreen(cameraTip);
    const pointer = { x: 1 - mappedTip.x, y: mappedTip.y };
    if (!capabilities.gestures) {
      events.push(...this.cancelGestures());
      this.emitPointer(events, pointer, capabilities.pointer);
      return events;
    }
    const systemGestures = capabilities.systemGestures !== false;
    if (!systemGestures) this.resetSystemGestures();

    const pose =
      frame.poseLandmarks?.length === 21
        ? frame.poseLandmarks
        : frame.landmarks;
    if (this.needsNeutral) {
      if (!isNeutralHand(pose)) {
        this.emitPointer(events, pointer, capabilities.pointer);
        return events;
      }
      this.needsNeutral = false;
      this.stableSince = frame.timestamp;
    }
    const armed = this.stableSince !== null &&
      frame.timestamp - this.stableSince >= ARM_DELAY_MS;
    const palmScale = Math.max(0.0001, distance3d(pose[0], pose[9]));
    const leftRatio = pinchContactRatio(frame.landmarks,pose,8,frame.cameraAspectRatio);
    const overlayRatio = pinchContactRatio(frame.landmarks,pose,12,frame.cameraAspectRatio);
    const workspaceRatio = pinchContactRatio(frame.landmarks,pose,16,frame.cameraAspectRatio);
    const rightRatio = pinchContactRatio(frame.landmarks,pose,20,frame.cameraAspectRatio);
    const pinchIntent = this.classifyPinch(
      leftRatio,
      workspaceRatio,
      rightRatio,
      overlayRatio,
    );

    const heldBefore = this.buttons.snapshot().left.pressed || this.buttons.snapshot().right.pressed;
    if (isNeutralHand(pose) && !heldBefore) this.engagement = null;
    const scrollIntent = systemGestures && isScrollPose(pose, palmScale);
    const requested = pinchIntent ?? (scrollIntent ? 'scroll' : null);
    if (armed && requested && this.engagement && requested !== this.engagement) {
      events.push(...this.cancelGestures());
      this.emitPointer(events, pointer, capabilities.pointer);
      return events;
    }
    if (armed && requested) this.engagement ??= requested;

    const overlayGesture =
      armed && systemGestures && this.features.overlayGestureEnabled
        ? this.overlayPinch.update(
            overlayRatio,
            pinchIntent === "overlay",
            frame.timestamp,
          )
        : { captured: false, toggle: false };
    if (overlayGesture.captured) {
      this.emitPointer(events, pointer, capabilities.pointer);
      events.push(...this.releaseButtons());
      this.scroll = null;
      this.workspaceSwipe = null;
      if (overlayGesture.toggle) events.push({ type: "overlay-toggle" });
      return events;
    }

    const workspaceGesture =
      armed &&
      systemGestures && this.features.workspaceEnabled &&
      (pinchIntent === "workspace" || this.workspaceSwipe !== null)
        ? this.updateWorkspaceSwipe(frame, pose, palmScale)
        : { captured: false, events: [] as GestureEvent[] };
    if (workspaceGesture.captured) {
      this.emitPointer(events, pointer, capabilities.pointer);
      events.push(...this.releaseButtons(), ...workspaceGesture.events);
      this.scroll = null;
      return events;
    }

    const buttonIntentActive =
      pinchIntent === "left" ||
      pinchIntent === "right" ||
      this.buttons.snapshot().left.pressed ||
      this.buttons.snapshot().right.pressed;
    const scrollGesture =
      armed && systemGestures && this.features.scrollEnabled && !buttonIntentActive
        ? this.updateScroll(frame, pose, palmScale)
        : { captured: false, event: null as GestureEvent | null };
    if (scrollGesture.captured) {
      events.push(...this.releaseButtons());
      if (scrollGesture.event) events.push(scrollGesture.event);
      return events;
    }

    this.emitPointer(events, pointer, capabilities.pointer);

    if (!armed) {
      this.buttons.cancelCandidates();
      this.resetButtonObservation();
      return events;
    }

    const movementPalms = this.previousButtonTip
      ? Math.hypot(
          cameraTip.x - this.previousButtonTip.x,
          cameraTip.y - this.previousButtonTip.y,
        ) / cameraPalmScale(frame)
      : 0;
    const leftClosingVelocity =
      this.previousLeftRatio === null ? 0 : leftRatio - this.previousLeftRatio;
    const rightClosingVelocity =
      this.previousRightRatio === null
        ? 0
        : rightRatio - this.previousRightRatio;
    this.previousButtonTip = { ...cameraTip };
    this.previousLeftRatio = leftRatio;
    this.previousRightRatio = rightRatio;
    events.push(
      ...this.buttons.update({
        timestamp: frame.timestamp,
        valid: true,
        leftRatio,
        rightRatio,
        leftClosingVelocity,
        rightClosingVelocity,
        movementPalms,
        leftPoseAllowed: pinchIntent === "left" || (pinchIntent===null && this.buttons.snapshot().left.phase!=='open' && leftRatio<.30),
        rightPoseAllowed: pinchIntent === "right" || (pinchIntent===null && this.buttons.snapshot().right.phase!=='open' && rightRatio<.33),
        systemGestureActive: false,
      }),
    );
    return events;
  }

  private emitPointer(events: GestureEvent[], point: Point2D, enabled: boolean): void {
    if (!enabled) return;
    events.push({ type: 'move', x: point.x, y: point.y });
  }

  setSensitivity(preset: SensitivityPreset): GestureEvent[] {
    return [...this.cancelGestures(), ...this.buttons.setSensitivity(preset)];
  }

  reset(): GestureEvent[] {
    const releases = this.releaseButtons();
    this.resetTransient();
    this.stableSince = null;
    this.lastFrameTimestamp = -Infinity;
    this.ownerId = null;
    this.needsNeutral = true;
    return releases;
  }

  cancelGestures(): GestureEvent[] {
    const releases = this.releaseButtons();
    this.resetTransient();
    this.stableSince = null;
    this.needsNeutral = true;
    return releases;
  }

  private updateScroll(
    frame: GestureFrame,
    pose: number[][],
    palmScale: number,
  ): { captured: boolean; event: GestureEvent | null } {
    const poseValid = this.isScrollPose(pose, palmScale);
    if (!poseValid) {
      if (
        this.scroll &&
        frame.timestamp - this.scroll.lastValidAt <= SCROLL_DROPOUT_MS
      ) {
        return { captured: true, event: null };
      }
      this.scroll = null;
      return { captured: false, event: null };
    }

    const y = frame.landmarks[8][1];
    const movementScale = cameraPalmScale(frame);
    if (!this.scroll) {
      this.scroll = {
        since: frame.timestamp,
        active: false,
        lastY: y,
        lastPalmScale: movementScale,
        lastEmitAt: frame.timestamp,
        lastValidAt: frame.timestamp,
      };
      return { captured: true, event: null };
    }

    this.scroll.lastValidAt = frame.timestamp;
    if (!this.scroll.active) {
      if (frame.timestamp - this.scroll.since < SCROLL_HOLD_MS) {
        this.scroll.lastY = y;
        this.scroll.lastPalmScale = movementScale;
        return { captured: true, event: null };
      }
      this.scroll.active = true;
      this.scroll.lastY = y;
      this.scroll.lastPalmScale = movementScale;
      this.scroll.lastEmitAt = frame.timestamp;
      return { captured: true, event: null };
    }

    if (frame.timestamp - this.scroll.lastEmitAt < 24) {
      return { captured: true, event: null };
    }
    const movementInPalms =
      (y - this.scroll.lastY) / Math.max(0.0001, this.scroll.lastPalmScale);
    if (Math.abs(movementInPalms) < SCROLL_DEAD_ZONE_PALMS) {
      return { captured: true, event: null };
    }
    this.scroll.lastY = y;
    this.scroll.lastPalmScale = movementScale;
    this.scroll.lastEmitAt = frame.timestamp;
    const delta = scrollDeltaForPalmMovement(movementInPalms);
    return {
      captured: true,
      event: delta === 0 ? null : { type: "scroll", delta },
    };
  }

  private isScrollPose(points: number[][], palmScale: number): boolean {
    return isScrollPose(points, palmScale);
  }

  private isFingerExtended(
    points: number[][],
    tip: number,
    pip: number,
  ): boolean {
    return isFingerExtended(points, tip, pip);
  }

  private updateWorkspaceSwipe(
    frame: GestureFrame,
    pose: number[][],
    palmScale: number,
  ): { captured: boolean; events: GestureEvent[] } {
    const ringRatio = distance3d(pose[4], pose[16]) / palmScale;
    const closed =
      ringRatio <
      (this.workspaceSwipe ? WORKSPACE_RELEASE_RATIO : WORKSPACE_CLOSE_RATIO);
    const explicitPose =
      closed &&
      distance3d(pose[8], pose[12]) / palmScale >= 0.16 &&
      [
        this.isFingerExtended(pose, 8, 6),
        this.isFingerExtended(pose, 12, 10),
        this.isFingerExtended(pose, 20, 18),
      ].filter(Boolean).length >= 2;
    const x = 1 - frame.landmarks[9][0];

    if (!this.workspaceSwipe) {
      if (!explicitPose) return { captured: false, events: [] };
      this.workspaceSwipe = {
        since: frame.timestamp,
        startX: x,
        triggered: false,
      };
      return { captured: true, events: [] };
    }

    if (!explicitPose) {
      this.workspaceSwipe = null;
      return { captured: false, events: [] };
    }
    if (this.workspaceSwipe.triggered) return { captured: true, events: [] };
    if (frame.timestamp - this.workspaceSwipe.since < WORKSPACE_HOLD_MS) {
      return { captured: true, events: [] };
    }

    const displacement = x - this.workspaceSwipe.startX;
    if (
      Math.abs(displacement) <
      cameraPalmScale(frame) * WORKSPACE_SWIPE_PALMS
    ) {
      return { captured: true, events: [] };
    }
    this.workspaceSwipe.triggered = true;
    return {
      captured: true,
      events: [
        {
          type: "workspace-switch",
          direction: displacement < 0 ? "next" : "previous",
        },
      ],
    };
  }

  private releaseButtons(): GestureEvent[] {
    this.resetButtonObservation();
    return this.buttons.releaseAll();
  }

  private resetTransient(): void {
    this.engagement = null;
    this.buttons.cancelCandidates();
    this.resetButtonObservation();
    this.resetSystemGestures();
  }

  private resetButtonObservation(): void {
    this.previousButtonTip = null;
    this.previousLeftRatio = null;
    this.previousRightRatio = null;
  }

  private resetSystemGestures(): void {
    this.scroll = null;
    this.overlayPinch.cancelCandidate();
    this.workspaceSwipe = null;
  }

  private classifyPinch(
    left: number,
    workspace: number,
    right: number,
    overlay: number,
  ): PinchIntent {
    const candidates = [
      { intent: "overlay" as const, ratio: overlay, close: 0.18 },
      { intent: "left" as const, ratio: left, close: BUTTON_CLOSE_RATIO.left },
      {
        intent: "workspace" as const,
        ratio: workspace,
        close: WORKSPACE_CLOSE_RATIO,
      },
      {
        intent: "right" as const,
        ratio: right,
        close: BUTTON_CLOSE_RATIO.right,
      },
    ]
      .filter(
        (candidate) =>
          (candidate.intent !== 'overlay' || this.features.overlayGestureEnabled) &&
          (candidate.intent !== 'workspace' || this.features.workspaceEnabled) &&
          Number.isFinite(candidate.ratio) &&
          candidate.ratio <= candidate.close,
      )
      .sort((a, b) => a.ratio - b.ratio);
    if (!candidates[0]) return null;
    if (
      candidates[1] &&
      candidates[1].ratio - candidates[0].ratio < PINCH_WINNER_MARGIN
    )
      return null;
    return candidates[0].intent;
  }
}
