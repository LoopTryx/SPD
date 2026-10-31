import { useEffect, useState } from 'react';
import type { ProductState, SettingsChange } from './types/spd';

const panel: React.CSSProperties = {
  minHeight: '100vh',
  padding: '24px 28px 40px',
  boxSizing: 'border-box',
  background: '#10151d',
  color: '#eef5ff',
  fontFamily: 'Segoe UI, sans-serif',
};

const section: React.CSSProperties = {
  border: '1px solid #2a3547',
  borderRadius: 10,
  padding: '14px 16px',
  marginTop: 14,
};

const button: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 6,
  border: '1px solid #3d74ff',
  background: '#1b3a8f',
  color: '#eef5ff',
  font: 'inherit',
  cursor: 'pointer',
};

const secondaryButton: React.CSSProperties = {
  ...button,
  background: '#1a2233',
  borderColor: '#2a3547',
};

const select: React.CSSProperties = {
  ...button,
  background: '#1a2233',
  borderColor: '#2a3547',
  maxWidth: '100%',
};

const row: React.CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 };

const statusColor: Record<string, string> = {
  ready: '#6ee7a0', paused: '#ffd166', loading: '#6ebeff', recovering: '#ffd166', error: '#ff7b7b',
};

const attentionLabel: Record<string, string> = {
  attentive: 'looking at the display',
  away: 'looking away',
  blink: 'eyes closed',
  unknown: 'no face detected',
};

