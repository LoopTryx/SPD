import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { app, screen } from 'electron';
import type { PointerTarget } from '../product/contracts';

/** UIA can block inside another app. Bound it in an independent process. */
export class TargetService {
  constructor(private readonly applicationDirectory?:string,
    private readonly diagnostic?: (message:string)=>void) {}
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending: {id:number; resolve:(targets:PointerTarget[])=>void; timer:ReturnType<typeof setTimeout>} | null = null;
  private buffer = '';
  private sequence = 0;
  private retryAfter = 0;
  private lastQuery = -Infinity;
  query(x:number,y:number,displayId:number|null):Promise<PointerTarget[]> {
    if (process.platform !== 'win32' || ![x,y].every(Number.isFinite) || x<0 || x>1 || y<0 || y>1 ||
        this.pending || Date.now()<this.retryAfter || Date.now()-this.lastQuery<120) return Promise.resolve([]);
    // Windows can replace display IDs after docking or a driver restart. Match
    // the overlay/input fallback instead of silently disabling all targeting.
    const display = screen.getAllDisplays().find(d => d.id === displayId) ?? screen.getPrimaryDisplay();
    const area = display.workArea;
    const point = screen.dipToScreenPoint({x:Math.round(area.x+x*(area.width-1)),y:Math.round(area.y+y*(area.height-1))});
    const radius = Math.max(8,Math.min(240,Math.round(64*display.scaleFactor)));
    const cold=!this.child;
    if (!this.child && !this.start()) return Promise.resolve([]);
    this.lastQuery = Date.now();
    return new Promise(resolve => {
      const id = ++this.sequence;
      this.pending = {id, resolve: raw => {
        try {
        const mapped = raw.flatMap(t => {
          const a = screen.screenToDipPoint({x:Math.round(t.x),y:Math.round(t.y)});
          const b = screen.screenToDipPoint({x:Math.round(t.x+t.width),y:Math.round(t.y+t.height)});
          const left = Math.max(0,(a.x-area.x)/Math.max(1,area.width-1));
          const top = Math.max(0,(a.y-area.y)/Math.max(1,area.height-1));
          const right = Math.min(1,(b.x-area.x)/Math.max(1,area.width-1));
          const bottom = Math.min(1,(b.y-area.y)/Math.max(1,area.height-1));
          return right>left && bottom>top ? [{id:t.id,x:left,y:top,width:right-left,height:bottom-top}] : [];
        });
        resolve(mapped);
        } catch { resolve([]); }
      }, timer:setTimeout(() => this.stop(true),cold ? 1500 : 900)};
      try { this.diagnostic?.(`query ${id} ${point.x} ${point.y} ${radius}`);this.child!.stdin.write(`${id} ${Math.round(point.x)} ${Math.round(point.y)} ${radius}\n`); }
      catch { this.stop(true); }
    });
  }
  stop(backoff=false):void {
    const child = this.child; this.child=null; this.buffer='';
    const pending = this.pending; this.pending=null;
    if (pending) { clearTimeout(pending.timer); pending.resolve([]); }
    if (backoff) this.retryAfter = Date.now()+2000;
    try { child?.kill(); } catch { }
  }
  private start():boolean {
    try {
      const root = this.applicationDirectory ?? (app.isPackaged ? process.resourcesPath : app.getAppPath());
      const file = app.isPackaged ? path.join(root,'native','Spd.TargetHelper.exe') :
        path.join(root,'native','bin',process.arch === 'arm64' ? 'win-arm64' : 'win-x64','Spd.TargetHelper.exe');
      const child = spawn(file,[`--exclude-pid=${process.pid}`,...(this.diagnostic?['--diagnostics']:[])],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      this.child=child;
      child.stdout.on('data',(chunk:Buffer) => {
        if (this.child!==child) return;
        this.buffer+=chunk.toString('utf8');
        if (this.buffer.length>32768) { this.stop(true); return; }
        let end:number;
        while ((end=this.buffer.indexOf('\n'))!==-1) {
          const line=this.buffer.slice(0,end); this.buffer=this.buffer.slice(end+1);
          try {
            const reply=JSON.parse(line);
            if (reply.type==='ready') continue;
            const pending=this.pending;
            if (!pending || reply.id!==pending.id || !Array.isArray(reply.targets) || reply.targets.length>16) { this.stop(true); return; }
            const targets=reply.targets.filter((t:PointerTarget) => t && typeof t.id==='string' && t.id.length<=160 &&
              [t.x,t.y,t.width,t.height].every(Number.isFinite) && t.width>0 && t.height>0 && t.width<=900 && t.height<=240);
            clearTimeout(pending.timer); this.pending=null; pending.resolve(targets);
          } catch { this.stop(true); return; }
        }
      });
      child.stderr.on('data',(chunk:Buffer)=>{this.diagnostic?.(chunk.toString('utf8').slice(0,2048).trim());});
      const fail=() => { if (this.child===child) this.stop(true); };
      child.on('error',fail); child.on('exit',fail); child.stdin.on('error',fail); child.stdout.on('error',fail);
      return true;
    } catch { this.stop(true); return false; }
  }
}
