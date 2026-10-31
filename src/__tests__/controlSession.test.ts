import { expect, test } from 'vitest';
import { ControlSession, type InputOutput } from '../spd/control-session';
import type { TrackingSample } from '../HandTracker';

function pose(pinched = false): number[][] {
  const p = Array.from({ length: 21 }, () => [.5, .7, 0]);
  p[0] = [.5, .85, 0]; p[9] = [.5, .58, 0]; p[4] = [.32, .63, 0];
  for (const [tip, x, y] of [[8,.42,.2],[12,.5,.18],[16,.58,.22],[20,.66,.3]]) {
    p[tip] = [x, y, 0]; p[tip - 2] = [x, .5, 0];
  }
  if (pinched) p[8] = [.325, .63, 0];
  return p;
}

function harness(onPointer: (point: { x: number; y: number } | null) => void = () => {}) {
  const actions: string[] = [];
  let clock = 100000;
  const output: InputOutput = {
    renewInputLease: async () => { actions.push('lease'); return true; },
    releaseInput: async () => { actions.push('release'); },
    moveCursor: async () => { actions.push('move'); return true; },
    setCursorButton: async (button, pressed) => { actions.push(button + (pressed ? '-down' : '-up')); return true; },
    scrollCursor: async () => true, switchWindowsWorkspace: async () => true,
  };
  const session = new ControlSession(output, onPointer, () => {}, () => clock);
  const calibration = { version: 2 as const, cameraId: '', displayId: null, createdAt: 0,
    center: [.5,.5,.5,.5], tolerance: [.2,.2,.2,.2] };
  const frame = async (timestamp: number, pinched = false, away = false, paused = false,
    profile: typeof calibration | null = calibration, blink = false, pointerX = .32,
    region?: {x:number;y:number;width:number;height:number},palmDelta=0,curled=false,occluded=false) => {
    clock = 100000 + timestamp;
    const sample: TrackingSample = { timestamp, capturedAtEpoch: clock, ready: true, tier: 'balanced',
      inferenceMs: 10, frameAgeMs: 0, droppedFrames: 0, delegate: 'CPU',
      face: { timestamp, faceCount: occluded ? 0 : 1, blink,
        features: occluded ? null : [away ? .95 : .5,.5,.5,.5],region } };
    const landmarks = pose(pinched);
    landmarks[4][0] = pointerX;
    if(pinched)landmarks[8]=[pointerX+.005,landmarks[4][1],0];
    if(curled){for(const tip of [8,12,16,20])landmarks[tip][1]=.68;landmarks[4]=[.48,.69,0];}
    if(palmDelta)for(const p of landmarks)p[0]+=palmDelta;
    const hand = { trackId: 1, landmarks, confidence: 1, handedness: 'Right', timestamp };
    return session.update(hand, null, sample, profile, paused, { width: 1920, height: 1080 });
  };
  return { session, frame, actions, output, setClock:(timestamp:number)=>{clock=100000+timestamp;},
    occludedFrame:(t:number,pinched=false)=>frame(t,pinched,false,false,calibration,false,.32,undefined,0,false,true) };
}

test('remapped index pinch presses and releases the right mouse button',async()=>{
  const h=harness();
  h.session.setOptions({swapClicks:true,buttonSnapping:false,scrollEnabled:true,workspaceEnabled:true,overlayGestureEnabled:true});
  for(let t=0;t<=600;t+=100)await h.frame(t);
  for(let t=700;t<=950;t+=50)await h.frame(t,true);
  for(let t=1000;t<=1100;t+=50)await h.frame(t);
  expect(h.actions).toContain('right-down');expect(h.actions).toContain('right-up');
  expect(h.actions).not.toContain('left-down');
});

test.each([8,20])('full session keeps a thumb fist engaged through finger %s click and release',async tip=>{
  const h=harness();
  for(let t=0;t<=600;t+=100)await h.frame(t);
  const landmarks=Array.from({length:21},()=>[.5,.67,0]);landmarks[0]=[.5,.85,0];landmarks[9]=[.5,.58,0];
  landmarks[3]=[.37,.78,0];landmarks[4]=[.24,.81,0];
  const send=async(t:number)=>{
    h.setClock(t);
    return h.session.update({trackId:1,landmarks,confidence:.95,handedness:'Right',timestamp:t},null,
      {timestamp:t,capturedAtEpoch:100000+t,ready:true,tier:'balanced',inferenceMs:1,frameAgeMs:0,droppedFrames:0,delegate:'CPU',
        face:{timestamp:t,faceCount:1,blink:false,features:[.5,.5,.5,.5]}},null,false,{width:1920,height:1080});
  };
  expect(await send(700)).toBe(true);
  landmarks[tip]=[.245,.81,0];
  for(const t of [750,800,850,900,950,1000,1050])expect(await send(t)).toBe(true);
  expect(h.actions).toContain(tip===8?'left-down':'right-down');
  landmarks[tip]=[.5,.67,0];await send(1100);await send(1160);
  expect(h.actions).toContain(tip===8?'left-up':'right-up');
});

