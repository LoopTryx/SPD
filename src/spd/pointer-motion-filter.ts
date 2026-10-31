import { clamp01, type Point2D } from "./geometry";

const NOISE_FLOOR = 0.00035;
const UNCONFIRMED_JUMP = 0.45;
const CONFIRMATION_RADIUS = 0.08;

export class PointerMotionFilter {
  private point: Point2D | null = null;
  private previousRaw: Point2D | null = null;
  private derivative: Point2D = { x: 0, y: 0 };
  private timestamp = 0;
  private pendingJump: { point: Point2D; timestamp: number } | null = null;

  update(next: Point2D, timestamp: number): Point2D {
    const target = { x: clamp01(next.x), y: clamp01(next.y) };
    if (!this.point) {
      this.point = target;
      this.previousRaw = target;
      this.timestamp = timestamp;
      return { ...target };
    }
    if (timestamp <= this.timestamp) return { ...this.point };

    const rawDx = target.x - this.previousRaw!.x;
    const rawDy = target.y - this.previousRaw!.y;
    this.previousRaw = target;
    const dx = target.x - this.point.x;
    const dy = target.y - this.point.y;
    const distance = Math.hypot(dx, dy);
    const elapsedSeconds = Math.max(
      0.001,
      Math.min(0.1, (timestamp - this.timestamp) / 1000),
    );

    if (distance > UNCONFIRMED_JUMP) {
      const confirmed =
        this.pendingJump &&
        timestamp > this.pendingJump.timestamp &&
        Math.hypot(
          target.x - this.pendingJump.point.x,
          target.y - this.pendingJump.point.y,
        ) < CONFIRMATION_RADIUS;
      if (!confirmed) {
        this.pendingJump = { point: target, timestamp };
        this.timestamp = timestamp;
        return { ...this.point };
      }
    }
    this.pendingJump = null;

    const derivativeAlpha = this.alpha(elapsedSeconds, 1);
    this.derivative = {
      x:
        this.derivative.x +
        (rawDx / elapsedSeconds - this.derivative.x) * derivativeAlpha,
      y:
        this.derivative.y +
        (rawDy / elapsedSeconds - this.derivative.y) * derivativeAlpha,
    };
    if (distance <= NOISE_FLOOR) {
      this.timestamp = timestamp;
      return { ...this.point };
    }
    const speed = Math.hypot(this.derivative.x, this.derivative.y);
    const alpha = this.alpha(elapsedSeconds, 3 + 3 * speed);
    this.point = {
      x: clamp01(this.point.x + dx * alpha),
      y: clamp01(this.point.y + dy * alpha),
    };
    this.timestamp = timestamp;
    return { ...this.point };
  }

  reset(): void {
    this.point = null;
    this.previousRaw = null;
    this.derivative = { x: 0, y: 0 };
    this.timestamp = 0;
    this.pendingJump = null;
  }

  private alpha(elapsedSeconds: number, cutoff: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / elapsedSeconds);
  }
}
