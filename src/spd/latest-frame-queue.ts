/** Owns frames until disposal. The queue cannot grow with inference latency. */
export class LatestFrameQueue<T> {
  private busy = false;
  private stopped = false;
  private pending: { value: T } | null = null;
  dropped = 0;

  constructor(
    private readonly run: (frame: T) => Promise<void>,
    private readonly dispose: (frame: T) => void,
    private readonly onError: (error: unknown) => void,
  ) {}

  push(frame: T): void {
    if (this.stopped) { this.dispose(frame); return; }
    if (this.busy) {
      if (this.pending) { this.dispose(this.pending.value); this.dropped++; }
      this.pending = { value: frame };
      return;
    }
    void this.consume(frame);
  }

  private async consume(frame: T): Promise<void> {
    this.busy = true;
    try { await this.run(frame); }
    catch (error) { if (!this.stopped) this.onError(error); }
    finally {
      this.dispose(frame);
      this.busy = false;
      const next = this.pending;
      this.pending = null;
      if (next) {
        if (this.stopped) this.dispose(next.value);
        else void this.consume(next.value);
      }
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.pending) this.dispose(this.pending.value);
    this.pending = null;
  }
}
