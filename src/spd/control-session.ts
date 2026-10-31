import type { ControlHand, TrackingSample } from '../HandTracker';
import { AttentionGate, type AttentionState } from './attention-gate';
import { classifyAttention, type AttentionCalibration } from './attention-estimator';
import { GestureCoordinator, type GestureViewport } from './gesture-coordinator';
import { isNeutralHand, type GestureEvent } from './gesture-engine';
import { PointerMotionFilter } from './pointer-motion-filter';
import { PointerMotionScheduler } from './pointer-motion-scheduler';
import { isCasualHand, hasControlPosture,handOverlapsFace,type FaceRegion } from './takeover-guard';
import { MagneticPointer, type PointerTarget, type AssistedPoint } from './magnetic-pointer';
import { DragIntent } from './drag-intent';

export interface InputOutput {
  getPointerTargets?(x:number,y:number):Promise<PointerTarget[]>;
  renewInputLease(timestamp: number): Promise<boolean>;
  releaseInput(): Promise<void>;
  moveCursor(x: number, y: number): Promise<boolean>;
  setCursorButton(button: 'left' | 'right', pressed: boolean): Promise<boolean>;
  scrollCursor(delta: number): Promise<boolean>;
  switchWindowsWorkspace(direction: 'next' | 'previous'): Promise<boolean>;
}

/** Same controller drives live frames and action-disabled replay tests. */
export class ControlSession {
  private options={swapClicks:false,buttonSnapping:true,scrollEnabled:true,workspaceEnabled:true,overlayGestureEnabled:true};
  setOptions(options:typeof this.options):void {
    this.cancel();this.options={...options};this.gestures.setFeatures(options);
  }
  private readonly gate = new AttentionGate();
  private readonly gestures = new GestureCoordinator();
  private readonly filter = new PointerMotionFilter();
  /** Camera frames arrive well below display rate; the scheduler fills the gaps. */
  private readonly scheduler = new PointerMotionScheduler();
  private readonly magnet = new MagneticPointer();
  private targetRequest: object | null = null;
  private targetQueryAt = -Infinity;
  private readonly heldButtons = new Set<'left'|'right'>();
  private readonly dragIntent=new DragIntent();
  private palm={x:0,y:0,scale:1};
  private dragOffset = {x:0,y:0};
  private offsetAt = 0;
  private systemGestureUntil = -Infinity;
  private pressing = false;
  private epoch = 0;
  private pending: object | null = null;
  private active = false;
  private latestMotion: { point: AssistedPoint; capturedAtEpoch: number;
    target: { x: number; y: number } } | null = null;
  private motionPump: Promise<void> | null = null;
  private motionVersion = 0;
  private motionSuspended = false;
  private capturedAtEpoch = 0;
  private desiredPoint: { x: number; y: number } | null = null;
  private viewport: GestureViewport = { width: 1, height: 1 };
  private lastAcknowledgedPixel: { x: number; y: number } | null = null;
  onInput?: (sample: { capturedAtEpoch: number; acknowledgedAtEpoch: number;
    target: { x: number; y: number }; actual: { x: number; y: number } }) => void;
  onInterruption?: () => void;
  attention: AttentionState = 'unknown';
  blockedReason:string|null=null;
  private lastVerifiedAttention=-Infinity;
  private lastFaceRegion:FaceRegion|undefined;

  constructor(private readonly output: InputOutput,
    private readonly showPointer: (point: (AssistedPoint | {x:number;y:number}) | null) => void,
    private readonly toggleOverlay: () => void,
    private readonly clock: () => number = Date.now) {}

  setSensitivity(preset: 'deliberate' | 'balanced' | 'responsive'): void {
    this.cancel();
    this.gestures.setSensitivity(preset);
  }

  cancel(resetAttention = true): void {
    this.epoch++;
    if (resetAttention) { this.gate.reset();this.lastVerifiedAttention=-Infinity;this.lastFaceRegion=undefined; }
    if (this.gestures.reset().some(event => event.type === 'button-up')) this.onInterruption?.();
    this.filter.reset(); this.scheduler.reset(); this.showPointer(null);
    this.magnet.reset(); this.targetRequest=null; this.targetQueryAt=-Infinity;
    this.heldButtons.clear(); this.dragOffset={x:0,y:0};
    this.dragIntent.reset();
    this.offsetAt=0; this.systemGestureUntil=-Infinity;
    this.pressing=false;
    this.latestMotion = null; this.motionVersion++;
    this.desiredPoint = null;
    this.lastAcknowledgedPixel = null;
    this.motionSuspended = false;
    if (this.active || this.pending) void this.output.releaseInput().catch(() => {});
    this.active = false; this.pending = null;
  }

