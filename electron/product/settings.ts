import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Settings } from './contracts';

const cameraId = z.string().max(1024);
const displayId = z.number().int().safe().nullable();
export const calibrationSchema = z.object({
  version: z.literal(2), cameraId, displayId,
  center: z.array(z.number().finite().min(-100).max(100)).min(1).max(16),
  tolerance: z.array(z.number().finite().positive().max(100)).min(1).max(16),
  createdAt: z.number().int().nonnegative().safe(),
}).strict().refine(value => value.center.length === value.tolerance.length);
const legacyCalibrationSchema = z.object({
  version: z.literal(1), cameraId, displayId,
  center: z.array(z.number().finite().min(-100).max(100)).min(1).max(16),
  tolerance: z.array(z.number().finite().positive().max(100)).min(1).max(16),
  createdAt: z.number().int().nonnegative().safe(),
}).strict().refine(value => value.center.length === value.tolerance.length);
export const settingsChangeSchema = z.object({
  cameraId: cameraId.optional(), displayId: displayId.optional(),
  sensitivity: z.enum(['deliberate', 'balanced', 'responsive']).optional(),
  setupComplete: z.boolean().optional(), startWithWindows: z.boolean().optional(),
  swapClicks: z.boolean().optional(), buttonSnapping: z.boolean().optional(),
  scrollEnabled: z.boolean().optional(), workspaceEnabled: z.boolean().optional(), overlayGestureEnabled: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const settingsSchema = z.object({
  version: z.literal(1), cameraId, displayId,
  sensitivity: z.enum(['deliberate', 'balanced', 'responsive']),
  setupComplete: z.boolean().default(false), startWithWindows: z.boolean().default(false),
  swapClicks: z.boolean().default(false), buttonSnapping: z.boolean().default(true),
  scrollEnabled: z.boolean().default(true), workspaceEnabled: z.boolean().default(true), overlayGestureEnabled: z.boolean().default(true),
  calibration: z.union([calibrationSchema, legacyCalibrationSchema]).nullable(),
}).strict().refine(value => !value.calibration || (
  value.calibration.cameraId === value.cameraId && value.calibration.displayId === value.displayId
));
export function defaultSettings(): Settings {
  return { version: 1, cameraId: '', displayId: null, sensitivity: 'balanced', calibration: null, setupComplete:false, startWithWindows:false, swapClicks:false, buttonSnapping:true, scrollEnabled:true, workspaceEnabled:true, overlayGestureEnabled:true };
}
export function parseSettings(value: unknown): Settings | null {
  const parsed = settingsSchema.safeParse(value);
  if (!parsed.success) return null;
  return { ...parsed.data,
    calibration: parsed.data.calibration?.version === 2 ? parsed.data.calibration : null };
}
function readSettings(file: string): Settings | null {
  try { return parseSettings(JSON.parse(readFileSync(file, 'utf8'))); } catch { return null; }
}
export function loadSettings(directory: string): Settings {
  const file = path.join(directory, 'settings.json');
  return readSettings(file) ?? readSettings(file + '.bak') ?? defaultSettings();
}
function atomicWrite(file: string, value: Settings): void {
  const temporary = file + '.tmp';
  const descriptor = openSync(temporary, 'w', 0o600);
  try { writeFileSync(descriptor, JSON.stringify(value, null, 2)); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  try { renameSync(temporary, file); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}
export function saveSettings(directory: string, value: unknown): void {
  const settings = parseSettings(value);
  if (!settings) throw new Error('Invalid settings');
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'settings.json');
  const previous = readSettings(file);
  // A corrupt primary must never replace the last valid backup.
  if (previous) atomicWrite(file + '.bak', previous);
  atomicWrite(file, settings);
}
