import { distance3d } from './geometry';
export interface FaceRegion { x:number; y:number; width:number; height:number }

export function isCasualHand(points: number[][], face?:FaceRegion): boolean {
  if (points.some(p=>!p || p.length<3 || !p.slice(0,3).every(Number.isFinite))) return true;
  return handOverlapsFace(points,face) && !hasControlPosture(points);
}

/** Image overlap is not proof that the hand is touching the face. */
export function handOverlapsFace(points:number[][],face?:FaceRegion):boolean {
  if (!face || points.length !== 21 || ![face.x,face.y,face.width,face.height].every(Number.isFinite) ||
      face.width <= 0 || face.height <= 0) return false;
  const inside = (p:number[], padding:number) => p[0] >= face.x-face.width*padding &&
    p[0] <= face.x+face.width*(1+padding) && p[1] >= face.y-face.height*padding && p[1] <= face.y+face.height*(1+padding);
  const nearbyTips = [4,8,12,16,20].filter(i => inside(points[i],.12)).length;
  return nearbyTips >= 2 && inside(points[9],.45);
}

export function hasControlPosture(points:number[][]): boolean {
  if (points.length !== 21 || points.some(p=>!p || p.length<3 || !p.slice(0,3).every(Number.isFinite))) return false;
  const scale = distance3d(points[0],points[9]);
  if (!Number.isFinite(scale) || scale < .0001) return false;
  const extended = (tip:number) => distance3d(points[tip],points[0])-distance3d(points[tip-2],points[0]) > scale*.12;
  const thumbExtended=Math.max(
    distance3d(points[4],points[0])-distance3d(points[3],points[0]),
    distance3d(points[4],points[9])-distance3d(points[3],points[9])) > scale*.12;
  // Thumb pointing must not require an extended index. Keep a relaxed/gripping
  // thumb near curled fingers from becoming an alternative takeover signal.
  if(thumbExtended && distance3d(points[4],points[9])>scale*.45)return true;
  if (extended(8)) return true;
  // A unique fingertip contact is deliberate even with the remaining fingers
  // curled. Ambiguous thumb-across-fist contacts must still be rejected.
  const gaps=[8,12,16,20].map(tip=>distance3d(points[4],points[tip])/scale).sort((a,b)=>a-b);
  if(gaps[0]<.25 && gaps[1]>.45)return true;
  // A bent index during a deliberate pinch must not interrupt its own drag.
  return [8,12,16,20].some(tip => distance3d(points[4],points[tip])/scale < .65 &&
    [8,12,16,20].filter(other => other !== tip && extended(other)).length >= 1);
}