  async update(primary: ControlHand | null, secondary: ControlHand | null, sample: TrackingSample,
    calibration: AttentionCalibration | null, paused: boolean, viewport: GestureViewport): Promise<boolean> {
    this.viewport = viewport;
    this.blockedReason=null;
    const age = this.clock() - sample.capturedAtEpoch;
    this.attention = calibration ? classifyAttention(sample.face, calibration, sample.timestamp + Math.max(0, age)) : 'manual';
    if (paused || !primary || !sample.ready || age < 0 || age > 150) {
      this.cancel();this.blockedReason=paused?'Input paused. Ctrl+Alt+Space resumes control.':
        !primary?'Bring a pointing hand into view.':!sample.ready?'Camera warming up.':'Waiting for a fresh camera frame.';return false;
    }
    if (!hasControlPosture(primary.poseLandmarks ?? primary.landmarks) || isCasualHand(primary.landmarks,sample.face?.region)) {
      this.cancel();this.blockedReason='Point deliberately or form a pinch; relaxed/gripping hands do not control SPD.';return false;
    }
    if(secondary && (!hasControlPosture(secondary.poseLandmarks ?? secondary.landmarks) || isCasualHand(secondary.landmarks,sample.face?.region)))secondary=null;
    if(this.attention==='attentive') {
      this.lastVerifiedAttention=sample.timestamp;
      if(sample.face?.region)this.lastFaceRegion=sample.face.region;
    }
    // Only an already engaged, deliberately posed hand may bridge a brief eye
    // occlusion. Never use this to arm, extend an occlusion, or override look-away.
    if(this.attention==='unknown' && this.active && sample.face?.faceCount!==2 &&
        sample.timestamp-this.lastVerifiedAttention>=0 && sample.timestamp-this.lastVerifiedAttention<=400 &&
        handOverlapsFace(primary.landmarks,this.lastFaceRegion))this.attention='occluded';
    const neutral = isNeutralHand(primary.poseLandmarks ?? primary.landmarks) &&
      (!secondary || isNeutralHand(secondary.poseLandmarks ?? secondary.landmarks));
    // Calibrated gaze gates attention. Without a fitted profile, manual resume
    // plus a neutral hand arms input; guessed eye coordinates cannot veto it.
    if (!this.gate.update(this.attention==='occluded' || this.attention==='manual'?'attentive':this.attention, sample.timestamp, neutral)) {
      if (this.gate.inAttentionGrace) {
        this.motionSuspended = true;
        this.latestMotion = null;
        this.motionVersion++;
        this.blockedReason='Brief eye-tracking interruption.';
        return false;
      }
      this.cancel(false);this.blockedReason=this.attention==='away'?'Look at the display to engage control.':
        this.attention==='unknown'?'Eyes are not visible. Lower the hand briefly to reacquire attention.':
        this.attention==='blink'?'Eyes closed.':'Hold an open neutral hand briefly to engage.';return false;
    }
    this.motionSuspended = false;
    if (this.pending) return false;
    this.palm={x:primary.landmarks[9][0],y:primary.landmarks[9][1],
      scale:Math.hypot(primary.landmarks[9][0]-primary.landmarks[0][0],primary.landmarks[9][1]-primary.landmarks[0][1])};
    const token = {}; this.pending = token;
    const epoch = this.epoch;
    try {
      const leased = await this.output.renewInputLease(sample.capturedAtEpoch);
      if (epoch !== this.epoch) return false;
      if (!leased || this.clock() - sample.capturedAtEpoch > 150) { this.cancel(); return false; }
      this.active = true;
      this.capturedAtEpoch = sample.capturedAtEpoch;
      const events = this.gestures.update(primary, secondary, viewport);
      for (const event of events) {
        if (epoch !== this.epoch) return false;
        const accepted = await this.dispatch(event, sample.timestamp);
        if (epoch !== this.epoch) return false;
        if (!accepted) {
          this.cancel(); throw new Error('Windows rejected an input command. SPD paused; retry from SPD Settings.');
        }
      }
      return true;
    } catch (error) { this.cancel(); throw error; }
    finally { if (this.pending === token) this.pending = null; }
  }

  /**
   * Emits interpolated cursor positions between camera frames. Safe to call on
   * every display frame: it is inert unless control is currently leased.
   */
  async samplePointer(now: number): Promise<void> {
    if (!this.active || this.motionSuspended || this.pressing) return;
    const raw = this.scheduler.sample(now);
    if (!raw) return;
    const point = this.assist(raw,now);
    if (this.samePixel(point)) { this.showPointer(point); return; }
    this.latestMotion = { point, capturedAtEpoch: this.capturedAtEpoch,
      target: this.desiredPoint ?? raw };
    this.motionVersion++;
    if (!this.motionPump) {
      const pump = this.flushMotion();
      this.motionPump = pump;
      void pump.finally(() => { if (this.motionPump === pump) this.motionPump = null; });
    }
    await this.motionPump;
  }

  private async flushMotion(): Promise<void> {
    while (this.active && this.latestMotion) {
      const { point, capturedAtEpoch, target } = this.latestMotion;
      const version = this.motionVersion;
      this.latestMotion = null;
      if (this.samePixel(point)) continue;
      try {
        const epoch=this.epoch;
        const moved = await this.output.moveCursor(point.x, point.y);
        if (moved && this.active && epoch===this.epoch) {
          this.lastAcknowledgedPixel = this.pixel(point);
          this.onInput?.({ capturedAtEpoch, acknowledgedAtEpoch: this.clock(), target, actual: point });
          if (version === this.motionVersion) this.showPointer(point);
        }
      } catch { /* Camera frames own cancellation; a missed motion sample can be replaced. */ }
    }
  }