test('closing-finger jitter stays at the pressed point until deliberate palm movement',async()=>{
  const h=harness();const positions:Array<{x:number;y:number}>=[];
  h.output.moveCursor=async(x,y)=>{positions.push({x,y});return true;};
  for(let t=0;t<=600;t+=100)await h.frame(t);
  for(let t=700;t<=950;t+=50)await h.frame(t,true);
  const pressed={...positions.at(-1)!};
  await h.frame(1000,true,false,false,undefined,false,.328);
  await h.session.samplePointer(1020);
  expect(positions.at(-1)).toEqual(pressed);
  await h.frame(1150,true,false,false,undefined,false,.32,undefined,.05);
  await h.session.samplePointer(1170);
  await h.frame(1200,true,false,false,undefined,false,.32,undefined,.1);
  await h.session.samplePointer(1220);
  expect(positions.at(-1)!.x).toBeLessThan(pressed.x-.01);
});

test('a slow but current target reply gets a usable lifetime after arrival',async()=>{
  const shown:boolean[]=[];
  const h=harness(point=>{if(point)shown.push('locked' in point && point.locked===true);});
  let resolve!: (targets:Array<{id:string;x:number;y:number;width:number;height:number}>)=>void;
  h.output.getPointerTargets=()=>new Promise(done=>{resolve=done;});
  for(let t=0;t<=900;t+=100)await h.frame(t);
  h.setClock(950);resolve([{id:'late',x:.78,y:.70,width:.04,height:.04}]);
  await Promise.resolve();await Promise.resolve();
  await h.frame(1000);
  await h.session.samplePointer(1010);await h.session.samplePointer(1120);
  expect(shown.at(-1)).toBe(true);
});

test('touching the face releases a drag and cannot resume closed after moving away',async()=>{
  const h=harness();
  for(let t=0;t<=600;t+=100)await h.frame(t);
  for(let t=700;t<=1000;t+=50)await h.frame(t,true);
  expect(h.actions).toContain('left-down');
  await h.frame(1050,true,false,false,undefined,false,.32,{x:.3,y:.1,width:.3,height:.6},0,true);
  expect(h.actions.at(-1)).toBe('release');
  const presses=h.actions.filter(a=>a==='left-down').length;
  for(let t=1100;t<=1800;t+=100)await h.frame(t,true);
  expect(h.actions.filter(a=>a==='left-down')).toHaveLength(presses);
});

test('deliberate pointing and pinching remain operational across the face projection',async()=>{
  const h=harness();const face={x:.3,y:.1,width:.3,height:.6};
  for(let t=0;t<=600;t+=100)await h.frame(t,false,false,false,undefined,false,.32,face);
  await h.session.samplePointer(620);
  expect(h.actions).toContain('move');
  for(let t=700;t<=1000;t+=50)await h.frame(t,true,false,false,undefined,false,.32,face);
  expect(h.actions).toContain('left-down');
});

test('brief hand occlusion can complete an intentional pinch but cannot extend indefinitely',async()=>{
  const h=harness();const face={x:.3,y:.1,width:.3,height:.6};
  for(let t=0;t<=900;t+=100)await h.frame(t,false,false,false,undefined,false,.32,face);
  for(let t=950;t<=1200;t+=50)await h.occludedFrame(t,true);
  expect(h.actions).toContain('left-down');
  await h.occludedFrame(1400,true);
  expect(h.actions.at(-1)).toBe('release');
});

test('eye occlusion cannot arm a new control session',async()=>{
  const h=harness();
  for(let t=0;t<=1000;t+=100)await h.occludedFrame(t);
  expect(h.actions).toEqual([]);
});

