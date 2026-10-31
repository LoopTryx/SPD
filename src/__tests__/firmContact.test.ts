import { expect,test } from 'vitest';
import { PointerButtonController } from '../spd/pointer-button-controller';
import { DragIntent } from '../spd/drag-intent';
import { pinchContactRatio } from '../spd/pinch-contact';
import { GestureEngine } from '../spd/gesture-engine';
import { hasControlPosture } from '../spd/takeover-guard';

const observation=(timestamp:number,ratio:number)=>({timestamp,valid:true,leftRatio:ratio,rightRatio:2,
  leftClosingVelocity:0,rightClosingVelocity:0,movementPalms:0,leftPoseAllowed:true,rightPoseAllowed:true,systemGestureActive:false});

test('a brief noisy near-contact frame does not restart a deliberate pinch',()=>{
  const buttons=new PointerButtonController();
  buttons.update(observation(0,.1));buttons.update(observation(50,.1));
  expect(buttons.update(observation(100,.22))).toEqual([]);
  expect(buttons.update(observation(150,.1))).toContainEqual({type:'button-down',button:'left'});
});

test('sustained separation cancels rather than completing a pinch',()=>{
  const buttons=new PointerButtonController();buttons.update(observation(0,.1));
  buttons.update(observation(50,.22));buttons.update(observation(100,.22));
  expect(buttons.update(observation(150,.1))).toEqual([]);
});

test.each([.22,.28,.31])('a visibly separated left pinch at %s palm lengths cannot press',ratio=>{
  const buttons=new PointerButtonController();
  const events=[0,50,100,150,200,250,300,400,500].flatMap(t=>buttons.update(observation(t,ratio)));
  expect(events.some(e=>e.type==='button-down')).toBe(false);
});

test('opening the tips moderately releases a hold without requiring a wide-open hand',()=>{
  const buttons=new PointerButtonController();
  [0,50,100,150,200,250].forEach(t=>buttons.update(observation(t,.1)));
  expect(buttons.snapshot().left.pressed).toBe(true);
  buttons.update(observation(300,.36));
  expect(buttons.update(observation(360,.36))).toContainEqual({type:'button-up',button:'left'});
});


test('finger jitter cannot drag a held click; deliberate palm travel starts a continuous drag',()=>{
  const drag=new DragIntent();
  drag.begin({x:.5,y:.5},{x:.5,y:.6},.2,0);
  expect(drag.update({x:.55,y:.55},{x:.501,y:.601},200)).toEqual({x:.5,y:.5});
  expect(drag.update({x:.6,y:.6},{x:.54,y:.6},250)).toEqual({x:.5,y:.5});
  expect(drag.update({x:.65,y:.6},{x:.59,y:.6},300)).toEqual({x:.55,y:.5});
});

test('contact must agree in the camera image even when estimated world tips overlap',()=>{
  const camera=Array.from({length:21},()=>[.5,.5,0]);
  camera[0]=[.5,.8,0];camera[9]=[.5,.6,0];camera[4]=[.4,.4,0];camera[8]=[.46,.4,0];
  const world=camera.map(p=>[...p]);world[4]=[...world[8]];
  expect(pinchContactRatio(camera,world,8,4/3)).toBeCloseTo(.4);
});

test('small monocular depth error cannot veto tips visibly joined in the camera',()=>{
  const camera=Array.from({length:21},()=>[.5,.5,0]);
  camera[0]=[.5,.8,0];camera[9]=[.5,.6,0];camera[4]=[.45,.4,0];camera[8]=[.455,.4,0];
  const world=camera.map(p=>[...p]);world[8][2]=.06;
  expect(pinchContactRatio(camera,world,8,4/3)).toBeLessThan(.18);
  world[8][2]=.2;
  expect(pinchContactRatio(camera,world,8,4/3)).toBeGreaterThan(.3);
});

test('a compact index pinch works with one other extended finger instead of an exaggerated open hand',()=>{
  const open=Array.from({length:21},()=>[.5,.7,0]);
  open[0]=[.5,.85,0];open[9]=[.5,.58,0];open[4]=[.32,.63,0];
  for(const [tip,x,y] of [[8,.42,.2],[12,.5,.18],[16,.58,.22],[20,.66,.3]]) {
    open[tip]=[x,y,0];open[tip-2]=[x,.5,0];
  }
  const pinch=open.map(p=>[...p]);pinch[8]=[.42,.49,0];pinch[4]=[.425,.49,0];
  pinch[12][1]=.68;pinch[16][1]=.68;
  expect(hasControlPosture(pinch)).toBe(true);
  const engine=new GestureEngine();const view={width:1920,height:1080};
  for(const t of [0,100,200])engine.update({landmarks:open,timestamp:t,confidence:.95},view);
  const actions=[300,350,400,450,500,550].flatMap(t=>engine.update({landmarks:pinch,timestamp:t,confidence:.95},view));
  expect(actions).toContainEqual({type:'button-down',button:'left'});
});
