import { expect, test } from 'vitest';
import { assessHandObservation } from '../tracking/hand-observation-quality';

// Hand-checked camera coordinates: full thumb and all four joint chains.
function hand(): number[][] {
  return [
    [.5,.82,0], [.43,.75,0], [.37,.68,0], [.32,.62,0], [.27,.57,0],
    [.43,.62,0], [.42,.48,0], [.42,.39,0], [.42,.32,0],
    [.5,.6,0], [.5,.44,0], [.5,.34,0], [.5,.26,0],
    [.57,.62,0], [.58,.47,0], [.58,.38,0], [.58,.31,0],
    [.64,.66,0], [.66,.54,0], [.67,.47,0], [.68,.41,0],
  ];
}

test('clear complete geometry is usable without claiming perfect certainty', () => {
  const result = assessHandObservation(hand(), 640, 480);
  expect(result.usable).toBe(true);
  expect(result.score).toBeGreaterThanOrEqual(.55);
  expect(result.score).toBeLessThan(1);
});

test.each(['missing', 'nonfinite', 'collapsed', 'clipped', 'tiny'] as const)(
  'rejects %s geometry before it reaches identity tracking', kind => {
    let p = hand();
    if (kind === 'missing') p.pop();
    if (kind === 'nonfinite') p[8][0] = NaN;
    if (kind === 'collapsed') p[7] = [...p[8]];
    if (kind === 'clipped') p[20][0] = 1.01;
    if (kind === 'tiny') p = p.map(point => point.map((v, axis) => axis < 2 ? .5 + (v - .5) * .02 : v));
    expect(assessHandObservation(p, 640, 480).usable).toBe(false);
  },
);

test('uses image aspect ratio when measuring whether a hand has enough pixels', () => {
  const p = hand().map(([x,y,z]) => [.5 + (x-.5)*.15, .5+(y-.5)*.15, z]);
  expect(assessHandObservation(p, 640, 480).usable).toBe(false);
  expect(assessHandObservation(p, 1920, 1080).usable).toBe(true);
});

test('overlapping occluded joints on curled fingers do not discard a clear thumb and palm',()=>{
  const p=hand();
  for(const base of [5,9,13,17]) {
    p[base+1]=[p[base][0],.54,0];
    p[base+2]=[p[base][0],.69,0];p[base+3]=[...p[base+2]];
  }
  expect(assessHandObservation(p,640,480).usable).toBe(true);
});
