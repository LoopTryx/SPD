// Read-only check against an existing visible control. No cursor input.
// electron scripts/verify-desktop-target.cjs x y width height [saved-display-id]
const {app,screen}=require('electron');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let service;
app.whenReady().then(async()=>{
  const numbers=process.argv.slice(2).map(Number);
  const [x,y,width,height,savedId]=numbers;
  if(numbers.length<4 || !numbers.every(Number.isFinite) || width<=0 || height<=0)throw Error('Provide physical control bounds');
  const display=screen.getPrimaryDisplay(),area=display.workArea;
  const physical={x:Math.round(x+width/2),y:Math.round(y+height/2)};
  const dip=screen.screenToDipPoint(physical);
  const point={x:(dip.x-area.x)/(area.width-1),y:(dip.y-area.y)/(area.height-1)};
  const {TargetService}=require(path.join(root,'.electron-build/desktop/target-service.js'));
  service=new TargetService(root);
  const targets=await service.query(point.x,point.y,savedId??null);
  const {build}=await import('vite');
  const result=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,
    lib:{entry:path.join(root,'src/spd/magnetic-pointer.ts'),formats:['es']}}});
  const entry=(Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk'&&item.isEntry);
  const {MagneticPointer}=await import('data:text/javascript;base64,'+Buffer.from(entry.code).toString('base64'));
  const magnet=new MagneticPointer();magnet.setTargets(targets,0);magnet.update(point,0,area);
  const snapped=magnet.update(point,100,area);
  if(!snapped.locked || Math.abs(snapped.x-point.x)*area.width>2 || Math.abs(snapped.y-point.y)*area.height>2)
    throw Error('Existing desktop control did not acquire at its center: '+JSON.stringify({targets,snapped}));
  console.log(JSON.stringify({targetCount:targets.length,locked:true,physicalCenter:physical,savedDisplayId:savedId,actualDisplayId:display.id,inputInjected:false}));
}).then(()=>finish(0)).catch(error=>{console.error(error.message);finish(1);});
function finish(code){service?.stop();app.exit(code);}
