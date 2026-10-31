export interface AttentionCalibration {
  version: 2;
  cameraId: string;
  displayId: number | null;
  center: number[];
  tolerance: number[];
  createdAt: number;
}

export interface PointerTarget { id:string; x:number; y:number; width:number; height:number }

export interface Settings {
  version: 1;
  cameraId: string;
  displayId: number | null;
  sensitivity: 'deliberate' | 'balanced' | 'responsive';
  calibration: AttentionCalibration | null;
  setupComplete: boolean;
  startWithWindows: boolean;
  swapClicks: boolean;
  buttonSnapping: boolean;
  scrollEnabled: boolean;
  workspaceEnabled: boolean;
  overlayGestureEnabled: boolean;
}

export interface RuntimeStatus {
  status: 'loading' | 'ready' | 'paused' | 'recovering' | 'error';
  reason: string;
  tier: 'balanced' | 'economy';
  inferenceP95Ms: number;
  frameAgeMs: number;
  droppedFrames: number;
  attention: string;
}

export interface ProductState {
  settings: Settings;
  paused: boolean;
  runtime: RuntimeStatus;
  displays: Array<{ id: number; label: string }>;
  updateStatus: string;
  traceRecording?: boolean;
}

export type SettingsChange = Partial<Pick<Settings, 'cameraId' | 'displayId' | 'sensitivity' | 'setupComplete' | 'startWithWindows' | 'swapClicks' | 'buttonSnapping' | 'scrollEnabled' | 'workspaceEnabled' | 'overlayGestureEnabled'>>;
export type ProductCommand = 'calibrate' | 'retry';

export interface DiagnosticSnapshot {
  captureIntervalP95Ms: number;
  inferenceP95Ms: number;
  inputLatencyP95Ms: number;
  stationaryJitterRms: number;
  droppedFrames: number;
  gestureInterruptions: number;
  frameCount: number;
  inputCount: number;
  traceEnabled: boolean;
  trace: Array<{ timestamp: number; landmarks: number[][][] }>;
}