test('an idle curled secondary hand near the face does not shut down the pointing hand',async()=>{
  const h=harness();for(let t=0;t<=600;t+=100)await h.frame(t);
  const relaxed=pose();for(const tip of [8,12,16,20])relaxed[tip][1]=.68;
  h.setClock(700);
  const sample:TrackingSample={timestamp:700,capturedAtEpoch:100700,ready:true,tier:'balanced',inferenceMs:10,
    frameAgeMs:0,droppedFrames:0,delegate:'CPU',face:{timestamp:700,faceCount:1,blink:false,
      features:[.5,.5,.5,.5],region:{x:.3,y:.1,width:.3,height:.6}}};
  await h.session.update({trackId:1,timestamp:700,landmarks:pose(),confidence:.95,handedness:'Right'},
    {trackId:2,timestamp:700,landmarks:relaxed,confidence:.95,handedness:'Left'},sample,null,false,{width:1920,height:1080});
  await h.session.samplePointer(720);
  expect(h.actions).toContain('move');expect(h.actions).not.toContain('release');
});

test('an assisted click moves to the displayed button target before pressing',async()=>{
  const h=harness();
  const positions:Array<{x:number;y:number}>=[];
  h.output.getPointerTargets=async()=>[{id:'button',x:.78,y:.70,width:.04,height:.04}];
  h.output.moveCursor=async(x,y)=>{positions.push({x,y});h.actions.push('move');return true;};
  for(let t=0;t<=600;t+=100)await h.frame(t);
  await h.session.samplePointer(610);
  await h.session.samplePointer(720);
  await h.frame(700,true);
  await h.frame(800,true);
  await h.frame(900,true);
  await h.frame(950,true);
  const click=h.actions.indexOf('left-down');
  expect(click).toBeGreaterThan(0);expect(h.actions[click-1]).toBe('move');
  expect(positions.at(-1)?.x).toBeCloseTo(.8,3);
  expect(positions.at(-1)?.y).toBeCloseTo(.72,3);
});

test('a click cannot reuse an expired lock when no further cursor samples have been drawn',async()=>{
  const h=harness();const positions:Array<{x:number;y:number}>=[];
  h.output.getPointerTargets=async()=>[{id:'old',x:.78,y:.70,width:.04,height:.04}];
  h.output.moveCursor=async(x,y)=>{positions.push({x,y});return true;};
  for(let t=0;t<=600;t+=100)await h.frame(t);
  await h.session.samplePointer(610);await h.session.samplePointer(720);
  h.output.getPointerTargets=()=>new Promise(()=>{});
  for(let t=700;t<=1000;t+=100)await h.frame(t);
  for(let t=1100;t<=1350;t+=50)await h.frame(t,true);
  expect(h.actions).toContain('left-down');
  expect(positions.at(-1)?.y).toBeCloseTo(.716666666667,5);
});

test.each([15, 30, 60])('replay at %i FPS releases a deliberate drag on look-away and cannot resume it closed', async fps => {
  const h = harness();
  for (let t = 0; t < 650; t += 1000 / fps) await h.frame(Math.round(t));
  for (let t = 700; t < 1150; t += 1000 / fps) await h.frame(Math.round(t), true);
  expect(h.actions).toContain('left-down');
  await h.frame(1200, true, true);
  expect(h.actions[h.actions.length - 1]).toBe('release');
  const presses = h.actions.filter(a => a === 'left-down').length;
  for (let t = 1250; t < 2050; t += 1000 / fps) await h.frame(Math.round(t), true);
  expect(h.actions.filter(a => a === 'left-down')).toHaveLength(presses);
});

test('a brief blink suspends cursor motion without releasing a held drag', async () => {
  const h = harness();
  for (let t = 0; t <= 600; t += 100) await h.frame(t);
  for (let t = 700; t <= 950; t += 50) await h.frame(t, true);
  expect(h.actions).toContain('left-down');
  const before = h.actions.filter(action => action === 'move').length;
  await h.frame(1000, true, false, false, undefined, true);
  await h.session.samplePointer(1016);
  expect(h.actions.filter(action => action === 'move')).toHaveLength(before);
  expect(h.actions).not.toContain('release');
  await h.frame(1070, true);
  expect(h.actions).not.toContain('release');
  await h.frame(1300, true, false, false, undefined, true);
  expect(h.actions).toContain('release');
});

test('explicit pause cannot be bypassed by fresh valid frames', async () => {
  const h = harness();
  for (let t = 0; t <= 1000; t += 50) await h.frame(t, false, false, true);
  expect(h.actions).toEqual([]);
});

test('manual mode does not let an uncalibrated eye guess veto deliberate control', async () => {
  const h = harness();
  for (let t = 0; t <= 600; t += 100) await h.frame(t, false, false, false, null);
  await h.session.samplePointer(616);
  expect(h.actions.filter(a => a === 'move').length).toBeGreaterThan(0);
  // No calibration means there is no verified gaze boundary. Manual resume
  // and neutral hand arming remain required; do not label this gaze protection.
  const away = harness();
  for (let t = 0; t <= 600; t += 100) await away.frame(t, false, true, false, null);
  expect(away.actions).toContain('lease');
  expect(away.session.attention).toBe('manual');
});

