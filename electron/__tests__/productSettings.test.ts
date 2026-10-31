import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultSettings, loadSettings, parseSettings, saveSettings } from '../product/settings';

const dirs: string[] = [];
const directory = () => { const dir = mkdtempSync(path.join(tmpdir(), 'spd-settings-')); dirs.push(dir); return dir; };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const settings = { ...defaultSettings(), cameraId: 'camera-local', displayId: 42 };

test('first run chooses defaults with no calibration', () => {
  expect(loadSettings(directory())).toEqual(defaultSettings());
});
test('legacy preferences migrate with safe feature defaults',()=>{
  const migrated=parseSettings({version:1,cameraId:'',displayId:null,sensitivity:'balanced',calibration:null});
  expect(migrated).toMatchObject({setupComplete:false,startWithWindows:false,swapClicks:false,buttonSnapping:true});
});
test('settings reject malformed, unknown-version and unknown-field records', () => {
  expect(parseSettings(settings)).toEqual(settings);
  for (const bad of [{ ...settings, version: 2 }, { ...settings, cameraId: 7 }, { ...settings, displayId: NaN },
    { ...settings, sensitivity: 'fast' }, { ...settings, token: 'secret' }]) expect(parseSettings(bad)).toBeNull();
});
test('calibration must be finite, dimensionally matched and tied to the selected device/display', () => {
  const calibration = { version: 2, cameraId: 'camera-local', displayId: 42, center: [.5, .5, .5, .5], tolerance: [.2, .2, .2, .2], createdAt: 1000 };
  expect(parseSettings({ ...settings, calibration })).not.toBeNull();
  for (const patch of [{ cameraId: 'other' }, { displayId: 99 }, { center: [NaN, 1] }, { tolerance: [0, .2] }, { tolerance: [.1] }]) {
    expect(parseSettings({ ...settings, calibration: { ...calibration, ...patch } })).toBeNull();
  }
});
test('legacy head-pose calibration is cleared without losing camera and sensitivity settings', () => {
  const legacy = { ...settings, calibration: { version: 1, cameraId: 'camera-local', displayId: 42,
    center: [0, .8, .5, .5], tolerance: [.2, .2, .2, .2], createdAt: 1000 } };
  expect(parseSettings(legacy)).toEqual({ ...settings, calibration: null });
});
test('atomic saves retain last valid backup and recover from corrupt primary', () => {
  const dir = directory();
  saveSettings(dir, settings);
  saveSettings(dir, { ...settings, sensitivity: 'deliberate' });
  expect(loadSettings(dir).sensitivity).toBe('deliberate');
  writeFileSync(path.join(dir, 'settings.json'), '{interrupted');
  expect(loadSettings(dir)).toEqual(settings);
  saveSettings(dir, { ...settings, sensitivity: 'responsive' });
  expect(JSON.parse(readFileSync(path.join(dir, 'settings.json.bak'), 'utf8'))).toEqual(settings);
  expect(loadSettings(dir).sensitivity).toBe('responsive');
});
test('invalid save cannot overwrite a valid primary', () => {
  const dir = directory(); saveSettings(dir, settings);
  expect(() => saveSettings(dir, { ...settings, version: 2 })).toThrow();
  expect(loadSettings(dir)).toEqual(settings);
});
