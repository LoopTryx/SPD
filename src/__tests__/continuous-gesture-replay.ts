import { GestureEngine, type GestureCapabilities, type GestureFrame, type GestureEvent } from '../spd/gesture-engine';

/** Legacy scenarios describe poses held between keyframes, not missing frames.
 * Supply their implied camera cadence. Dropout regressions use GestureEngine
 * directly so they continue to test actual missing observations.
 */
export class ContinuousGestureReplay extends GestureEngine {
  private previous: GestureFrame | null = null;
  override update(frame: GestureFrame, viewport: { width: number; height: number }, capabilities?: GestureCapabilities): GestureEvent[] {
    const intervening: GestureEvent[] = [];
    if (this.previous && Number.isFinite(frame.timestamp)) {
      for (let t = this.previous.timestamp + 50; t < frame.timestamp; t += 50)
        intervening.push(...super.update({ ...this.previous, timestamp: t }, viewport, capabilities).filter(e => e.type !== 'move'));
    }
    this.previous = frame;
    return [...intervening, ...super.update(frame, viewport, capabilities)];
  }
}