  private assist(point:{x:number;y:number},now:number):AssistedPoint {
    const held=this.heldButtons.size>0;
    if(held) return {...this.dragIntent.update(point,this.palm,now),locked:false};
    if (!held) {
      const decay=Math.exp(-Math.max(0,now-this.offsetAt)/80);
      this.dragOffset={x:this.dragOffset.x*decay,y:this.dragOffset.y*decay};
    }
    this.offsetAt=now;
    const adjusted={x:Math.max(0,Math.min(1,point.x+this.dragOffset.x)),
      y:Math.max(0,Math.min(1,point.y+this.dragOffset.y))};
    return this.options.buttonSnapping ? this.magnet.update(adjusted,now,this.viewport,held || now<this.systemGestureUntil) : {...adjusted,locked:false};
  }

  private refreshTargets(point:{x:number;y:number},timestamp:number):void {
    if (!this.options.buttonSnapping || !this.output.getPointerTargets || this.targetRequest || this.heldButtons.size || timestamp-this.targetQueryAt<150) return;
    this.targetQueryAt=timestamp;
    const token={}; this.targetRequest=token;
    const epoch=this.epoch;
    const requestedAt=this.clock();
    void this.output.getPointerTargets(point.x,point.y).then(targets=>{
      if (epoch!==this.epoch || !this.active || !this.desiredPoint) return;
      const distance=Math.hypot((this.desiredPoint.x-point.x)*this.viewport.width,(this.desiredPoint.y-point.y)*this.viewport.height);
      const elapsed=this.clock()-requestedAt;
      if (distance<=64 && elapsed>=0 && elapsed<=1500) this.magnet.setTargets(targets,timestamp+elapsed);
    }).catch(()=>{ if (epoch===this.epoch) this.magnet.setTargets([],timestamp); })
      .finally(()=>{if(this.targetRequest===token)this.targetRequest=null;});
  }

  private async press(button:'left'|'right',timestamp:number):Promise<boolean> {
    const epoch=this.epoch;
    const palm={...this.palm};
    const raw=this.scheduler.sample(timestamp);
    // Re-evaluate target freshness even if the last drawn ring was locked.
    const point=raw ? this.assist(raw,timestamp) : null;
    this.pressing=true;
    try {
    this.latestMotion=null; this.motionVersion++;
    if(this.motionPump)await this.motionPump;
    if(epoch!==this.epoch || !this.active)return false;
    if(this.motionSuspended) { this.cancel(false);return false; }
    // A click must land at the ring the user sees, even between display ticks.
    if(point && !await this.output.moveCursor(point.x,point.y))return false;
    if(epoch!==this.epoch || !this.active)return false;
    if(this.motionSuspended) { this.cancel(false);return false; }
    if(point) { this.lastAcknowledgedPixel=this.pixel(point);this.showPointer(point); }
    const pressed=await this.output.setCursorButton(button,true);
    if(pressed && epoch===this.epoch) {
      this.heldButtons.add(button);
      if(point)this.dragIntent.begin(point,palm,palm.scale,timestamp);
      if(raw && point)this.dragOffset={x:point.x-raw.x,y:point.y-raw.y};
      this.offsetAt=timestamp;
    }
    return pressed;
    } finally { if(epoch===this.epoch)this.pressing=false; }
  }

  private pixel(point: { x: number; y: number }): { x: number; y: number } {
    return { x: Math.round(point.x * Math.max(0, this.viewport.width - 1)),
      y: Math.round(point.y * Math.max(0, this.viewport.height - 1)) };
  }

  private samePixel(point: { x: number; y: number }): boolean {
    const pixel = this.pixel(point);
    return pixel.x === this.lastAcknowledgedPixel?.x && pixel.y === this.lastAcknowledgedPixel.y;
  }

  private async dispatch(event: GestureEvent, timestamp: number): Promise<boolean> {
    if(this.options.swapClicks && (event.type==='button-down' || event.type==='button-up'))
      event={...event,button:event.button==='left'?'right':'left'};
    switch (event.type) {
      case 'move': {
        const point = this.filter.update(event, timestamp);
        this.desiredPoint = { x: event.x, y: event.y };
        this.scheduler.setTarget(point, timestamp);
        this.refreshTargets(event,timestamp);
        return true;
      }
      case 'button-down': return this.press(event.button,timestamp);
      case 'button-up': this.heldButtons.delete(event.button);this.dragIntent.reset();return this.output.setCursorButton(event.button, false);
      case 'scroll': this.systemGestureUntil=timestamp+180;return this.output.scrollCursor(event.delta);
      case 'workspace-switch': this.magnet.reset();this.systemGestureUntil=timestamp+300;return this.output.switchWindowsWorkspace(event.direction);
      case 'overlay-toggle': this.toggleOverlay(); return true;
    }
  }
}
