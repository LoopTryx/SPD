import { expect,test } from 'vitest';
import { GestureEngine } from '../spd/gesture-engine';
import { isNeutralHand } from '../spd/gesture-engine';
import { extractPointerData } from '../HandTracker';
import { hasControlPosture } from '../spd/takeover-guard';

test('ordinary pointer motion uses the thumb even if the index moves elsewhere',()=>{
  const p=Array.from({length:21},()=>[.5,.65,0]);p[0]=[.5,.85,0];p[9]=[.5,.58,0];p[4]=[.35,.5,0];p[8]=[.7,.3,0];
  const engine=new GestureEngine();const view={width:1920,height:1080};
  expect(engine.update({landmarks:p,confidence:.95,timestamp:0},view,{pointer:true,gestures:false}))
    .toContainEqual({type:'move',x:.75,y:.5});
  p[8]=[.2,.8,0];
  expect(engine.update({landmarks:p,confidence:.95,timestamp:50},view,{pointer:true,gestures:false}))
    .toContainEqual({type:'move',x:.75,y:.5});
});

test('tracker pointer data uses thumb tip rather than index tip',()=>{
  const p=Array.from({length:21},()=>({x:.8,y:.8,z:0,visibility:.9}));p[4]={x:.3,y:.4,z:-.1,visibility:.9};
  expect(extractPointerData(p)?.x).toBe(.3);expect(extractPointerData(p)?.y).toBe(.4);
});

test('a deliberately extended thumb works with the index curled',()=>{
  const p=Array.from({length:21},()=>[.5,.68,0]);p[0]=[.5,.85,0];p[9]=[.5,.58,0];
  p[3]=[.39,.51,0];p[4]=[.3,.35,0];
  expect(hasControlPosture(p)).toBe(true);
});

test('a relaxed thumb fist can arm without stretching every curled fingertip away',()=>{
  const p=Array.from({length:21},()=>[.5,.7,0]);p[0]=[.5,.85,0];p[9]=[.5,.58,0];
  p[3]=[.4,.65,0];p[4]=[.34,.59,0];p[6]=[.46,.58,0];p[8]=[.46,.65,0];
  expect(hasControlPosture(p)).toBe(true);expect(isNeutralHand(p)).toBe(true);
});

test('joining the index to a stationary thumb never shifts the pointer to a midpoint',()=>{
  const p=Array.from({length:21},()=>[.5,.65,0]);p[0]=[.5,.85,0];p[9]=[.5,.58,0];
  p[4]=[.35,.5,0];p[8]=[.7,.3,0];p[10]=[.5,.5,0];p[12]=[.5,.18,0];
  const engine=new GestureEngine();const view={width:1920,height:1080};
  engine.update({landmarks:p,timestamp:0,confidence:.95},view);
  engine.update({landmarks:p,timestamp:150,confidence:.95},view);
  p[8]=[.355,.5,0];
  const events=[200,250,300,350,400,450].flatMap(timestamp=>{
    const events=engine.update({landmarks:p,timestamp,confidence:.95},view);
    expect(events.find(e=>e.type==='move')).toEqual({type:'move',x:.75,y:.5});
    return events;
  });
  expect(events).toContainEqual({type:'button-down',button:'left'});
});

test('a sideways thumb above a curled fist remains a control posture',()=>{
  const p=Array.from({length:21},()=>[.5,.67,0]);p[0]=[.5,.85,0];p[9]=[.5,.58,0];
  p[3]=[.36,.61,0];p[4]=[.23,.85,0];
  expect(hasControlPosture(p)).toBe(true);
});

test.each([8,20])('a thumb-only pointer can pinch finger %s with the others curled',tip=>{
  const open=Array.from({length:21},()=>[.5,.67,0]);open[0]=[.5,.85,0];open[9]=[.5,.58,0];
  open[3]=[.37,.78,0];open[4]=[.24,.81,0];
  const engine=new GestureEngine();const view={width:1920,height:1080};
  [0,100,200].forEach(timestamp=>engine.update({landmarks:open,timestamp,confidence:.95},view));
  const pinch=open.map(p=>[...p]);pinch[tip]=[.245,.81,0];
  expect(hasControlPosture(pinch)).toBe(true);
  const events=[250,300,350,400,450,500,550].flatMap(timestamp=>engine.update({landmarks:pinch,timestamp,confidence:.95},view));
  expect(events).toContainEqual({type:'button-down',button:tip===8?'left':'right'});
});
