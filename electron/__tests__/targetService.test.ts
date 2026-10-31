import { EventEmitter } from 'node:events';
import { afterEach,beforeEach,expect,test,vi } from 'vitest';
vi.mock('electron',()=>({app:{isPackaged:false,getAppPath:()=>process.cwd()},screen:{
  getPrimaryDisplay:()=>({id:1,scaleFactor:2,workArea:{x:-100,y:20,width:1001,height:801}}),
  getAllDisplays:()=>[], dipToScreenPoint:(p:any)=>({x:p.x*2,y:p.y*2}),
  screenToDipPoint:(p:any)=>({x:p.x/2,y:p.y/2}),
}}));
vi.mock('node:child_process',()=>({spawn:vi.fn()}));
import { spawn } from 'node:child_process';
import { screen } from 'electron';
import { TargetService } from '../desktop/target-service';
let service:TargetService;
let child:any;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(10000);
  child=new EventEmitter();child.stdin=new EventEmitter();child.stdin.write=vi.fn();
  child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=vi.fn();
  vi.mocked(spawn).mockReturnValue(child);
  service=new TargetService();
});
afterEach(()=>{service.stop();vi.useRealTimers();vi.clearAllMocks();});

test('maps physical UIA bounds into the selected display including negative origins and DPI',async()=>{
  const query=service.query(.5,.5,null);
  expect(vi.mocked(spawn).mock.calls[0][1]).toEqual([`--exclude-pid=${process.pid}`]);
  child.stdout.emit('data',Buffer.from(JSON.stringify({id:1,targets:[{id:'b',x:780,y:800,width:80,height:80}]})+'\n'));
  const targets=await query;
  expect(targets).toHaveLength(1); expect(targets[0].id).toBe('b');
  expect(targets[0].x).toBeCloseTo(.49); expect(targets[0].y).toBeCloseTo(.475);
  expect(targets[0].width).toBeCloseTo(.04); expect(targets[0].height).toBeCloseTo(.05);
});

test('hung providers resolve empty so cursor control can continue',async()=>{
  const query=service.query(.5,.5,null);
  await vi.advanceTimersByTimeAsync(1600);
  expect(await query).toEqual([]);
  expect(await service.query(.5,.5,null)).toEqual([]);
});

test('a saved display that disappeared falls back to the current primary like the overlay',async()=>{
  const query=service.query(.5,.5,385960744);
  expect(spawn).toHaveBeenCalled();
  expect(child.stdin.write).toHaveBeenCalledWith('1 800 840 128\n');
  child.stdout.emit('data',Buffer.from('{"id":1,"targets":[{"id":"copy","x":780,"y":800,"width":26,"height":27}]}\n'));
  expect((await query)[0].id).toBe('copy');
});

test('fractional display scaling still sends integer coordinates accepted by the helper',async()=>{
  const mapping=vi.spyOn(screen,'dipToScreenPoint').mockReturnValue({x:600.5,y:630.75});
  const query=service.query(.5,.5,null);
  expect(child.stdin.write).toHaveBeenCalledWith('1 601 631 128\n');
  child.stdout.emit('data',Buffer.from('{"id":1,"targets":[]}\n'));
  expect(await query).toEqual([]);
  mapping.mockRestore();
});

test('invalid target replies and stale helper generations cannot publish targets',async()=>{
  const query=service.query(.5,.5,null);
  child.stdout.emit('data',Buffer.from('{"id":99,"targets":[]}\n'));
  expect(await query).toEqual([]);
  child.stdout.emit('data',Buffer.from('{"id":1,"targets":[{"id":"late","x":0,"y":0,"width":10,"height":10}]}\n'));
  expect(await service.query(.5,.5,null)).toEqual([]);
});
