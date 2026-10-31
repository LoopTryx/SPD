import { clamp01, type Point2D } from "./geometry";

const SPRING_FREQUENCY = 36;

export class PointerMotionScheduler {
  private position: Point2D | null = null;
  private target: Point2D | null = null;
  private velocity: Point2D = { x: 0, y: 0 };
  private lastSampleAt = 0;

  setTarget(target: Point2D, timestamp: number): void {
    const next = { x: clamp01(target.x), y: clamp01(target.y) };
    if (!this.position) {
      this.position = { ...next };
      this.target = { ...next };
      this.lastSampleAt = timestamp;
      return;
    }
    this.sample(timestamp);
    this.target = next;
  }

  sample(timestamp: number): Point2D | null {
    if (!this.position || !this.target) return null;
    if (timestamp <= this.lastSampleAt) return { ...this.position };

    const elapsed = Math.min(0.05, (timestamp - this.lastSampleAt) / 1000);
    const nextX = this.springAxis(
      this.position.x,
      this.velocity.x,
      this.target.x,
      elapsed,
    );
    const nextY = this.springAxis(
      this.position.y,
      this.velocity.y,
      this.target.y,
      elapsed,
    );
    this.position = { x: clamp01(nextX.position), y: clamp01(nextY.position) };
    this.velocity = { x: nextX.velocity, y: nextY.velocity };
    this.lastSampleAt = timestamp;
    return { ...this.position };
  }

  reset(): void {
    this.position = null;
    this.target = null;
    this.velocity = { x: 0, y: 0 };
    this.lastSampleAt = 0;
  }

  suspend(): void {
    this.reset();
  }

  private springAxis(
    position: number,
    velocity: number,
    target: number,
    elapsed: number,
  ) {
    const displacement = position - target;
    // Discard momentum away from a new target; a cursor must not recoil.
    if (velocity * displacement >= 0) velocity = 0;
    const decay = Math.exp(-SPRING_FREQUENCY * elapsed);
    const next = {
      position:
        target +
        (displacement * (1 + SPRING_FREQUENCY * elapsed) + velocity * elapsed) *
          decay,
      velocity:
        (velocity * (1 - SPRING_FREQUENCY * elapsed) -
          displacement * SPRING_FREQUENCY * SPRING_FREQUENCY * elapsed) *
        decay,
    };
    if ((next.position - target) * displacement <= 0) {
      return { position: target, velocity: 0 };
    }
    return next;
  }
}
