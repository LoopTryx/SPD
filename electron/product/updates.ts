import { z } from 'zod';
const releaseSchema = z.object({
  version: z.literal(1), signed: z.literal(true), publisherName: z.string().trim().min(1).max(256),
  updateUrl: z.string().url(), channel: z.enum(['stable', 'beta']),
}).strict();
export type ApprovedRelease = z.infer<typeof releaseSchema>;
export function approvedRelease(value: unknown, packaged: boolean, platform: string, verifiedPublisher: string | null): ApprovedRelease | null {
  const parsed = releaseSchema.safeParse(value);
  if (!packaged || platform !== 'win32' || !parsed.success || parsed.data.publisherName !== verifiedPublisher) return null;
  const url = new URL(parsed.data.updateUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
  return parsed.data;
}
export interface UpdaterAdapter {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  setFeedURL(options: { provider: 'generic'; url: string; channel: string }): void;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}
export class UpdateController {
  status: string;
  constructor(private updater: UpdaterAdapter, private release: ApprovedRelease | null, private changed: () => void) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = release?.channel === 'beta';
    this.status = release ? 'idle' : 'disabled';
    if (!release) return;
    updater.setFeedURL({ provider: 'generic', url: release.updateUrl, channel: release.channel === 'beta' ? 'beta' : 'latest' });
    updater.on('error', () => this.setStatus('error'));
    updater.on('update-not-available', () => { if (this.status === 'checking') this.setStatus('current'); });
    updater.on('update-available', (info: { files?: Array<{ url: string }> }) => {
      if (this.status !== 'checking') return;
      const safe = info.files?.length && info.files.every(file => {
        try {
          const url = new URL(file.url, release.updateUrl);
          return url.protocol === 'https:' && url.origin === new URL(release.updateUrl).origin &&
            !url.username && !url.password && !url.search && !url.hash;
        } catch { return false; }
      });
      this.setStatus(safe ? 'available' : 'error');
    });
    updater.on('update-downloaded', () => {
      if (this.status === 'downloading') this.setStatus('downloaded');
    });
  }
  private setStatus(status: string): void { this.status = status; this.changed(); }
  async check(): Promise<boolean> {
    if (!this.release || !['idle', 'current', 'error', 'available'].includes(this.status)) return false;
    this.setStatus('checking');
    try { await this.updater.checkForUpdates(); return this.status !== 'error'; }
    catch { this.setStatus('error'); return false; }
  }
  async download(): Promise<boolean> {
    if (!this.release || this.status !== 'available') return false;
    this.setStatus('downloading');
    try { await this.updater.downloadUpdate(); return String(this.status) !== 'error'; }
    catch { this.setStatus('error'); return false; }
  }
  install(): boolean {
    if (!this.release || this.status !== 'downloaded') return false;
    this.setStatus('installing');
    this.updater.quitAndInstall(false, true);
    return true;
  }
}
