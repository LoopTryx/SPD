import { forwardRef,useImperativeHandle,useRef } from 'react';
import type { AssistedPoint } from './spd/magnetic-pointer';
export interface PseudoCursorHandle { show(point:({x:number;y:number;locked?:boolean})|null):void }

const PseudoCursor=forwardRef<PseudoCursorHandle>((_props,ref)=>{
  const element=useRef<HTMLDivElement>(null);
  useImperativeHandle(ref,()=>({show(point:Partial<AssistedPoint>|null){
    const node=element.current;if(!node)return;
    node.style.display=point?'block':'none';
    if(!point)return;
    node.style.left=`${point.x!*100}%`;node.style.top=`${point.y!*100}%`;
    node.style.width=node.style.height=point.locked?'22px':'10px';
    node.style.borderColor=point.locked?'#b9eeff':'#55bbff';
    node.dataset.locked=String(!!point.locked);
  }}),[]);
  return <div ref={element} data-spd-pseudo-cursor aria-hidden="true" style={{display:'none',position:'fixed',
    pointerEvents:'none',zIndex:100,width:10,height:10,border:'2px solid #55bbff',borderRadius:'50%',
    transform:'translate(-50%,-50%)',boxShadow:'0 0 8px rgba(74,180,255,.6)',boxSizing:'border-box'}}/>;
});
PseudoCursor.displayName='PseudoCursor';
export default PseudoCursor;
