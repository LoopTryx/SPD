import { describe, expect, it } from 'vitest';
import { LatestFrameQueue } from '../spd/latest-frame-queue';
import { PerformanceGovernor } from '../spd/performance-governor';
import { classifyAttention, calibrateAttention, extractFaceFeatures } from '../spd/attention-estimator';

describe('bounded inference pipeline', () => {
  it('replaces queued frames and disposes every frame on completion or stop', async () => {
    const started: number[] = [], disposed: number[] = [];
    let finish!: () => void;
    const queue = new LatestFrameQueue<number>(async n => {
      started.push(n);
      await new Promise<void>(resolve => { finish = resolve; });
    }, n => disposed.push(n), () => {});
    queue.push(1); queue.push(2); queue.push(3);
    expect(started).toEqual([1]);
    expect(disposed).toEqual([2]);
    finish(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(started).toEqual([1, 3]);
    queue.push(4); queue.stop(); finish();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(disposed.sort()).toEqual([1, 2, 3, 4]);
    expect(queue.dropped).toBe(1);
  });

  it('requires warmup and downgrades sustained slow inference without oscillation', () => {
    const governor = new PerformanceGovernor();
    expect(governor.ready).toBe(false);
    for (let t = 0; t < 4000; t += 100) governor.record(45, t);
    expect(governor.tier).toBe('economy');
    expect(governor.ready).toBe(true);
    for (let t = 4000; t < 4300; t += 100) governor.record(5, t);
    expect(governor.tier).toBe('economy');
  });
});

describe('local attention estimates', () => {
  it('uses both irises and ignores head translation when the eyes stay centered', () => {
    const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
    for (const [index, x, y] of [[33,.3,.4],[133,.4,.4],[159,.35,.38],[145,.35,.42],[468,.35,.4],
      [362,.6,.4],[263,.7,.4],[386,.65,.38],[374,.65,.42],[473,.65,.4],[1,.5,.55]])
      points[index] = { x, y, z: 0 };
    const centered = extractFaceFeatures(points);
    points[1].x = .67;
    expect(extractFaceFeatures(points)).toEqual(centered);
    expect(centered?.map(value => Math.round(value * 1000) / 1000)).toEqual([.5, .5, .5, .5]);
    points[473].x = .69;
    expect(extractFaceFeatures(points)?.[2]).toBeGreaterThan(.8);
  });
  const profile = { version: 2 as const, cameraId: '', displayId: null,
    createdAt: 0, center: [.5, .5, .5, .5], tolerance: [.2, .2, .2, .2] };
  it('rejects stale results, multiple faces, and off-screen features', () => {
    const sample = { timestamp: 100, faceCount: 1, features: [.5, .5, .5, .5], blink: false };
    expect(classifyAttention(sample, profile, 200)).toBe('attentive');
    expect(classifyAttention(sample, profile, 349)).toBe('attentive');
    expect(classifyAttention(sample, profile, 351)).toBe('unknown');
    expect(classifyAttention({ ...sample, faceCount: 2 }, profile, 200)).toBe('unknown');
    expect(classifyAttention({ ...sample, features: [.9, .5, .5, .5] }, profile, 200)).toBe('away');
    expect(classifyAttention({ ...sample, blink: true }, profile, 200)).toBe('blink');
  });
  it('gates on the default profile when no calibration has been saved', () => {
    const looking = { timestamp: 100, faceCount: 1, features: [.5, .5, .5, .5], blink: false };
    expect(classifyAttention(looking, null, 150)).toBe('attentive');
    expect(classifyAttention({ ...looking, features: [.9, .5, .5, .5] }, null, 150)).toBe('away');
    expect(classifyAttention({ ...looking, features: [.5, .5, .95, .5] }, null, 150)).toBe('away');
    expect(classifyAttention({ ...looking, blink: true }, null, 150)).toBe('blink');
    expect(classifyAttention({ ...looking, faceCount: 0 }, null, 150)).toBe('unknown');
    expect(classifyAttention(looking, null, 400)).toBe('unknown');
  });
  it('treats measured front-facing captures as attentive without calibration', () => {
    for (const features of [[.203, .634, .419, .463], [.203, .693, .427, .484]]) {
      expect(classifyAttention({ timestamp: 100, faceCount: 1, features, blink: false }, null, 150)).toBe('attentive');
    }
  });
  it('rejects calibration that cannot distinguish looking away', () => {
    const looking = Array.from({ length: 100 }, () => [.5, .5, .5, .5]);
    expect(() => calibrateAttention(looking, looking, '', null, 1)).toThrow(/distinguish/);
    const away = Array.from({ length: 20 }, () => [.9, .5, .9, .5]);
    expect(calibrateAttention(looking, away, '', null, 1).center[0]).toBe(.5);
  });
  it('rejects a profile that fails held-out screen observations', () => {
    const looking = Array.from({ length: 100 }, (_, index) =>
      index % 5 === 0 ? [.9, .5, .9, .5] : [.5, .5, .5, .5]);
    const away = Array.from({ length: 20 }, () => [.1, .5, .1, .5]);
    expect(() => calibrateAttention(looking, away, '', null, 1)).toThrow(/held-out/);
  });
});
