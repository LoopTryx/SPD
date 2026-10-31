import { expect, test, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);
const detected = vi.hoisted(() => ({ landmarks: [] as Array<Array<{ x:number; y:number; z:number }>>,
  worldLandmarks: [] as Array<Array<{ x:number; y:number; z:number }>>, handedness: [] as Array<Array<{ categoryName:string; score:number }>> }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  HandLandmarker: { createFromOptions: async () => ({
    detectForVideo: () => { calls.push('hands'); return detected; },
    close() {},
  }) },
  FaceLandmarker: { createFromOptions: async () => ({
    detectForVideo: () => { calls.push('face'); return { faceLandmarks: [], faceBlendshapes: [] }; },
    close() {},
  }) },
}));

test('hand inference runs before scheduled eye analysis on each shared frame', async () => {
  const replies: unknown[] = [];
  const worker = { onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (reply: any) => { replies.push(reply); if (reply.type !== 'ready') calls.push('post-' + reply.type); } };
  vi.stubGlobal('self', worker);
  vi.stubGlobal('OffscreenCanvas', class { constructor(_w: number, _h: number) {} });
  await import('../tracking/vision.worker');
  worker.onmessage!({ data: { type: 'init', wasmPath: '', handModel: '', faceModel: '' } });
  await vi.waitFor(() => expect(replies).toContainEqual({ type: 'ready', delegate: 'GPU' }));
  worker.onmessage!({ data: { type: 'frame', id: 1, timestamp: 100,
    bitmap: { close() {} }, hands: true, faceIntervalMs: 200 } });
  expect(calls).toEqual(['hands', 'post-result', 'face', 'post-face']);
  calls.length = 0;
  worker.onmessage!({ data: { type: 'frame', id: 2, timestamp: 133,
    bitmap: { close() {} }, hands: true, faceIntervalMs: 200 } });
  expect(calls).toEqual(['hands', 'post-result']);
  vi.unstubAllGlobals();
});

test('worker forwards geometric quality separately from handedness and drops clipped hands', async () => {
  vi.resetModules();
  const replies: any[] = [];
  const worker = { onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (reply: unknown) => replies.push(reply) };
  vi.stubGlobal('self', worker);
  vi.stubGlobal('OffscreenCanvas', class {});
  const points = [[.5,.82],[.43,.75],[.37,.68],[.32,.62],[.27,.57],
    [.43,.62],[.42,.48],[.42,.39],[.42,.32],[.5,.6],[.5,.44],[.5,.34],[.5,.26],
    [.57,.62],[.58,.47],[.58,.38],[.58,.31],[.64,.66],[.66,.54],[.67,.47],[.68,.41]]
    .map(([x,y]) => ({ x,y,z:0 }));
  detected.landmarks = [points]; detected.worldLandmarks = [points];
  detected.handedness = [[{ categoryName: 'Left', score: .42 }]];
  try {
    await import('../tracking/vision.worker');
    worker.onmessage!({ data: { type: 'init', wasmPath: '', handModel: '', faceModel: '' } });
    await vi.waitFor(() => expect(replies).toContainEqual({ type: 'ready', delegate: 'GPU' }));
    const frame = (id: number) => worker.onmessage!({ data: { type:'frame', id, timestamp:id*100,
      bitmap:{ width:640,height:480,close() {} }, hands:true,faceIntervalMs:200 } });
    frame(1);
    const hand = replies.find(reply => reply.type === 'result').hands[0];
    expect(hand.confidence).toBeCloseTo(.9);
    expect(hand.handednessConfidence).toBe(.42);
    points[8].x = 1.1;
    frame(2);
    expect(replies.find(reply => reply.type === 'result' && reply.id === 2).hands).toEqual([]);
  } finally {
    detected.landmarks = []; detected.worldLandmarks = []; detected.handedness = [];
    vi.unstubAllGlobals();
  }
});
