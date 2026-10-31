import { expect, test } from 'vitest';
import { classifyAttention, extractFaceFeatures, DEFAULT_GAZE_PROFILE } from '../spd/attention-estimator';

test.each([[], [.5], [.5,.5,.5], [.5,.5,.5,.5,.5]].map(features => ({ features })))('incomplete or extra eye features cannot declare attention: $features', ({ features }) => {
  expect(classifyAttention({ timestamp: 100, faceCount: 1, blink: false, features }, null, 120)).toBe('unknown');
});

test('malformed calibration cannot declare attention', () => {
  expect(classifyAttention({ timestamp: 100, faceCount: 1, blink: false, features: [.5,.5,.5,.5] },
    { ...DEFAULT_GAZE_PROFILE, center: [NaN,.5,.5,.5] }, 120)).toBe('unknown');
});

test('eye-relative measurements remain stable when the head rolls', () => {
  const points = Array.from({ length: 478 }, () => ({ x:.5,y:.5,z:0 }));
  for (const [index,x,y] of [[33,.3,.4],[133,.4,.4],[159,.35,.38],[145,.35,.42],[468,.36,.405],
    [362,.6,.4],[263,.7,.4],[386,.65,.38],[374,.65,.42],[473,.66,.405]]) points[index] = { x,y,z:0 };
  const upright = extractFaceFeatures(points)!;
  const angle = Math.PI / 4;
  const rolled = points.map(({x,y,z}) => ({ x:.5+(x-.5)*Math.cos(angle)-(y-.5)*Math.sin(angle),
    y:.5+(x-.5)*Math.sin(angle)+(y-.5)*Math.cos(angle),z }));
  const result = extractFaceFeatures(rolled)!;
  expect(result).not.toBeNull();
  result.forEach((value,i) => expect(value).toBeCloseTo(upright[i], 6));
});
