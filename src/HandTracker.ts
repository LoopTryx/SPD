import type * as mp from "@mediapipe/tasks-vision";
import { VisionClient } from "./tracking/vision-client";
import { LatestFrameQueue } from "./spd/latest-frame-queue";
import { PerformanceGovernor } from "./spd/performance-governor";
import type { FaceSample } from "./spd/attention-estimator";
import { PrimaryHandSelector } from "./spd/primary-hand-selector";
import { POINTER_TIP_INDEX } from './spd/geometry';
import {
  StableHandTracker,
  type DetectedHand,
  type StableHand,
} from "./spd/stable-hand-tracker";

export type TrackerStatus =
  | "idle"
  | "loading-model"
  | "loading-camera"
  | "warming-up"
  | "running"
  | "error";

export interface HandResult {
  trackIds: number[];
  landmarks: number[][][];
  worldLandmarks: number[][][];
  handedness: string[];
  confidences: number[];
}

export function buildHandResult(tracks: StableHand[]): HandResult {
  return {
    trackIds: tracks.map((track) => track.id),
    landmarks: tracks.map((track) => track.landmarks),
    worldLandmarks: tracks.map((track) => track.worldLandmarks),
    handedness: tracks.map((track) => track.handedness),
    confidences: tracks.map((track) => track.confidence),
  };
}

export interface ControlHand {
  cameraAspectRatio?: number;
  trackId: number;
  landmarks: number[][];
  poseLandmarks?: number[][];
  handedness: string;
  confidence: number;
  timestamp: number;
}

export function selectPoseLandmarks(
  screenLandmarks: number[][],
  worldLandmarks: number[][],
): number[][] {
  return worldLandmarks.length === 21 ? worldLandmarks : screenLandmarks;
}

export function selectSecondaryControlHand(
  result: HandResult,
  primaryTrackId: number,
  timestamp: number,
  cameraAspectRatio = 4/3,
): ControlHand | null {
  const index = result.trackIds.findIndex(
    (trackId) => trackId !== primaryTrackId,
  );
  if (index < 0 || !result.landmarks[index]) return null;
  const poseLandmarks =
    result.landmarks[index].length === 21
      ? selectPoseLandmarks(
          result.landmarks[index],
          result.worldLandmarks[index] ?? [],
        )
      : undefined;
  return {
    cameraAspectRatio,
    trackId: result.trackIds[index],
    landmarks: result.landmarks[index],
    ...(poseLandmarks ? { poseLandmarks } : {}),
    handedness: result.handedness[index] ?? "Unknown",
    confidence: result.confidences[index] ?? 0,
    timestamp,
  };
}

export interface PointerData {
  x: number;
  y: number;
  z: number;
  handedness: string;
  confidence: number;
  visibility: number | null;
  presence: number | null;
}

type HandClassification = Pick<mp.Category, "categoryName" | "score">;
type FrameListener = (
  controlHand: ControlHand | null,
  result: HandResult,
  sample: TrackingSample,
) => void;
type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export function selectPrimaryHandIndex(
  handedness: readonly (readonly HandClassification[])[],
): number {
  const rightHandIndex = handedness.findIndex(
    (classifications) => classifications[0]?.categoryName === "Right",
  );
  return rightHandIndex >= 0 ? rightHandIndex : 0;
}

export function extractPointerData(
  handLandmarks: readonly mp.NormalizedLandmark[],
  handednessClassification?: readonly HandClassification[],
): PointerData | null {
  const tip = handLandmarks[POINTER_TIP_INDEX];
  if (
    !tip ||
    !Number.isFinite(tip.x) ||
    !Number.isFinite(tip.y) ||
    !Number.isFinite(tip.z)
  )
    return null;
  const classification = handednessClassification?.[0];
  return {
    x: Math.max(0, Math.min(1, tip.x)),
    y: Math.max(0, Math.min(1, tip.y)),
    z: tip.z,
    handedness: classification?.categoryName || "Unknown",
    confidence: Math.max(0, Math.min(1, classification?.score ?? 0)),
    visibility: Number.isFinite(tip.visibility) ? tip.visibility : null,
    presence: null,
  };
}


export interface TrackingSample {
  timestamp: number;
  capturedAtEpoch: number;
  face: FaceSample | null;
  inferenceMs: number;
  frameAgeMs: number;
  ready: boolean;
  tier: 'balanced' | 'economy';
  droppedFrames: number;
  delegate: 'GPU' | 'CPU';
}
type CapturedFrame = { bitmap: ImageBitmap; timestamp: number; capturedAtEpoch: number };
const emptyResult = (): HandResult => ({ trackIds: [], landmarks: [], worldLandmarks: [], handedness: [], confidences: [] });

export function cameraConstraints(cameraId: string): MediaStreamConstraints {
  return { audio: false, video: {
    ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'user' }),
    width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 60 },
  } };
}

