import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { calibrationSchema, settingsChangeSchema } from '../product/settings';

const noPayload = z.null().optional();
const landmark = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const diagnosticSnapshotSchema = z.object({
  captureIntervalP95Ms: z.number().finite().nonnegative(),
  inferenceP95Ms: z.number().finite().nonnegative(),
  inputLatencyP95Ms: z.number().finite().nonnegative(),
  stationaryJitterRms: z.number().finite().nonnegative(),
  droppedFrames: z.number().int().nonnegative(),
  gestureInterruptions: z.number().int().nonnegative(),
  frameCount: z.number().int().nonnegative(), inputCount: z.number().int().nonnegative(),
  traceEnabled: z.boolean(),
  trace: z.array(z.object({ timestamp: z.number().finite().nonnegative(),
    landmarks: z.array(z.array(landmark).max(21)).max(2) }).strict()).max(900),
}).strict();
export const runtimeSchema = z.object({
  status: z.enum(['loading', 'ready', 'paused', 'recovering', 'error']),
  reason: z.string().max(512), tier: z.enum(['balanced', 'economy']),
  inferenceP95Ms: z.number().finite().min(0).max(3_600_000),
  frameAgeMs: z.number().finite().min(0).max(86_400_000),
  droppedFrames: z.number().int().nonnegative().safe(),
  attention: z.string().max(128),
}).strict();
const schemas = {
  'pointer-targets': z.object({ x:z.number().finite().min(0).max(1), y:z.number().finite().min(0).max(1) }).strict(),
  'cursor-move': z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict(),
  'cursor-button': z.object({ button: z.enum(['left', 'right']), pressed: z.boolean() }).strict(),
  'cursor-scroll': z.object({ delta: z.number().finite().min(-1200).max(1200) }).strict(),
  'workspace-switch': z.object({ direction: z.enum(['next', 'previous']) }).strict(),
  'overlay-visible': z.object({ visible: z.boolean() }).strict(),
  'system-analytics': noPayload,
  'product-state': noPayload,
  'runtime-publish': runtimeSchema,
  'input-lease': z.number().finite().nonnegative().safe(),
  'input-release': noPayload,
  'calibration-save': calibrationSchema,
  'settings-change': settingsChangeSchema,
  'product-pause': noPayload, 'product-resume': noPayload,
  'calibration-start': noPayload, 'camera-retry': noPayload,
  'update-check': noPayload, 'update-download': noPayload, 'update-install': noPayload,
  'diagnostics-save': noPayload,
  'diagnostics-publish': diagnosticSnapshotSchema,
  'diagnostics-trace': z.boolean(),
} as const;
export type InvokeChannel = keyof typeof schemas;
export function validatePayload(channel: string, payload: unknown): { valid: boolean; error?: string } {
  if (!Object.prototype.hasOwnProperty.call(schemas, channel)) return { valid: false, error: 'Unknown IPC channel' };
  const result = schemas[channel as InvokeChannel].safeParse(payload);
  return result.success ? { valid: true } : { valid: false, error: 'Invalid IPC payload' };
}
export function registerValidatedHandler(
  channel: InvokeChannel,
  handler: (event: IpcMainInvokeEvent, payload: unknown) => unknown,
  authorize: (event: IpcMainInvokeEvent, channel: InvokeChannel) => boolean = () => false,
): void {
  ipcMain.handle(channel, (event, payload) => {
    if (!authorize(event, channel)) throw new Error('Unauthorized IPC sender');
    const result = validatePayload(channel, payload);
    if (!result.valid) throw new Error(result.error);
    return handler(event, payload);
  });
}
