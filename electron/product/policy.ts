export interface SenderIdentity { id: number; url: string; mainFrame: boolean }
export interface WindowIdentity { overlayId?: number; centerId?: number; overlayUrl: string; centerUrl: string }
const overlayChannels = new Set(['pointer-targets', 'cursor-move', 'cursor-button', 'cursor-scroll', 'workspace-switch', 'overlay-visible', 'runtime-publish', 'input-lease', 'input-release', 'calibration-save', 'diagnostics-publish']);
const centerChannels = new Set(['settings-change', 'product-pause', 'product-resume', 'calibration-start', 'camera-retry', 'update-check', 'update-download', 'update-install', 'diagnostics-save', 'diagnostics-trace']);
const sharedChannels = new Set(['product-state', 'system-analytics']);
export function senderAllowed(channel: string, sender: SenderIdentity, windows: WindowIdentity): boolean {
  if (!sender.mainFrame) return false;
  const overlay = sender.id === windows.overlayId && sender.url === windows.overlayUrl;
  const center = sender.id === windows.centerId && sender.url === windows.centerUrl;
  return (overlay && overlayChannels.has(channel)) || (center && centerChannels.has(channel)) ||
    ((overlay || center) && sharedChannels.has(channel));
}
export function freshLease(capturedAtEpoch: number, now: number, paused: boolean): boolean {
  return !paused && Number.isSafeInteger(capturedAtEpoch) && capturedAtEpoch >= now - 150 && capturedAtEpoch <= now;
}
