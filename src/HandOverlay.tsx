import { useCallback, useEffect, useRef } from "react";
import type { HandTracker } from "./HandTracker";
import { mapCameraPointToScreen, POINTER_TIP_INDEX } from "./spd/geometry";
import { projectHandLandmarks } from "./spd/hand-projection";
import { EdgeStableHandFilter } from "./spd/edge-stable-hand-filter";

interface Props {
  tracker: HandTracker;
  width: number;
  height: number;
  pointer?: { current: { x: number; y: number } | null };
  fps?: number;
}
const CONNECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
];
const TIPS = new Set([4, 8, 12, 16, 20]);

export function mapNormalizedToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  mirror = true,
): [number, number] {
  const point = mapCameraPointToScreen({ x, y });
  return [(mirror ? 1 - point.x : point.x) * width, point.y * height];
}

export function updateHandScales(hands: number[][][]): number[] {
  return hands.map(() => 1);
}

export function updateEdgeStableHands(
  filters: Map<number, EdgeStableHandFilter>,
  hands: number[][][],
  trackIds: number[],
): Array<number[][] | null> {
  const activeIds = new Set(trackIds);
  for (const id of filters.keys()) if (!activeIds.has(id)) filters.delete(id);
  return hands.map((hand, index) => {
    const id = trackIds[index] ?? -(index + 1);
    let filter = filters.get(id);
    if (!filter) {
      filter = new EdgeStableHandFilter();
      filters.set(id, filter);
    }
    return filter.update(hand);
  });
}

const POSE_HOLD_MS = 400;
const POSE_SMOOTHING = 0.55;

export function smoothHands(
  previous: number[][][] | null,
  next: number[][][],
  alpha = POSE_SMOOTHING,
): number[][][] {
  if (!next.length || !previous || previous.length !== next.length)
    return next.map((hand) => hand.map((point) => [...point]));
  return next.map((hand, handIndex) =>
    hand.map((point, pointIndex) => {
      const prior = previous[handIndex]?.[pointIndex];
      if (!prior) return [...point];
      return point.map(
        (value, axis) => prior[axis] + (value - prior[axis]) * alpha,
      );
    }),
  );
}

export function smoothHandsById(
  previous: Map<number, number[][]>,
  next: number[][][],
  trackIds: number[],
  alpha = POSE_SMOOTHING,
): Map<number, number[][]> {
  const updated = new Map(previous);
  next.forEach((hand, index) => {
    const id = trackIds[index];
    if (id === undefined) return;
    updated.set(id, smoothHands(previous.get(id) ? [previous.get(id)!] : null, [hand], alpha)[0]);
  });
  return updated;
}

export function projectOverlayHand(
  landmarks: number[][],
  width: number,
  height: number,
  scale: number,
  sourceAspectRatio: number,
): Array<[number, number]> {
  return projectHandLandmarks({
    landmarks,
    viewportWidth: width,
    viewportHeight: height,
    scale,
    mirror: true,
    anchorIndex: POINTER_TIP_INDEX,
    sourceAspectRatio,
  });
}

