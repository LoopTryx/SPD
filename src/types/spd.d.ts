import type { AttentionCalibration, DiagnosticSnapshot, ProductCommand, ProductState, RuntimeStatus, SettingsChange } from '../../electron/product/contracts';
export type { AttentionCalibration, ProductCommand, ProductState, RuntimeStatus, Settings, SettingsChange } from '../../electron/product/contracts';
declare global {
  interface Window {
    spd: {
      getPointerTargets(x:number,y:number): Promise<import('../spd/magnetic-pointer').PointerTarget[]>;
      moveCursor(x: number, y: number): Promise<boolean>;
      setCursorButton(button: 'left' | 'right', pressed: boolean): Promise<boolean>;
      scrollCursor(delta: number): Promise<boolean>;
      switchWindowsWorkspace(direction: 'next' | 'previous'): Promise<boolean>;
      setOverlayVisible(visible: boolean): Promise<boolean>;
      getSystemAnalytics(): Promise<{ cpuPercentage: number; memoryPercentage: number; uptimeSeconds: number }>;
      onEmergencyReset(callback: () => void): () => void;
      getProductState(): Promise<ProductState>;
      onProductState(callback: (state: ProductState) => void): () => void;
      publishRuntime(runtime: RuntimeStatus): Promise<void>;
      renewInputLease(capturedAtEpoch: number): Promise<boolean>;
      releaseInput(): Promise<void>;
      onCommand(callback: (command: ProductCommand) => void): () => void;
      saveCalibration(calibration: AttentionCalibration): Promise<void>;
      changeSettings(change: SettingsChange): Promise<void>;
      pause(): Promise<void>;
      resume(): Promise<boolean>;
      startCalibration(): Promise<void>;
      retryCamera(): Promise<void>;
      checkForUpdates(): Promise<boolean>;
      downloadUpdate(): Promise<boolean>;
      installUpdate(): Promise<boolean>;
      saveDiagnostics(): Promise<boolean>;
      setTraceRecording(enabled: boolean): Promise<boolean>;
      onTraceRecording(callback: (enabled: boolean) => void): () => void;
      onDiagnosticsRequest(callback: () => void): () => void;
      publishDiagnostics(snapshot: DiagnosticSnapshot): Promise<boolean>;
    };
  }
}
