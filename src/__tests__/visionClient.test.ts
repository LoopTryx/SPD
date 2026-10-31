import { expect, test, vi } from 'vitest';
import { VisionClient } from '../tracking/vision-client';

test('an asynchronous eye result cannot consume a pending hand-frame reply', async () => {
  let worker!: { onmessage: ((event: { data: any }) => void) | null };
  vi.stubGlobal('Worker', class {
    onmessage: ((event: { data: any }) => void) | null = null;
    onerror = null; onmessageerror = null;
    constructor() { worker = this; }
    postMessage() {} terminate() {}
  });
  const client = new VisionClient();
  const seen: number[] = [];
  client.onFace = face => seen.push(face.timestamp);
  const frame = client.request({ type: 'frame', id: 1, timestamp: 100,
    bitmap: {} as ImageBitmap, hands: true, faceIntervalMs: 100 });
  worker.onmessage!({ data: { type: 'face', face: { timestamp: 100, faceCount: 1, features: [.5,.5,.5,.5], blink: false } } });
  expect(seen).toEqual([100]);
  worker.onmessage!({ data: { type: 'result', id: 1, timestamp: 100, hands: [], face: null, inferenceMs: 10 } });
  expect((await frame).type).toBe('result');
  client.close();
  vi.unstubAllGlobals();
});
