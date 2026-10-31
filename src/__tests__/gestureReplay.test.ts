import { expect, test } from 'vitest';
import { evaluateGestureReplay } from '../spd/gesture-replay';
import type { GestureFrame } from '../spd/gesture-engine';

function hand(timestamp: number, pinch = false): GestureFrame {
  const p = Array.from({ length: 21 }, () => [.5,.7,0]);
  p[0] = [.5,.85,0]; p[9] = [.5,.58,0]; p[4] = [.32,.63,0];
  for (const [tip,x,y] of [[8,.42,.2],[12,.5,.18],[16,.58,.22],[20,.66,.3]]) {
    p[tip] = [x,y,0]; p[tip-2] = [x,.5,0];
  }
  if (pinch) p[4] = [.425,.2,0];
  return { timestamp, landmarks: p, confidence: .95, trackId: 1 };
}

test('matches explicit click labels and reports unexpected actions without OS access', () => {
  const frames = [0,100,200,300,400,500,600,700].map(t => ({
    primary: hand(t, t >= 200 && t <= 500), secondary: null,
  }));
  const labelled = evaluateGestureReplay({ viewport: { width: 1920, height: 1080 }, frames,
    expected: [{ type: 'button-down', button: 'left', earliestMs: 340, latestMs: 500 },
      { type: 'button-up', button: 'left', earliestMs: 640, latestMs: 700 }] });
  expect(labelled.matched).toBe(2);
  expect(labelled.unexpected).toEqual([]);
  expect(labelled.missed).toEqual([]);
  const negative = evaluateGestureReplay({ viewport: { width: 1920, height: 1080 }, frames, expected: [] });
  expect(negative.unexpected.map(e => e.type)).toEqual(['button-down', 'button-up']);
  expect(negative.matched).toBe(0);
});

test('does not reuse one emitted click to satisfy two labels', () => {
  const expected = { type: 'button-down' as const, button: 'left' as const, earliestMs: 340, latestMs: 500 };
  const report = evaluateGestureReplay({ viewport: { width: 1920, height: 1080 },
    frames: [0,100,200,300,400,500].map(t => ({ primary: hand(t, t >= 200), secondary: null })),
    expected: [expected, expected] });
  expect(report.matched).toBe(1);
  expect(report.missed).toHaveLength(1);
});

test('rejects unordered recordings rather than silently hiding regression events', () => {
  expect(() => evaluateGestureReplay({ viewport: { width: 1920, height: 1080 }, expected: [],
    frames: [{ primary: hand(200), secondary: null }, { primary: hand(100), secondary: null }] })).toThrow(/order/);
});

test('reports absent hands as a release of a previously held button', () => {
  const frames = [0,100,200,300,400,500].map(t => ({ timestamp: t, primary: hand(t, t >= 200), secondary: null }));
  const report = evaluateGestureReplay({ viewport: { width: 1920, height: 1080 }, expected: [],
    frames: [...frames, { timestamp: 600, primary: null, secondary: null }] });
  expect(report.unexpected).toContainEqual({ type: 'button-up', button: 'left', timestamp: 600 });
});