export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError') return 'Camera access is blocked. Allow camera access in Windows privacy settings, then retry.';
  if (name === 'NotReadableError') return 'The camera is busy or unavailable. Close other camera apps and retry.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'The selected camera is unavailable. Choose a connected camera in SPD settings.';
  return error instanceof Error ? error.message : 'Camera processing failed. Retry from SPD Settings.';
}

export class HandTracker {
  private client: VisionClient | null = null;
  private queue: LatestFrameQueue<CapturedFrame> | null = null;
  private videoEl: FrameVideo | null = null;
  private stream: MediaStream | null = null;
  private running = false;
  private generation = 0;
  private capturing = false;
  private lastVideoTime = -1;
  private lastCapture = -Infinity;
  private videoFrameHandle: number | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;
  private cameraId = '';
  private paused = true;
  private calibrating = false;
  private delegate: 'GPU' | 'CPU' = 'GPU';
  private lastResult = emptyResult();
  private lastControlHand: ControlHand | null = null;
  private lastPointerData: PointerData | null = null;
  private latestSample: TrackingSample | null = null;
  private latestFace: FaceSample | null = null;
  private governor = new PerformanceGovernor();
  private readonly stableHands = new StableHandTracker();
  private readonly primaryHand = new PrimaryHandSelector(500);
  private readonly frameListeners = new Set<FrameListener>();
  private _status: TrackerStatus = 'idle';
  private _lastError: string | null = null;
  private statusListener: ((status: TrackerStatus, error?: string | null) => void) | null = null;

  get status(): TrackerStatus { return this._status; }
  get lastError(): string | null { return this._lastError; }
  onStatusChange(cb: (status: TrackerStatus, error?: string | null) => void): void { this.statusListener = cb; }
  onFrame(cb: FrameListener): () => void { this.frameListeners.add(cb); return () => this.frameListeners.delete(cb); }
  setPaused(paused: boolean, calibrating = false): void { this.paused = paused; this.calibrating = calibrating; }
  private setStatus(status: TrackerStatus, error: string | null = null): void {
    this._status = status; this._lastError = error; this.statusListener?.(status, error);
  }

  async init(videoEl: HTMLVideoElement, options: { cameraId?: string; forceCpu?: boolean } = {}): Promise<void> {
    const generation = ++this.generation;
    this.videoEl = videoEl;
    this.cameraId = options.cameraId ?? '';
    this.setStatus('loading-model');
    const client = new VisionClient();
    client.onFace = face => { if (generation === this.generation) this.latestFace = face; };
    this.client = client;
    try {
      const built = window.location.protocol === 'file:';
      const asset = (name: string) => new URL(built ? './' + name : '/' + name, window.location.href).toString();
      const reply = await client.request({
        type: 'init', handModel: asset('hand_landmarker.task'), faceModel: asset('face_landmarker.task'),
        wasmPath: asset(built ? 'wasm' : 'node_modules/@mediapipe/tasks-vision/wasm'),
        forceCpu: options.forceCpu,
      });
      if (generation !== this.generation) { client.close(); return; }
      if (reply.type !== 'ready') throw new Error('Vision worker did not initialize.');
      this.delegate = reply.delegate;
      this.queue = new LatestFrameQueue(frame => this.infer(frame, generation), frame => frame.bitmap.close(), error => {
        if (generation === this.generation) this.fail(error);
      });
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      throw error;
    }
  }

  async startCamera(): Promise<void> {
    if (!this.videoEl || !this.client) throw new Error('Vision is not initialized.');
    const generation = this.generation;
    this.setStatus('loading-camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(this.cameraId));
      if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      this.videoEl.srcObject = stream;
      stream.getVideoTracks().forEach(track => {
        track.onended = () => { if (this.running) this.fail(new Error('The camera disconnected. Reconnect it and retry.')); };
      });
      await this.videoEl.play();
      if (generation !== this.generation) return;
      this.running = true;
      this.lastVideoTime = -1;
      this.setStatus('warming-up');
      this.scheduleNextFrame();
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      throw error;
    }
  }

  private scheduleNextFrame(): void {
    if (!this.running || !this.videoEl) return;
    if (this.videoEl.requestVideoFrameCallback) {
      this.videoFrameHandle = this.videoEl.requestVideoFrameCallback(() => {
        this.videoFrameHandle = null;
        void this.capture();
        this.scheduleNextFrame();
      });
    } else {
      this.fallbackTimer = setTimeout(() => {
        this.fallbackTimer = null;
        void this.capture();
        this.scheduleNextFrame();
      }, this.governor.frameIntervalMs);
    }
  }