export default function ControlCenter() {
  const [state, setState] = useState<ProductState | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const accept = (next: ProductState) => { if (!cancelled) setState(next); };
    const unsubscribe = window.spd.onProductState(accept);
    void window.spd.getProductState().then(accept).catch(() => setNotice('Could not load product state.'));
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => void navigator.mediaDevices?.enumerateDevices()
      .then(devices => { if (!cancelled) setCameras(devices.filter(d => d.kind === 'videoinput')); })
      .catch(() => undefined);
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => { cancelled = true; navigator.mediaDevices?.removeEventListener?.('devicechange', refresh); };
  }, []);

  const act = async (label: string, run: () => Promise<unknown>) => {
    setBusy(true);
    try { await run(); setNotice(null); }
    catch (error) { setNotice(`${label} failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };

  const change = (change: SettingsChange) => void act('Settings change', () => window.spd.changeSettings(change));

  if (!state) {
    return (
      <div style={panel}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>SPD Settings</h1>
        <p>Loading product state…</p>
        <p style={{ fontSize: 13, color: '#9fb2cc' }}>
          Emergency pause at any time with Ctrl + Alt + Escape.
        </p>
      </div>
    );
  }

  const { runtime, paused, settings, displays, updateStatus } = state;
  const calibrationDone = settings.calibration !== null;

  return (
    <div style={panel}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>{settings.setupComplete ? 'SPD Settings' : 'Set up Spatial Pointer Device'}</h1>
      {!settings.setupComplete && <p>Choose your preferences, then finish setup. You can change them later from the system tray.</p>}

      <div style={section}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: '#9fb2cc' }}>RUNTIME STATUS</div>
        <p style={{ margin: '8px 0 0' }}>
          <strong style={{ color: statusColor[runtime.status] ?? '#eef5ff' }}>{runtime.status.toUpperCase()}</strong>
          {' — '}{runtime.reason}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#9fb2cc' }}>
          Inference p95 {Math.round(runtime.inferenceP95Ms)} ms · frame age {Math.round(runtime.frameAgeMs)} ms ·
          dropped {runtime.droppedFrames} · {runtime.tier} tier ·{' '}
          {attentionLabel[runtime.attention] ?? runtime.attention}
        </p>
      </div>

      <div style={section}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: '#9fb2cc' }}>INPUT CONTROL</div>
        <div style={row}>
          {paused
            ? <button style={button} disabled={busy} onClick={() => void act('Resume', () => window.spd.resume())}>Resume input</button>
            : <button style={button} disabled={busy} onClick={() => void act('Pause', () => window.spd.pause())}>Pause input</button>}
          <button style={secondaryButton} disabled={busy} onClick={() => void act('Retry camera', () => window.spd.retryCamera())}>Retry camera</button>
          <button style={secondaryButton} disabled={busy} onClick={() => void act('Setup', () => window.spd.startCalibration())}>
            {calibrationDone ? 'Redo attention setup' : 'Start attention setup'}
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#9fb2cc' }}>
          Emergency pause at any time with Ctrl + Alt + Escape.
        </p>
      </div>

      <div style={section}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: '#9fb2cc' }}>SETTINGS</div>
        <div style={row}>
          <label>
            Camera{' '}
            <select style={select} value={settings.cameraId} disabled={busy}
              onChange={event => change({ cameraId: event.target.value })}>
              <option value="">Default camera</option>
              {cameras.map((camera, index) =>
                <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>)}
            </select>
          </label>
          <label>
            Display{' '}
            <select style={select} value={settings.displayId ?? ''} disabled={busy}
              onChange={event => change({ displayId: event.target.value === '' ? null : Number(event.target.value) })}>
              <option value="">Primary display</option>
              {displays.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <label>
            Sensitivity{' '}
            <select style={select} value={settings.sensitivity} disabled={busy}
              onChange={event => change({ sensitivity: event.target.value as SettingsChange['sensitivity'] })}>
              <option value="deliberate">Deliberate</option>
              <option value="balanced">Balanced</option>
              <option value="responsive">Responsive</option>
            </select>
          </label>
        </div>
        <div style={row}>
          <label><input type="checkbox" checked={settings.startWithWindows} disabled={busy}
            onChange={event=>change({startWithWindows:event.target.checked})}/> Start SPD when Windows signs in (installed app)</label>
        </div>
        <div style={row}>
          <label>Click gestures{' '}<select style={select} value={settings.swapClicks?'swapped':'standard'} disabled={busy}
            onChange={event=>change({swapClicks:event.target.value==='swapped'})}>
            <option value="standard">Index = left, pinky = right</option>
            <option value="swapped">Pinky = left, index = right</option>
          </select></label>
        </div>
        <div style={row}>
          {([['buttonSnapping','Button snapping'],['scrollEnabled','Scroll gesture'],['workspaceEnabled','Virtual desktop gesture'],['overlayGestureEnabled','Overlay gesture']] as const).map(([key,label])=>
            <label key={key}><input type="checkbox" checked={settings[key]} disabled={busy} onChange={event=>change({[key]:event.target.checked})}/> {label}</label>)}
        </div>
        {!settings.setupComplete && <div style={row}><button style={button} disabled={busy} onClick={()=>change({setupComplete:true})}>Finish setup</button></div>}
        <p style={{ margin: '10px 0 0', fontSize: 13, color: calibrationDone ? '#6ee7a0' : '#ffd166' }}>
          {calibrationDone
            ? 'Attention calibration saved. Control pauses when you look away.'
            : 'Manual control is active. Run attention setup to enable gaze-based pausing.'}
        </p>
      </div>

      <div style={section}>
        <div style={{ fontSize: 13, letterSpacing: 2, color: '#9fb2cc' }}>UPDATES &amp; DIAGNOSTICS</div>
        <div style={row}>
          <button style={secondaryButton} disabled={busy} onClick={() => void act('Update check', () => window.spd.checkForUpdates())}>Check for updates</button>
          {updateStatus === 'available' && <button style={button} disabled={busy} onClick={() => void act('Download', () => window.spd.downloadUpdate())}>Download update</button>}
          {updateStatus === 'downloaded' && <button style={button} disabled={busy} onClick={() => void act('Install', () => window.spd.installUpdate())}>Install and restart</button>}
          <button style={secondaryButton} disabled={busy} onClick={() => void act('Diagnostics', () => window.spd.saveDiagnostics())}>Save diagnostics</button>
          <button style={secondaryButton} disabled={busy}
            onClick={() => void act('Landmark recording', () => window.spd.setTraceRecording(!state.traceRecording))}>
            {state.traceRecording ? 'Stop landmark recording' : 'Record landmarks'}
          </button>
          <span style={{ fontSize: 13, color: '#9fb2cc' }}>Updates: {updateStatus}</span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#9fb2cc' }}>
          Recording is off by default. If enabled, diagnostics retain up to 900 hand-landmark frames in memory; webcam images are never saved.
        </p>
      </div>

      {notice && <p style={{ color: '#ff7b7b' }} role="alert">{notice}</p>}
    </div>
  );
}
