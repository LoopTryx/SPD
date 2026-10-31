import { distance3d } from './geometry';

/** Visible tip separation is authoritative; monocular depth only vetoes gross separation. */
export function pinchContactRatio(camera:number[][],pose:number[][],tip:number,aspect=4/3):number {
  const ratio=Number.isFinite(aspect) && aspect>0 ? aspect : 4/3;
  const imageDistance=(a:number,b:number)=>Math.hypot((camera[a][0]-camera[b][0])*ratio,camera[a][1]-camera[b][1]);
  const imageScale=Math.max(imageDistance(0,9),imageDistance(5,17)),
    worldScale=Math.max(distance3d(pose[0],pose[9]),distance3d(pose[5],pose[17]));
  if(imageScale<.0001 || worldScale<.0001)return Infinity;
  const imageGap=imageDistance(4,tip)/imageScale;
  const depthGap=Math.abs(pose[4][2]-pose[tip][2])/worldScale;
  return depthGap>.5 ? Math.max(imageGap,depthGap) : imageGap;
}
