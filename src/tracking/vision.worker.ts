import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';
import { extractFaceFeatures, extractFaceRegion, type FaceSample } from '../spd/attention-estimator';
import type { VisionRequest, VisionResponse } from './vision-protocol';
import { assessHandObservation } from './hand-observation-quality';

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<VisionRequest>) => void) | null;
  postMessage(message: VisionResponse): void;
};
let hands: HandLandmarker | null = null;
let face: FaceLandmarker | null = null;
let lastFace: FaceSample | null = null;

async function initialize(request: Extract<VisionRequest, { type: 'init' }>): Promise<void> {
  const files = await FilesetResolver.forVisionTasks(request.wasmPath);
  for (const delegate of (request.forceCpu ? ['CPU'] : ['GPU', 'CPU']) as Array<'GPU' | 'CPU'>) {
    try {
      hands = await HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: request.handModel, delegate },
        canvas: new OffscreenCanvas(640, 480), runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: .55, minHandPresenceConfidence: .6, minTrackingConfidence: .6,
      });
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: request.faceModel, delegate },
        canvas: new OffscreenCanvas(640, 480), runningMode: 'VIDEO', numFaces: 2,
        outputFaceBlendshapes: true, minFaceDetectionConfidence: .6,
        minFacePresenceConfidence: .6, minTrackingConfidence: .6,
      });
      worker.postMessage({ type: 'ready', delegate });
      return;
    } catch (error) {
      hands?.close(); hands = null;
      face?.close(); face = null;
      if (delegate === 'CPU') throw error;
    }
  }
}

worker.onmessage = event => {
  const message = event.data;
  if (message.type === 'init') {
    void initialize(message).catch(error => worker.postMessage({ type: 'error', message: String(error) }));
    return;
  }
  try {
    if (!hands || !face) throw new Error('Vision models are not ready.');
    const start = performance.now();
    const result = message.hands ? hands.detectForVideo(message.bitmap, message.timestamp) : null;
    const detections = (result?.landmarks ?? []).flatMap((points, i) => {
      const landmarks = points.map(p => [p.x, p.y, p.z]);
      const quality = assessHandObservation(landmarks, message.bitmap.width, message.bitmap.height);
      if (!quality.usable) return [];
      return [{
        landmarks,
        worldLandmarks: (result?.worldLandmarks[i] ?? []).map(p => [p.x, p.y, p.z]),
        handedness: result?.handedness[i]?.[0]?.categoryName ?? 'Unknown',
        // Legacy field name: carries geometric quality, not model certainty.
        confidence: quality.score,
        handednessConfidence: result?.handedness[i]?.[0]?.score ?? 0,
      }];
    });
    worker.postMessage({ type: 'result', id: message.id, timestamp: message.timestamp,
      hands: detections, face: lastFace, inferenceMs: performance.now() - start });
    if (!lastFace || message.timestamp - lastFace.timestamp >= message.faceIntervalMs) {
      const result = face.detectForVideo(message.bitmap, message.timestamp);
      const categories = result.faceBlendshapes[0]?.categories ?? [];
      lastFace = {
        timestamp: message.timestamp, faceCount: result.faceLandmarks.length,
        features: result.faceLandmarks.length === 1 ? extractFaceFeatures(result.faceLandmarks[0]) : null,
        region: result.faceLandmarks.length === 1 ? extractFaceRegion(result.faceLandmarks[0]) : undefined,
        blink: categories.some(c => (c.categoryName === 'eyeBlinkLeft' || c.categoryName === 'eyeBlinkRight') && c.score > .55),
      };
      worker.postMessage({ type: 'face', face: lastFace });
    }
  } catch (error) {
    worker.postMessage({ type: 'error', id: message.id, message: String(error) });
  } finally { message.bitmap.close(); }
};