  private async capture(): Promise<void> {
    const video = this.videoEl;
    const timestamp = performance.now();
    // The camera callback sets the ceiling; the governor only skips frames
    // when inference cannot sustain that cadence.
    const interval = this.governor.frameIntervalMs;
    if (!this.running || this.capturing || !video || video.readyState < 2 ||
        video.currentTime === this.lastVideoTime || timestamp - this.lastCapture < interval - 2) return;
    this.lastCapture = timestamp;
    this.lastVideoTime = video.currentTime;
    this.capturing = true;
    const generation = this.generation;
    const capturedAtEpoch = Date.now();
    try {
      const bitmap = await createImageBitmap(video);
      if (!this.running || generation !== this.generation) { bitmap.close(); return; }
      this.queue?.push({ bitmap, timestamp, capturedAtEpoch });
    } catch (error) { if (generation === this.generation) this.fail(error); }
    finally { if (generation === this.generation) this.capturing = false; }
  }

  private async infer(frame: CapturedFrame, generation: number): Promise<void> {
    if (performance.now() - frame.timestamp > 150 || !this.client) return;
    const reply = await this.client.request({
      type: 'frame', id: ++this.frameCount, bitmap: frame.bitmap, timestamp: frame.timestamp,
      hands: !this.calibrating, faceIntervalMs: this.paused && !this.calibrating && this.governor.ready ? 200 : 100,
    });
    if (generation !== this.generation || reply.type !== 'result') return;
    this.governor.record(reply.inferenceMs, reply.timestamp);
    const age = performance.now() - reply.timestamp;
    const tracks = this.stableHands.update(age <= 150 ? reply.hands : [], reply.timestamp);
    this.lastResult = buildHandResult(tracks);
    const primaryIndex = this.primaryHand.update(tracks.map(track => ({
      id: track.id, wrist: track.landmarks[0] ?? [0, 0, 0], handedness: track.handedness, confidence: track.confidence,
    })), reply.timestamp);
    const control = primaryIndex === null ? null : tracks[primaryIndex];
    this.lastControlHand = control ? {
      cameraAspectRatio: this.videoEl?.videoWidth && this.videoEl.videoHeight ? this.videoEl.videoWidth/this.videoEl.videoHeight : 4/3,
      trackId: control.id, landmarks: control.landmarks,
      poseLandmarks: selectPoseLandmarks(control.landmarks, control.worldLandmarks),
      handedness: control.handedness, confidence: control.confidence, timestamp: reply.timestamp,
    } : null;
    const tip = control?.landmarks[POINTER_TIP_INDEX];
    this.lastPointerData = tip && control ? { x: tip[0], y: tip[1], z: tip[2],
      handedness: control.handedness, confidence: control.confidence, visibility: null, presence: null } : null;
    this.latestSample = { timestamp: reply.timestamp, capturedAtEpoch: frame.capturedAtEpoch,
      face: this.latestFace ?? reply.face, inferenceMs: reply.inferenceMs, frameAgeMs: age, ready: this.governor.ready,
      tier: this.governor.tier, droppedFrames: this.queue?.dropped ?? 0, delegate: this.delegate };
    if (this._status !== 'running' && this.governor.ready) this.setStatus('running');
    for (const listener of this.frameListeners) listener(this.lastControlHand, this.lastResult, this.latestSample);
  }

  private fail(error: unknown): void {
    const message = cameraErrorMessage(error);
    this.stop();
    this.setStatus('error', message);
  }

  getPointerData(): PointerData | null { return this.lastPointerData; }
  getResult(): HandResult {
    return this.latestSample && performance.now() - this.latestSample.timestamp > 200 ? emptyResult() : this.lastResult;
  }
  getControlHand(): ControlHand | null {
    return this.latestSample && performance.now() - this.latestSample.timestamp > 200 ? null : this.lastControlHand;
  }
  getSample(): TrackingSample | null { return this.latestSample; }
  getInferenceP95(): number { return this.governor.p95; }
  getVideoAspectRatio(): number {
    const width = this.videoEl?.videoWidth ?? 0, height = this.videoEl?.videoHeight ?? 0;
    return width > 0 && height > 0 ? width / height : 4 / 3;
  }

  stop(): void {
    this.generation++;
    this.running = false;
    if (this.videoFrameHandle !== null) this.videoEl?.cancelVideoFrameCallback?.(this.videoFrameHandle);
    this.videoFrameHandle = null;
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
    this.queue?.stop(); this.queue = null;
    this.client?.close(); this.client = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.stream = null;
    if (this.videoEl) this.videoEl.srcObject = null;
    this.capturing = false;
    this.stableHands.reset(); this.primaryHand.reset();
    this.lastResult = emptyResult(); this.lastControlHand = null; this.lastPointerData = null; this.latestSample = null;
    this.latestFace = null;
    this.governor = new PerformanceGovernor(); this.lastCapture = -Infinity;
    this.setStatus('idle');
  }
}
