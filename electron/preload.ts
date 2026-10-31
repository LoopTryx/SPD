import { contextBridge, ipcRenderer } from 'electron';
import type { AttentionCalibration, DiagnosticSnapshot, ProductCommand, ProductState, RuntimeStatus, SettingsChange } from './product/contracts';
function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}
const api = {
  getPointerTargets: (x:number,y:number) => ipcRenderer.invoke('pointer-targets',{x,y}),
  moveCursor: (x: number, y: number) => ipcRenderer.invoke('cursor-move', { x, y }),
  setCursorButton: (button: 'left' | 'right', pressed: boolean) => ipcRenderer.invoke('cursor-button', { button, pressed }),
  scrollCursor: (delta: number) => ipcRenderer.invoke('cursor-scroll', { delta }),
  switchWindowsWorkspace: (direction: 'next' | 'previous') => ipcRenderer.invoke('workspace-switch', { direction }),
  setOverlayVisible: (visible: boolean) => ipcRenderer.invoke('overlay-visible', { visible }),
  getSystemAnalytics: () => ipcRenderer.invoke('system-analytics'),
  onEmergencyReset: (callback: () => void) => subscribe('spd:emergency-reset', callback),
  getProductState: (): Promise<ProductState> => ipcRenderer.invoke('product-state'),
  onProductState: (callback: (state: ProductState) => void) => subscribe('spd:product-state', callback),
  publishRuntime: (runtime: RuntimeStatus): Promise<void> => ipcRenderer.invoke('runtime-publish', runtime),
  renewInputLease: (capturedAtEpoch: number): Promise<boolean> => ipcRenderer.invoke('input-lease', capturedAtEpoch),
  releaseInput: (): Promise<void> => ipcRenderer.invoke('input-release'),
  onCommand: (callback: (command: ProductCommand) => void) => subscribe('spd:command', callback),
  saveCalibration: (calibration: AttentionCalibration): Promise<void> => ipcRenderer.invoke('calibration-save', calibration),
  changeSettings: (change: SettingsChange): Promise<void> => ipcRenderer.invoke('settings-change', change),
  pause: (): Promise<void> => ipcRenderer.invoke('product-pause'),
  resume: (): Promise<boolean> => ipcRenderer.invoke('product-resume'),
  startCalibration: (): Promise<void> => ipcRenderer.invoke('calibration-start'),
  retryCamera: (): Promise<void> => ipcRenderer.invoke('camera-retry'),
  checkForUpdates: (): Promise<boolean> => ipcRenderer.invoke('update-check'),
  downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke('update-download'),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke('update-install'),
  saveDiagnostics: (): Promise<boolean> => ipcRenderer.invoke('diagnostics-save'),
  setTraceRecording: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('diagnostics-trace', enabled),
  onTraceRecording: (callback: (enabled: boolean) => void) => subscribe('spd:trace-recording', callback),
  onDiagnosticsRequest: (callback: () => void) => subscribe('spd:diagnostics-request', callback),
  publishDiagnostics: (snapshot: DiagnosticSnapshot): Promise<boolean> => ipcRenderer.invoke('diagnostics-publish', snapshot),
};
contextBridge.exposeInMainWorld('spd', api);
