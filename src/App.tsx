import { useEffect, useRef, useState } from 'react';
import type { ProductState, RuntimeStatus } from '../electron/product/contracts';
import BlueHalo, { type GlowMode } from './BlueHalo';
import CameraFeed, { type CameraFeedHandle } from './CameraFeed';
import PseudoCursor, { type PseudoCursorHandle } from './PseudoCursor';
import { HandTracker, selectSecondaryControlHand, type TrackingSample } from './HandTracker';
import { ControlSession } from './spd/control-session';
import { CalibrationSession, type CalibrationProgress } from './spd/calibration-session';
import { DiagnosticsRecorder } from './spd/diagnostics-recorder';

export default function App() {
  const [product, setProduct] = useState<ProductState | null>(null);
  const productRef = useRef<ProductState | null>(null);
  const [visible, setVisible] = useState(true);
  const [glowMode, setGlowMode] = useState<GlowMode>('waiting');
  const trackerRef = useRef<HandTracker | null>(null);
  const [retry, setRetry] = useState(0);
  const retries = useRef(0);
  const videoRef = useRef<CameraFeedHandle>(null);
  const pseudoCursor=useRef<PseudoCursorHandle>(null);
  const calibration = useRef<CalibrationSession | null>(null);
  const [progress, setProgress] = useState<CalibrationProgress | null>(null);
  const controller = useRef<ControlSession | null>(null);
  const diagnostics = useRef<DiagnosticsRecorder | null>(null);
  if (!diagnostics.current) diagnostics.current = new DiagnosticsRecorder();
  if (!controller.current) controller.current = new ControlSession(window.spd,
    point => pseudoCursor.current?.show(point), () => setVisible(value => !value));
  controller.current.onInput = sample => diagnostics.current?.input(sample);
  controller.current.onInterruption = () => diagnostics.current?.interruption();
  const runtime = useRef<RuntimeStatus>({ status: 'loading', reason: 'Starting local vision models.',
    tier: 'balanced', inferenceP95Ms: 0, frameAgeMs: 0, droppedFrames: 0, attention: 'unknown' });
  const lastPublished = useRef('');
  const publish = (next: RuntimeStatus) => {
    runtime.current = next;
    const key = JSON.stringify(next);
    if (lastPublished.current !== key) {
      lastPublished.current = key;
      void window.spd.publishRuntime(next).catch(() => controller.current?.cancel());
    }
  };
  const fail = (reason: string) => {
    setGlowMode('error');
    calibration.current = null; setProgress(null);
    controller.current?.cancel();
    publish({ ...runtime.current, status: 'error', reason });
  };

  useEffect(() => {
    let cancelled = false;
    const accept = (state: ProductState) => {
      if (cancelled) return;
      const previous = productRef.current;
      if (state.paused !== previous?.paused || state.settings.cameraId !== previous?.settings.cameraId ||
        state.settings.displayId !== previous?.settings.displayId || state.settings.calibration !== previous?.settings.calibration &&
        JSON.stringify(state.settings.calibration) !== JSON.stringify(previous?.settings.calibration)) controller.current?.cancel();
      if (state.settings.sensitivity !== previous?.settings.sensitivity) controller.current?.setSensitivity(state.settings.sensitivity);
      const keys=['swapClicks','buttonSnapping','scrollEnabled','workspaceEnabled','overlayGestureEnabled'] as const;
      if(keys.some(key=>state.settings[key]!==previous?.settings[key])) controller.current?.setOptions({
        swapClicks:state.settings.swapClicks,buttonSnapping:state.settings.buttonSnapping,scrollEnabled:state.settings.scrollEnabled,
        workspaceEnabled:state.settings.workspaceEnabled,overlayGestureEnabled:state.settings.overlayGestureEnabled});
      diagnostics.current?.setTraceEnabled(state.traceRecording ?? false);
      productRef.current = state; setProduct(state);
      if (state.paused) setGlowMode('paused');
      trackerRef.current?.setPaused(state.paused, calibration.current !== null);
    };
    const unsubscribe = window.spd.onProductState(accept);
    void window.spd.getProductState().then(accept).catch(error => fail(String(error)));
    const emergency = window.spd.onEmergencyReset(() => {
      controller.current?.cancel(); calibration.current = null; setProgress(null);
    });
    const command = window.spd.onCommand(value => {
      controller.current?.cancel();
      if (value === 'retry') {
        calibration.current = null; setProgress(null); retries.current = 0; setRetry(n => n + 1);
      } else if (trackerRef.current?.status === 'running') {
        calibration.current = new CalibrationSession(performance.now());
        trackerRef.current.setPaused(true, true);
        setProgress(calibration.current.progress(performance.now()));
      } else fail('Wait for the camera to finish loading, then start setup again.');
    });
    const trace = window.spd.onTraceRecording(enabled => diagnostics.current?.setTraceEnabled(enabled));
    const requestDiagnostics = window.spd.onDiagnosticsRequest(() => {
      const snapshot = diagnostics.current?.snapshot();
      if (snapshot) void window.spd.publishDiagnostics(snapshot).catch(() => {});
    });
    return () => { cancelled = true; unsubscribe(); emergency(); command(); trace(); requestDiagnostics(); controller.current?.cancel(); };
  }, []);

  // Camera frames arrive below display rate; interpolate the pointer so motion
  // stays smooth instead of stepping once per tracked frame.
  useEffect(() => {
    let frame = 0;
    let lastSample = -Infinity;
    const loop = (timestamp: number) => {
      if (timestamp - lastSample >= 1000 / 60 - 1) {
        lastSample = timestamp;
        void controller.current?.samplePointer(performance.now());
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const cameraId = product?.settings.cameraId ?? '';
  const loaded = product !== null;
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    let lastFrameAt = performance.now();
    let lastMetricsAt = -Infinity;
    let recovery: ReturnType<typeof setTimeout> | null = null;
    const service = new HandTracker();
    trackerRef.current = service;
    service.setPaused(productRef.current?.paused ?? true);
    const recover = (reason: string) => {
      if (cancelled || recovery) return;
      controller.current?.cancel(); calibration.current = null; setProgress(null);
      setGlowMode('waiting');
      if (retries.current < 3 && !/access is blocked|selected camera is unavailable/i.test(reason)) {
        const delay = 1000 * 2 ** retries.current++;
        publish({ ...runtime.current, status: 'recovering', reason: reason + ' Retrying shortly.' });
        recovery = setTimeout(() => setRetry(n => n + 1), delay);
      } else fail(reason + ' Use Retry camera in SPD Settings.');
    };
    service.onStatusChange((status, error) => {
      if (cancelled) return;
      if (status === 'error') recover(error ?? 'Vision stopped.');
      else if (status !== 'idle' && status !== 'running') publish({ ...runtime.current, status: 'loading',
        reason: status === 'warming-up' ? 'Measuring camera performance. Input is paused.' : 'Loading camera and local vision models.' });
    });
    const unsubscribe = service.onFrame((primary, result, sample) => {
      if (cancelled) return;
      lastFrameAt = performance.now();
      diagnostics.current?.frame({ timestamp: sample.timestamp, inferenceMs: sample.inferenceMs,
        droppedFrames: sample.droppedFrames, landmarks: result.landmarks });
      const state = productRef.current;
      if (!state) return;
      const setup = calibration.current;
      if (setup) setup.observe(sample.face, performance.now());
      const secondary = primary ? selectSecondaryControlHand(result, primary.trackId, primary.timestamp,primary.cameraAspectRatio) : null;
      void controller.current?.update(primary, secondary, sample, state.settings.calibration,
        state.paused || !!setup, { width: innerWidth, height: innerHeight }).then(active => {
          if (!cancelled) setGlowMode(active ? 'active' : state.paused ? 'paused' : 'waiting');
        }).catch(error => { if (!cancelled) fail(String(error)); });
      if (performance.now() - lastMetricsAt > 500) {
        lastMetricsAt = performance.now();
        const attention = controller.current?.attention ?? 'unknown';
        // Gaze protection requires a saved calibration. Otherwise report manual
        // mode honestly instead of silently blocking on an unfitted eye model.
        const calibrated = state.settings.calibration !== null;
        const attentionBlocked = attention !== 'attentive' && attention !== 'occluded' && attention !== 'manual';
        const controlBlocked=controller.current?.blockedReason;
        const blockedReason = attention === 'unknown'
          ? 'Input paused: eyes not visible. Look at the display to take control.'
          : attention === 'blink' ? 'Input paused: eyes closed.'
          : 'Input paused: look at the display to take control.';
        const reason = setup ? 'Follow the setup target. Input remains paused.' :
          !sample.ready ? 'Measuring camera performance. Input is paused.' :
          state.paused ? 'Paused. Resume from SPD Settings when ready.' :
          attentionBlocked ? blockedReason :
          controlBlocked ? controlBlocked :
          attention==='occluded'?'Brief hand occlusion: continuing previously verified control.':
          !calibrated ? 'Ready. Manual control: gaze protection needs attention setup. Neutral hand and pinch guards are active.' :
          !primary ? 'Ready. Bring an open hand into view.' : 'Ready. Looking at the display enables control.';
        publish({ status: sample.ready ? (state.paused || attentionBlocked || controlBlocked ? 'paused' : 'ready') : 'loading', reason,
          tier: sample.tier, inferenceP95Ms: service.getInferenceP95(), frameAgeMs: Math.round(sample.frameAgeMs),
          droppedFrames: sample.droppedFrames, attention });
      }
    });
    const watchdog = setInterval(() => {
      if (performance.now() - lastFrameAt > 150) { controller.current?.cancel(); setGlowMode('waiting'); }
      if (service.status === 'running' && performance.now() - lastFrameAt > 3000) {
        service.stop(); recover('The camera stopped delivering frames.');
      }
      const setup = calibration.current;
      if (!setup) return;
      const next = setup.progress(performance.now());
      setProgress(previous => previous?.step === next.step && previous.secondsLeft === next.secondsLeft ? previous : next);
      if (next.done) {
        calibration.current = null; setProgress(null); service.setPaused(true);
        const settings = productRef.current!.settings;
        try {
          const profile = setup.finish(settings.cameraId, settings.displayId, performance.now());
          void window.spd.saveCalibration(profile).catch(error => fail(String(error)));
        } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
      }
    }, 50);
    const start = async () => {
      const video = videoRef.current?.getVideo();
      if (!video) throw new Error('The camera element is unavailable.');
      await service.init(video, { cameraId });
      if (cancelled) { service.stop(); return; }
      await service.startCamera();
      if (cancelled) service.stop();
    };
    void start().catch(error => { if (!cancelled && service.status !== 'error') recover(String(error)); });
    return () => {
      cancelled = true; clearInterval(watchdog); if (recovery) clearTimeout(recovery);
      unsubscribe(); controller.current?.cancel(); service.stop();
      if (trackerRef.current === service) trackerRef.current = null;
    };
  }, [loaded, cameraId, retry]);

  return <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
    {visible && !progress && <><BlueHalo mode={glowMode} /><PseudoCursor ref={pseudoCursor}/></>}
    {progress && <div role="status" style={{ position: 'fixed', inset: 0, background: 'rgba(12,25,42,.94)', color: '#eef5ff', fontFamily: 'Segoe UI, sans-serif' }}>
      <div style={{ position: 'absolute', top: '43%', left: '20%', width: '60%', textAlign: 'center' }}>
        <div style={{ fontSize: 16, letterSpacing: 3 }}>SPD / ATTENTION SETUP</div>
        <h1 style={{ fontSize: 28, fontWeight: 500 }}>{progress.away ? 'Look away using only your eyes' : 'Look at the blue dot'}</h1>
        <p>Keep your head facing the display. {progress.secondsLeft} seconds remaining.</p>
        <p style={{ fontSize: 13 }}>All control is paused. Ctrl+Alt+Esc cancels setup.</p>
      </div>
      {!progress.away && <div style={{ position: 'absolute', left: `${progress.x * 100}%`, top: `${progress.y * 100}%`,
        width: 24, height: 24, borderRadius: '50%', background: '#6ebeff', border: '3px solid #fff', transform: 'translate(-50%,-50%)' }} />}
    </div>}
    <CameraFeed ref={videoRef} />
  </div>;
}
