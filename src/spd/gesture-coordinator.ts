import {
  GestureEngine,
  isUsableGestureFrame,
  type GestureEvent,
  type GestureFrame,
  type SensitivityPreset,
} from "./gesture-engine";
export type { SensitivityPreset } from "./gesture-engine";

export interface GestureViewport {
  width: number;
  height: number;
}

const DUAL_ACQUIRE_MS = 300;
const SECONDARY_ABSENCE_MS = 400;

export class GestureCoordinator {
  private readonly primary = new GestureEngine();
  private readonly secondary = new GestureEngine();
  setFeatures(features:{scrollEnabled:boolean;workspaceEnabled:boolean;overlayGestureEnabled:boolean}): void {
    this.reset();this.primary.setFeatures(features);this.secondary.setFeatures(features);
  }
  private dualHandMode = false;
  private secondarySeenSince: number | null = null;
  private secondaryMissingSince: number | null = null;
  private primaryId: number | undefined | null = null;
  private secondaryId: number | undefined | null = null;
  private lastTimestamp = -Infinity;

  update(
    primaryFrame: GestureFrame | null,
    secondaryFrame: GestureFrame | null,
    viewport: GestureViewport,
  ): GestureEvent[] {
    if (!primaryFrame || !isUsableGestureFrame(primaryFrame)) return this.reset();
    const now = primaryFrame.timestamp;
    if (now <= this.lastTimestamp) return [];
    const events: GestureEvent[] = [];

    // Both roles are tied to this pair: moving a different primary must never
    // transport a button held by the former secondary.
    if (this.primaryId !== null && this.primaryId !== primaryFrame.trackId)
      events.push(...this.reset());
    this.primaryId = primaryFrame.trackId;
    this.lastTimestamp = now;

    if (secondaryFrame && (
      !isUsableGestureFrame(secondaryFrame) ||
      (primaryFrame.trackId !== undefined && primaryFrame.trackId === secondaryFrame.trackId)
    )) secondaryFrame = null;

    if (secondaryFrame) {
      if (this.secondaryId !== null && this.secondaryId !== secondaryFrame.trackId) {
        events.push(...this.secondary.reset());
        if (this.dualHandMode) events.push(...this.primary.cancelGestures());
        this.dualHandMode = false;
        this.secondarySeenSince = null;
      }
      this.secondaryId = secondaryFrame.trackId;
      this.secondaryMissingSince = null;
      if (!this.dualHandMode) {
        this.secondarySeenSince ??= now;
        if (now - this.secondarySeenSince >= DUAL_ACQUIRE_MS) {
          events.push(...this.primary.cancelGestures(), ...this.secondary.reset());
          this.dualHandMode = true;
        }
      }
    } else {
      this.secondarySeenSince = null;
      if (this.dualHandMode) {
        this.secondaryMissingSince ??= now;
        // Role hysteresis never grants an absent hand permission to drag.
        events.push(...this.secondary.reset());
        if (now - this.secondaryMissingSince >= SECONDARY_ABSENCE_MS) {
          events.push(...this.primary.cancelGestures());
          this.dualHandMode = false;
          this.secondaryId = null;
          this.secondaryMissingSince = null;
        }
      } else {
        this.secondaryId = null;
      }
    }

    events.push(...this.primary.update(primaryFrame, viewport, {
      pointer: true,
      gestures: !this.dualHandMode,
      systemGestures: !this.dualHandMode,
    }));
    if (this.dualHandMode && secondaryFrame) {
      events.push(...this.secondary.update(secondaryFrame, viewport, {
        pointer: false,
        gestures: true,
        systemGestures: true,
      }));
    }
    return events;
  }

  /** Dispatch returned releases before accepting gestures under the new preset. */
  setSensitivity(preset: SensitivityPreset): GestureEvent[] {
    const releases = this.reset();
    this.primary.setSensitivity(preset);
    this.secondary.setSensitivity(preset);
    return releases;
  }

  reset(): GestureEvent[] {
    this.dualHandMode = false;
    this.secondarySeenSince = null;
    this.secondaryMissingSince = null;
    this.primaryId = null;
    this.secondaryId = null;
    this.lastTimestamp = -Infinity;
    return [...this.primary.reset(), ...this.secondary.reset()];
  }

  snapshot(): { dualHandMode: boolean } {
    return { dualHandMode: this.dualHandMode };
  }
}
