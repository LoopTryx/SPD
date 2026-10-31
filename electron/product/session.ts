import type { Settings, RuntimeStatus, AttentionCalibration, SettingsChange } from './contracts';
import { parseSettings, settingsChangeSchema } from './settings';
export class ProductSession {
  paused = true;
  private calibrating = false;
  runtime: RuntimeStatus = { status: 'loading', reason: 'Starting camera. Input is paused.', tier: 'balanced', inferenceP95Ms: 0, frameAgeMs: 0, droppedFrames: 0, attention: 'unknown' };
  constructor(public settings: Settings, private release: () => void, private persist: (s: Settings) => void, private changed: () => void) {}
  pause(reason: string): void {
    this.paused = true;
    this.calibrating = false;
    this.release();
    this.runtime = { ...this.runtime, reason };
    this.changed();
  }
  resume(): boolean {
    // Gaze gating runs on the default profile until the user saves their own,
    // so a missing calibration must not make the product unusable.
    if (this.calibrating || !parseSettings(this.settings) ||
      !['ready', 'paused'].includes(this.runtime.status)) return false;
    this.paused = false;
    this.runtime = { ...this.runtime, reason: 'Ready. Hold a neutral pose before pointing.' };
    this.changed();
    return true;
  }
  publishRuntime(runtime: RuntimeStatus): void {
    this.runtime = runtime;
    if (runtime.status === 'loading' && this.calibrating) { this.release(); this.changed(); }
    else if (['loading', 'recovering', 'error'].includes(runtime.status)) this.pause(runtime.reason);
    else this.changed();
  }
  changeSettings(change: SettingsChange): void {
    const patch = settingsChangeSchema.parse(change);
    this.pause('Settings changed. Review calibration and resume when ready.');
    const deviceChanged = ('cameraId' in patch && patch.cameraId !== this.settings.cameraId) ||
      ('displayId' in patch && patch.displayId !== this.settings.displayId);
    const next = parseSettings({ ...this.settings, ...patch, calibration: deviceChanged ? null : this.settings.calibration });
    if (!next) throw new Error('Invalid settings');
    this.persist(next);
    this.settings = next;
    if (deviceChanged) this.runtime = { ...this.runtime, status: 'loading' };
    this.changed();
    this.changed();
  }
  saveCalibration(calibration: AttentionCalibration): void {
    if (!this.calibrating || !this.paused) throw new Error('Start calibration from SPD Settings');
    const next = parseSettings({ ...this.settings, calibration });
    if (!next) throw new Error('Calibration does not match current settings');
    this.persist(next);
    this.settings = next;
    this.calibrating = false;
    this.runtime = { ...this.runtime, status: 'paused', reason: 'Calibration saved. Resume when ready.' };
    this.changed();
  }
  startCalibration(): void {
    this.pause('Calibration in progress. Follow the dots on your display.');
    this.calibrating = true;
  }
}
