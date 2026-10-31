import { expect, test } from 'vitest';
import { MagneticPointer } from '../spd/magnetic-pointer';
import { isCasualHand, hasControlPosture } from '../spd/takeover-guard';

const view = { width:1000,height:1000 };
const button = { id:'button',x:.49,y:.49,width:.04,height:.04 };

test('wide buttons snap to their center and release only outside the retention margin',()=>{
  const magnet=new MagneticPointer();magnet.setTargets([{id:'wide',x:.3,y:.4,width:.3,height:.06}],0);
  expect(magnet.update({x:.31,y:.43},0,view).locked).toBe(false);
  expect(magnet.update({x:.31,y:.43},100,view).locked).toBe(false);
  magnet.update({x:.44,y:.43},150,view);
  const snapped=magnet.update({x:.44,y:.43},250,view);
  expect(snapped.locked).toBe(true);expect(snapped.x).toBeCloseTo(.45);expect(snapped.y).toBeCloseTo(.43);
  expect(magnet.update({x:.42,y:.43},300,view).locked).toBe(true);
  expect(magnet.update({x:.40,y:.43},350,view).locked).toBe(false);
});

test('one empty provider poll cannot erase a fresh lock or extend stale bounds',()=>{
  const magnet=new MagneticPointer();magnet.setTargets([button],0);
  magnet.update({x:.51,y:.51},0,view);magnet.update({x:.51,y:.51},100,view);
  magnet.setTargets([],150);
  expect(magnet.update({x:.51,y:.51},200,view).locked).toBe(true);
  magnet.setTargets([],400);
  expect(magnet.update({x:.51,y:.51},500,view).locked).toBe(false);
});



test('magnetic targeting requires dwell, survives small edge jitter, and releases on deliberate departure', () => {
  const magnet = new MagneticPointer();
  magnet.setTargets([button],0);
  expect(magnet.update({x:.50,y:.51},0,view).locked).toBe(false);
  expect(magnet.update({x:.50,y:.51},100,view)).toMatchObject({locked:true,x:.51,y:.51});
  expect(magnet.update({x:.49,y:.51},130,view).locked).toBe(true);
  expect(magnet.update({x:.3,y:.51},160,view).locked).toBe(false);
});

test('stale bounds and a held drag never attract the pointer', () => {
  const magnet = new MagneticPointer();
  magnet.setTargets([button],0);
  magnet.update({x:.51,y:.51},0,view);
  expect(magnet.update({x:.51,y:.51},100,view).locked).toBe(true);
  expect(magnet.update({x:.51,y:.51},600,view).locked).toBe(false);
  magnet.setTargets([button],650);
  expect(magnet.update({x:.51,y:.51},700,view,true).locked).toBe(false);
});

test('a hand at the face is excluded while a hand well below it remains usable', () => {
  const face = {x:.35,y:.1,width:.3,height:.35};
  const p = Array.from({length:21}, () => [.5,.3,0]);
  expect(isCasualHand(p,face)).toBe(true);
  expect(isCasualHand(p.map(([x,y,z]) => [x,y+.5,z]),face)).toBe(false);
});

test('collapsed or malformed hand poses cannot take over the pointer',()=>{
  expect(hasControlPosture(Array.from({length:21},()=>[.5,.5,0]))).toBe(false);
  const p=Array.from({length:21},()=>[.5,.5,0]);p[0]=[NaN,.5,0];
  expect(hasControlPosture(p)).toBe(false);
});
