import type { DetectedHand } from '../spd/stable-hand-tracker';
import type { FaceSample } from '../spd/attention-estimator';

export type VisionRequest =
  | { type: 'init'; wasmPath: string; handModel: string; faceModel: string; forceCpu?: boolean }
  | { type: 'frame'; id: number; bitmap: ImageBitmap; timestamp: number; hands: boolean; faceIntervalMs: number };

export type VisionResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'error'; id?: number; message: string }
  | { type: 'result'; id: number; timestamp: number; hands: DetectedHand[]; face: FaceSample | null; inferenceMs: number }
  | { type: 'face'; face: FaceSample };
