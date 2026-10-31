import type { Point2D } from './geometry';

/** Finger closure alone cannot move a newly held button. */
export class DragIntent {
  private anchor: {point:Point2D;palm:Point2D;scale:number;since:number;dragging:boolean;offset:Point2D} | null=null;
  begin(point:Point2D,palm:Point2D,scale:number,timestamp:number):void {
    this.anchor={point:{...point},palm:{...palm},scale:Math.max(.001,scale),since:timestamp,dragging:false,offset:{x:0,y:0}};
  }
  update(point:Point2D,palm:Point2D,timestamp:number):Point2D {
    const a=this.anchor;if(!a)return point;
    if(!a.dragging) {
      if(timestamp-a.since>=120 && Math.hypot(palm.x-a.palm.x,palm.y-a.palm.y)/a.scale>=.16) {
        a.dragging=true;a.offset={x:a.point.x-point.x,y:a.point.y-point.y};
      } else return {...a.point};
    }
    return {x:Math.max(0,Math.min(1,point.x+a.offset.x)),y:Math.max(0,Math.min(1,point.y+a.offset.y))};
  }
  reset():void {this.anchor=null;}
}
