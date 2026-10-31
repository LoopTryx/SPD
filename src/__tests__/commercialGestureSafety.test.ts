import { expect, test } from 'vitest';
import { GestureEngine } from '../spd/gesture-engine';

const viewport = { width: 1920, height: 1080 };
function frame(timestamp: number, tip?: number) {
  const p = Array.from({ length: 21 }, () => [.5, .7, 0]);
  p[0] = [.5, .85, 0]; p[9] = [.5, .58, 0]; p[4] = [.32, .63, 0];
  for (const [end, x, y] of [[8,.42,.2],[12,.5,.18],[16,.58,.22],[20,.66,.3]]) {
    p[end] = [x, y, 0]; p[end - 2] = [x, .5, 0];
  }
  if (tip) p[4] = [p[tip][0] + .005, p[tip][1], 0];
  return { trackId: 1, timestamp, confidence: .95, landmarks: p };
}

test('a missing observation interval cannot count as sustained pinch evidence', () => {
  const engine = new GestureEngine();
  engine.update(frame(0), viewport);
  engine.update(frame(200, 8), viewport);
  const events = engine.update(frame(1200, 8), viewport);
  expect(events.some(e => e.type === 'button-down')).toBe(false);
  expect(engine.update(frame(1500, 8), viewport).some(e => e.type === 'button-down')).toBe(false);
});

test('a held left click cannot morph into an overlay gesture without opening the hand', () => {
  const engine = new GestureEngine();
  engine.update(frame(0), viewport);
  engine.update(frame(200, 8), viewport);
  expect(engine.update(frame(420, 8), viewport)).toContainEqual({ type: 'button-down', button: 'left' });
  const events = [450, 550, 650, 750, 850].flatMap(t => engine.update(frame(t, 12), viewport));
  expect(events).toContainEqual({ type: 'button-up', button: 'left' });
  expect(events.some(e => e.type === 'overlay-toggle')).toBe(false);
  engine.update(frame(900), viewport);
  const rearmed = [1100, 1200, 1300, 1400].flatMap(t => engine.update(frame(t, 12), viewport));
  expect(rearmed).toContainEqual({ type: 'overlay-toggle' });
});

test('conflicting fingers cancel a click candidate instead of transferring its dwell', () => {
  const engine = new GestureEngine();
  engine.update(frame(0), viewport);
  engine.update(frame(200, 8), viewport);
  const events = [250, 350, 450, 550].flatMap(t => engine.update(frame(t, 20), viewport));
  expect(events.some(e => e.type === 'button-down')).toBe(false);
});