export default function HandOverlay({
  tracker,
  width,
  height,
  pointer,
  fps = 60,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pose = useRef<{ drawn: Map<number, number[][]>; guards: Map<number, EdgeStableHandFilter>;
    lastSeen: Map<number, number>; ids: number[]; inputAt: number }>({
    drawn: new Map(), guards: new Map(), lastSeen: new Map(), ids: [],
    inputAt: 0,
  });
  const controlAt = useRef(0);
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const viewWidth = canvas.clientWidth || width;
    const viewHeight = canvas.clientHeight || height;
    context.clearRect(0, 0, viewWidth, viewHeight);
    const result = tracker.getResult();
    const control = tracker.getControlHand();
    const now = performance.now();
    if (control) controlAt.current = now;
    // Tracking runs far below display rate: ease toward each new pose and hold
    // it briefly so the drawn hand moves continuously instead of stepping (or
    // blinking out) once per tracked frame.
    const fresh = result.landmarks.length > 0;
    if (fresh) pose.current.inputAt = now;
    const expired = !fresh && now - pose.current.inputAt > POSE_HOLD_MS;
    if (expired) { pose.current.drawn.clear(); pose.current.guards.clear(); pose.current.lastSeen.clear(); pose.current.ids = []; }
    else if (fresh) {
      const guarded = updateEdgeStableHands(pose.current.guards, result.landmarks, result.trackIds);
      const ids: number[] = [], landmarks: number[][][] = [];
      guarded.forEach((hand, index) => {
        if (!hand) return;
        ids.push(result.trackIds[index]);
        landmarks.push(hand);
      });
      for (const id of ids) pose.current.lastSeen.set(id, now);
      for (const [id, seenAt] of pose.current.lastSeen)
        if (now - seenAt > POSE_HOLD_MS) {
          pose.current.lastSeen.delete(id);
          pose.current.drawn.delete(id);
        }
      pose.current.drawn = smoothHandsById(pose.current.drawn, landmarks, ids);
      pose.current.ids = ids;
    }
    const hands = pose.current.ids.map(id => pose.current.drawn.get(id)).filter((hand): hand is number[][] => !!hand);
    const scales = updateHandScales(hands);
    hands.forEach((hand, handIndex) => {
      const projected = projectOverlayHand(
        hand,
        viewWidth,
        viewHeight,
        scales[handIndex],
        tracker.getVideoAspectRatio(),
      );
      if (pose.current.ids[handIndex] === control?.trackId && pointer?.current) {
        const anchor = projected[8];
        const dx = pointer.current.x * viewWidth - anchor[0];
        const dy = pointer.current.y * viewHeight - anchor[1];
        for (const point of projected) {
          point[0] += dx;
          point[1] += dy;
        }
      }
      // shadowBlur costs a full-surface blur per stroke, which starves the
      // compositor on a transparent always-on-top window. Batched paths with a
      // translucent underlay give the same glow far more cheaply.
      context.beginPath();
      for (const [from, to] of CONNECTIONS) {
        const a = projected[from];
        const b = projected[to];
        if (!a || !b) continue;
        context.moveTo(a[0], a[1]);
        context.lineTo(b[0], b[1]);
      }
      context.lineWidth = 4.5;
      context.strokeStyle = "rgba(139,92,246,.22)";
      context.stroke();
      context.lineWidth = 1.6;
      context.strokeStyle = "rgba(167,139,250,.78)";
      context.stroke();
      context.beginPath();
      projected.forEach(([x, y], index) => {
        context.moveTo(x + (TIPS.has(index) ? 4 : 2.2) + 2.5, y);
        context.arc(x, y, (TIPS.has(index) ? 4 : 2.2) + 2.5, 0, Math.PI * 2);
      });
      context.fillStyle = "rgba(139,92,246,.22)";
      context.fill();
      context.beginPath();
      projected.forEach(([x, y], index) => {
        if (!TIPS.has(index)) return;
        context.moveTo(x + 4, y);
        context.arc(x, y, 4, 0, Math.PI * 2);
      });
      context.fillStyle = "rgba(196,181,253,.96)";
      context.fill();
      context.beginPath();
      projected.forEach(([x, y], index) => {
        if (TIPS.has(index)) return;
        context.moveTo(x + 2.2, y);
        context.arc(x, y, 2.2, 0, Math.PI * 2);
      });
      context.fillStyle = "rgba(139,92,246,.72)";
      context.fill();
    });
    if (control || (pointer?.current && now - controlAt.current < POSE_HOLD_MS)) {
      const handIndex = control ? pose.current.ids.indexOf(control.trackId) : -1;
      const tip = hands[handIndex]?.[POINTER_TIP_INDEX];
      if (pointer?.current || tip) {
        const [x, y] = pointer?.current
          ? [pointer.current.x * viewWidth, pointer.current.y * viewHeight]
          : mapNormalizedToViewport(tip[0], tip[1], viewWidth, viewHeight);
        context.beginPath();
        context.arc(x, y, 14, 0, Math.PI * 2);
        context.lineWidth = 9;
        context.strokeStyle = "rgba(34,255,125,.2)";
        context.stroke();
        context.lineWidth = 3;
        context.strokeStyle = "rgba(34,255,125,.95)";
        context.stroke();
      }
    }
  }, [height, tracker, width, pointer]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.getContext("2d")?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, [width, height]);
  useEffect(() => {
    let frame: number;
    let lastDraw = -Infinity;
    const render = (timestamp: number) => {
      if (timestamp - lastDraw >= 1000 / fps - 1) {
        draw();
        lastDraw = timestamp;
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [draw, fps]);
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 120,
      }}
    />
  );
}