test('manual mode accepts deliberate pinches despite missing eye samples',async()=>{
  const h=harness();
  for(let t=0;t<=650;t+=50)await h.frame(t,false,false,false,null,false,.32,undefined,0,false,true);
  for(let t=700;t<=1000;t+=50)await h.frame(t,true,false,false,null,false,.32,undefined,0,false,true);
  expect(h.actions).toContain('left-down');
  await h.frame(1100,false,false,false,null);await h.frame(1160,false,false,false,null);
  expect(h.actions).toContain('left-up');
});

test('fills cursor motion between camera frames and stops on cancellation', async () => {
  const h = harness();
  for (let t = 0; t <= 600; t += 100) await h.frame(t);
  const before = h.actions.filter(a => a === 'move').length;
  expect(before).toBe(0);
  await h.session.samplePointer(650);
  await h.session.samplePointer(700);
  expect(h.actions.filter(a => a === 'move').length).toBeGreaterThan(before);
  h.session.cancel();
  const after = h.actions.filter(a => a === 'move').length;
  await h.session.samplePointer(750);
  expect(h.actions.filter(a => a === 'move').length).toBe(after);
});

test('a newer pointer sample cannot be visually replaced by a late older acknowledgement', async () => {
  const visible: number[] = [];
  const pending: Array<(ok: boolean) => void> = [];
  const h = harness(point => { if (point) visible.push(point.x); });
  h.output.moveCursor = () => new Promise(resolve => pending.push(resolve));
  for (let t = 0; t <= 600; t += 100) await h.frame(t);
  const first = h.session.samplePointer(620);
  await h.frame(630, false, false, false, undefined, false, .35);
  const second = h.session.samplePointer(640);
  expect(pending).toHaveLength(1);
  pending.shift()!(true);
  await Promise.resolve();
  expect(visible).toHaveLength(0);
  expect(pending).toHaveLength(1);
  pending.shift()!(true);
  await Promise.all([first, second]);
  expect(visible).toHaveLength(1);
});

test('a late lease acknowledgement cannot issue input after cancellation', async () => {
  const h = harness();
  for (let t = 0; t < 500; t += 100) await h.frame(t);
  let acknowledge!: (ok: boolean) => void;
  h.output.renewInputLease = () => new Promise(resolve => { acknowledge = resolve; });
  const pending = h.frame(500);
  h.session.cancel(); acknowledge(true); await pending;
  expect(h.actions).not.toContain('move');
});

test('reports acknowledged cursor latency from the capture timestamp', async () => {
  const observed: Array<{ capturedAtEpoch: number; acknowledgedAtEpoch: number; x: number }> = [];
  const h = harness();
  h.session.onInput = sample => observed.push({ capturedAtEpoch: sample.capturedAtEpoch,
    acknowledgedAtEpoch: sample.acknowledgedAtEpoch, x: sample.actual.x });
  for (let t = 0; t <= 600; t += 100) await h.frame(t);
  await h.session.samplePointer(620);
  expect(observed).toHaveLength(1);
  expect(observed[0].capturedAtEpoch).toBe(100600);
  expect(observed[0].acknowledgedAtEpoch).toBeGreaterThanOrEqual(100600);
});

test('attributes a delayed cursor acknowledgement to its own camera frame', async () => {
  const captured: number[] = [];
  const pending: Array<(ok: boolean) => void> = [];
  const h = harness();
  h.session.onInput = sample => captured.push(sample.capturedAtEpoch);
  h.output.moveCursor = () => new Promise(resolve => pending.push(resolve));
  for (let t = 0; t <= 600; t += 100) await h.frame(t);
  const first = h.session.samplePointer(620);
  await h.frame(700, false, false, false, undefined, false, .35);
  const second = h.session.samplePointer(720);
  pending.shift()!(true);
  await Promise.resolve();
  expect(captured).toEqual([100600]);
  pending.shift()!(true);
  await Promise.all([first, second]);
  expect(captured).toEqual([100600, 100700]);
});

test('a stationary pointer does not flood native input with duplicate pixel moves', async () => {
  const h = harness();
  for (let t = 0; t <= 600; t += 100) await h.frame(t);
  for (let t = 620; t <= 900; t += 16) await h.session.samplePointer(t);
  expect(h.actions.filter(action => action === 'move')).toHaveLength(1);
});
