import type { Point2D } from './geometry';
import type { PointerTarget } from '../../electron/product/contracts';
export type { PointerTarget } from '../../electron/product/contracts';

export type AssistedPoint = Point2D & { locked:boolean; targetId?:string };

export class MagneticPointer {
  private targets: PointerTarget[] = [];
  private refreshed = -Infinity;
  private candidate: { id:string; since:number } | null = null;
  private locked: string | null = null;
  setTargets(targets: PointerTarget[], timestamp: number): void {
    const valid = targets.filter(t => typeof t.id === 'string' && t.id.length <= 160 &&
      [t.x,t.y,t.width,t.height].every(Number.isFinite) && t.x >= 0 && t.y >= 0 &&
      t.width > 0 && t.height > 0 && t.x+t.width <= 1.001 && t.y+t.height <= 1.001).slice(0,16);
    // A missed provider poll is not evidence that the control disappeared.
    // Preserve the previous bounds only for their original, bounded lifetime.
    if(!valid.length && timestamp>=this.refreshed && timestamp-this.refreshed<=450)return;
    this.targets=valid;
    this.refreshed = timestamp;
  }
  update(point: Point2D, now:number, view:{width:number;height:number}, held = false): AssistedPoint {
    if (held || now-this.refreshed > 450 || now < this.refreshed) {
      this.candidate = null; this.locked = null; return {...point,locked:false};
    }
    const distance = (t:PointerTarget) => Math.hypot(
      (t.x+t.width/2-point.x)*view.width,(t.y+t.height/2-point.y)*view.height);
    const radius=(t:PointerTarget)=>Math.max(8,Math.min(18,Math.min(t.width*view.width,t.height*view.height)*.35));
    let target = this.targets.find(t => t.id === this.locked && distance(t) <= radius(t)+18);
    if (!target) {
      this.locked = null;
      target = [...this.targets].filter(t => distance(t) <= radius(t)).sort((a,b) => distance(a)-distance(b) || a.width*a.height-b.width*b.height)[0];
      if (!target) { this.candidate = null; return {...point,locked:false}; }
      if (this.candidate?.id !== target.id) this.candidate = {id:target.id,since:now};
      if (now-this.candidate.since < 90) return {...point,locked:false};
      this.locked = target.id;
    }
    const center = { x:target.x+target.width/2,y:target.y+target.height/2 };
    return {...center,locked:true,targetId:target.id};
  }
  reset(): void { this.targets=[]; this.refreshed=-Infinity; this.candidate=null; this.locked=null; }
}
