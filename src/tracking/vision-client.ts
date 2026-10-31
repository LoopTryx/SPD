import type { VisionRequest, VisionResponse } from './vision-protocol';

export class VisionClient {
  onFace: ((face: Extract<VisionResponse, { type: 'face' }>['face']) => void) | null = null;
  private worker: Worker;
  private pending: { resolve: (value: VisionResponse) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private closed = false;
  private warmed = false;
  constructor() {
    this.worker = new Worker(new URL('./vision.worker.ts', import.meta.url));
    this.worker.onmessage = (event: MessageEvent<VisionResponse>) => {
      if (event.data.type === 'face') { this.onFace?.(event.data.face); return; }
      const pending = this.pending;
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending = null;
      if (event.data.type === 'error') pending.reject(new Error(event.data.message));
      else {
        if (event.data.type === 'result') this.warmed = true;
        pending.resolve(event.data);
      }
    };
    this.worker.onerror = () => this.close(new Error('Vision worker stopped. Retry the camera.'));
    this.worker.onmessageerror = () => this.close(new Error('Vision worker returned unreadable data.'));
  }

  request(message: VisionRequest): Promise<VisionResponse> {
    if (this.closed) return Promise.reject(new Error('Vision worker is closed.'));
    if (this.pending) return Promise.reject(new Error('Only one inference job may run at once.'));
    return new Promise((resolve, reject) => {
      // First frame pays one-time delegate setup (XNNPACK/WebGL init), which can
      // take seconds on CPU. Only steady-state frames get the tight deadline.
      const timeoutMs = message.type === 'init' ? 30000 : this.warmed ? 1500 : 10000;
      this.pending = { resolve, reject, timer: setTimeout(() => this.close(new Error('Vision worker timed out. Retry the camera.')), timeoutMs) };
      try { this.worker.postMessage(message, message.type === 'frame' ? [message.bitmap] : []); }
      catch (error) { this.close(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  close(error = new Error('Vision worker stopped.')): void {
    this.closed = true;
    this.worker.terminate();
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); }
    this.pending = null;
  }
}
