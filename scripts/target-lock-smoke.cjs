// Run with Electron after npm run build and native/build-targets.ps1 -Test.
// Shows one short-lived button fixture; cursor/button output is fully simulated.
const {app,screen,BrowserWindow}=require('electron');
const {spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
let fixture,overlay,service;
app.whenReady().then(async()=>{
  const {TargetService}=require(path.join(root,'.electron-build/desktop/target-service.js'));
  service=new TargetService(root,message=>console.error(message));
  const display=screen.getPrimaryDisplay(),area=display.workArea;
  overlay=new BrowserWindow({...area,frame:false,transparent:true,focusable:false,skipTaskbar:true,alwaysOnTop:true});
  overlay.setIgnoreMouseEvents(true,{forward:true});
  await overlay.loadURL('data:text/html,<body style="background:transparent;margin:0"></body>');
  fixture=spawn(path.join(root,'native/bin/tests/WindowFixture.exe'),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const bounds=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Fixture did not become ready')),4000);
    let buffer='';fixture.stdout.on('data',chunk=>{buffer+=chunk;const end=buffer.indexOf('\n');if(end>=0){clearTimeout(timer);try{resolve(JSON.parse(buffer.slice(0,end)));}catch(error){reject(error);}}});
    fixture.on('error',reject);
  });
  const near=screen.screenToDipPoint({x:Math.round(bounds.x+bounds.width/2-8),y:Math.round(bounds.y+bounds.height/2)});
  const point={x:(near.x-area.x)/(area.width-1),y:(near.y-area.y)/(area.height-1)};
  console.error(JSON.stringify({fixture:bounds,near,area,scale:display.scaleFactor}));
  const {build}=await import('vite');
  const bundle=await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,
    lib:{entry:path.join(root,'src/spd/control-session.ts'),formats:['es']}}});
  const entry=(Array.isArray(bundle)?bundle[0]:bundle).output.find(item=>item.type==='chunk'&&item.isEntry);
  const {ControlSession}=await import('data:text/javascript;base64,'+Buffer.from(entry.code).toString('base64'));
  let clock=100000;let last=null;let targetCount=0;let firstReply;
  const received=new Promise(resolve=>{firstReply=resolve;});
  const output={renewInputLease:async()=>true,releaseInput:async()=>{},moveCursor:async()=>true,
    setCursorButton:async()=>{throw new Error('The smoke test must never click');},scrollCursor:async()=>true,switchWindowsWorkspace:async()=>true,
    getPointerTargets:async(x,y)=>{const targets=await service.query(x,y,display.id);targetCount=targets.length;firstReply();return targets;}};
  const controller=new ControlSession(output,p=>{last=p;},()=>{},()=>clock);
  const points=Array.from({length:21},()=>[.5,.7,0]);points[0]=[.5,.85,0];points[9]=[.5,.6,0];
  points[4]=[.2+(1-point.x)*.6,.2+point.y*.6,0];points[8]=[.25,.15,0];points[6]=[.25,.45,0];
  points[12]=[.4,.12,0];points[10]=[.4,.44,0];points[16]=[.65,.15,0];points[14]=[.65,.45,0];points[20]=[.75,.2,0];points[18]=[.75,.5,0];
  for(let t=0;t<=600;t+=100){clock=100000+t;await controller.update({trackId:1,landmarks:points,confidence:.95,handedness:'Right',timestamp:t},null,
    {timestamp:t,capturedAtEpoch:clock,ready:true,tier:'balanced',inferenceMs:1,frameAgeMs:0,droppedFrames:0,delegate:'CPU',
      face:{timestamp:t,faceCount:1,blink:false,features:[.5,.5,.5,.5]}},null,false,{width:area.width,height:area.height});}
  await Promise.race([received,new Promise((_,reject)=>setTimeout(()=>reject(new Error('No target reply')),2500))]);
  await new Promise(resolve=>setTimeout(resolve,0));
  await controller.samplePointer(620);await controller.samplePointer(760);
  if(!targetCount || !last?.locked)throw new Error(`Lock failed: ${JSON.stringify({targetCount,last})}`);
  const center=screen.screenToDipPoint({x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)});
  if(Math.abs(last.x-(center.x-area.x)/(area.width-1))>1/(area.width-1))throw new Error('Lock did not snap to button center');
  console.log(JSON.stringify({targetCount,locked:last.locked,point:last,simulatedInput:true,transparentOverlay:true}));
  controller.cancel();
}).then(()=>finish(0)).catch(error=>{console.error(error.stack);finish(1);});
function finish(code){service?.stop();try{fixture?.stdin.end('\n');}catch{}overlay?.destroy();app.exit(code);}
