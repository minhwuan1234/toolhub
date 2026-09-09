'use client';
// SVG paths provide the curved connection hit area and keyboard activation.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import {useEffect,useId,useRef,useState,type RefObject,type KeyboardEvent} from 'react';
import {ArrowLeft,ArrowRight,Trash2,X} from 'lucide-react';
import type {BoardNode} from './node-picker';
import type {Viewport} from '@/lib/canvas-viewport';

type Point={x:number;y:number};
type Edge={source:string;target:string};
type Draft={source:string;point:Point;target:string|null};
const portPoint=(node:BoardNode,output:boolean):Point=>({x:node.x+(output?104:40),y:node.y+32});
function curve(start:Point,end:Point){
 const bend=Math.max(60,Math.abs(end.x-start.x)*0.45);
 return `M ${start.x} ${start.y} C ${start.x+bend} ${start.y}, ${end.x-bend} ${end.y}, ${end.x} ${end.y}`;
}
export function useNodeConnections(nodes:BoardNode[],view:Viewport,viewport:RefObject<HTMLDivElement|null>,onNavigate:(node:BoardNode)=>void){
 const [selected,setSelected]=useState<{edge:Edge;point:Point}|null>(null);
 const menuRef=useRef<HTMLDivElement>(null);
 const [edges,setEdges]=useState<Edge[]>([]);
 const [draft,setDraft]=useState<Draft|null>(null);
 const [announcement,setAnnouncement]=useState('');
 const drag=useRef<{source:string;pointer:number}|null>(null);
 const marker=useId().replace(/:/g,'');
 useEffect(()=>{
  if(!selected)return;
  menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  function outside(event:globalThis.PointerEvent){if(event.target instanceof Element&&!menuRef.current?.contains(event.target)&&!event.target.closest('.connection-hit'))setSelected(null);}
  document.addEventListener('pointerdown',outside,true);
  return()=>document.removeEventListener('pointerdown',outside,true);
 },[selected]);
 function removeEdge(edge:Edge){
  setEdges(current=>current.filter(item=>item.source!==edge.source||item.target!==edge.target));
  setSelected(null);
  setAnnouncement('Connection deleted.');
  requestAnimationFrame(()=>viewport.current?.focus());
 }
 function select(edge:Edge,point:Point){
  const box=viewport.current?.getBoundingClientRect();if(!box)return;
  setSelected({edge,point:{x:Math.max(8,Math.min(point.x,box.width-248)),y:Math.max(8,Math.min(point.y,box.height-160))}});
 }
 function targetAt(x:number,y:number,source:string){
  const port=document.elementFromPoint(x,y)?.closest<HTMLElement>('[data-node-input]');
  const id=port?.dataset.nodeInput;
  return port&&viewport.current?.contains(port)&&id!==source&&nodes.some(node=>node.id===id)?id!:null;
 }
 function connect(source:string,target:string){
  if(source!==target&&nodes.some(node=>node.id===source)&&nodes.some(node=>node.id===target)){
   setEdges(current=>current.some(edge=>edge.source===source&&edge.target===target)?current:[...current,{source,target}]);
   setAnnouncement(`Connected ${nodes.find(node=>node.id===source)!.name} to ${nodes.find(node=>node.id===target)!.name}.`);
  }
  setDraft(null);drag.current=null;
 }
 function cancel(){drag.current=null;setDraft(null);setSelected(null);}
 const source=draft?nodes.find(node=>node.id===draft.source):null;
 const target=draft?.target?nodes.find(node=>node.id===draft.target):null;
 const layer=<><svg className="canvas-connections" aria-label="Node connections">
  <defs><marker id={marker} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#96958e" strokeWidth="1.5"/></marker></defs>
  {edges.map(edge=>{const from=nodes.find(node=>node.id===edge.source),to=nodes.find(node=>node.id===edge.target);if(!from||!to)return null;const d=curve(portPoint(from,true),portPoint(to,false));return <g key={`${edge.source}-${edge.target}`} className={selected?.edge.source===edge.source&&selected.edge.target===edge.target?'is-selected':''}><path className="connection-hit" d={d} role="button" tabIndex={0} aria-label={`Connection from ${from.name} to ${to.name}`} aria-haspopup="dialog" vectorEffect="non-scaling-stroke" onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();const box=viewport.current?.getBoundingClientRect();if(box)select(edge,{x:event.clientX-box.left+8,y:event.clientY-box.top+8});}} onKeyDown={event=>{if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();event.stopPropagation();if(!event.repeat)removeEdge(edge);return;}if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();select(edge,{x:view.x+(from.x+to.x+144)/2*view.zoom,y:view.y+(from.y+to.y+64)/2*view.zoom});}}}/><path className="connection-line" d={d} markerEnd={`url(#${marker})`}/><path className="connection-motion" d={d}/></g>;})}
  {source&&draft&&<path className={`connection-preview ${target?'is-ready':''}`} d={curve(portPoint(source,true),target?portPoint(target,false):draft.point)}/>}
 </svg><output className="sr-only">{announcement}</output></>;
 function ports(node:BoardNode){const inputConnected=edges.some(edge=>edge.target===node.id),outputConnected=edges.some(edge=>edge.source===node.id);return <>
  <button type="button" className={`node-port node-port-input ${draft&&draft.source!==node.id?'can-connect':''} ${draft?.target===node.id?'is-target':''} ${inputConnected?'is-connected':''}`} data-node-input={node.id} aria-label={`Input of ${node.name}${inputConnected?', connected':''}`} title={inputConnected?'Input — connected on canvas':'Input — drop a connection here'} onPointerDown={event=>event.stopPropagation()} onClick={()=>{if(draft)connect(draft.source,node.id);}}/>
  <button type="button" className={`node-port node-port-output ${draft?.source===node.id?'is-target':''} ${outputConnected?'is-connected':''}`} aria-label={`Connect from ${node.name}${outputConnected?', connected':''}`} title={outputConnected?'Output — connected on canvas':"Output — drag to another node's input"}
   onPointerDown={event=>{event.stopPropagation();if(event.button!==0||!event.isPrimary)return;event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={source:node.id,pointer:event.pointerId};setDraft({source:node.id,point:portPoint(node,true),target:null});}}
   onPointerMove={event=>{event.stopPropagation();if(drag.current?.pointer!==event.pointerId)return;const box=viewport.current?.getBoundingClientRect();if(!box)return;setDraft({source:node.id,point:{x:(event.clientX-box.left-view.x)/view.zoom,y:(event.clientY-box.top-view.y)/view.zoom},target:targetAt(event.clientX,event.clientY,node.id)});}}
   onPointerUp={event=>{event.stopPropagation();if(drag.current?.pointer!==event.pointerId)return;const id=targetAt(event.clientX,event.clientY,node.id);if(id)connect(node.id,id);else cancel();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
   onPointerCancel={event=>{event.stopPropagation();cancel();}}
   onLostPointerCapture={event=>{event.stopPropagation();if(drag.current)cancel();}}
   onClick={event=>{if(event.detail===0)setDraft({source:node.id,point:{x:node.x+184,y:node.y+32},target:null});}}
  />
 </>;}
 const from=nodes.find(node=>node.id===selected?.edge.source),to=nodes.find(node=>node.id===selected?.edge.target);
 const menuKeys={onKeyDown:(event:KeyboardEvent<HTMLButtonElement>)=>{if(selected&&(event.key==='Backspace'||event.key==='Delete')){event.preventDefault();event.stopPropagation();if(!event.repeat)removeEdge(selected.edge);}}};
 const menu=selected&&from&&to?<div ref={menuRef} className="connection-menu" role="dialog" aria-label="Connection actions" style={{left:selected.point.x,top:selected.point.y}}>
  <header><span>Connection</span><button type="button" {...menuKeys} aria-label="Close connection actions" onClick={()=>setSelected(null)}><X size={14}/></button></header>
  <button type="button" {...menuKeys} title={`Go to source: ${from.name}`} onClick={()=>{onNavigate(from);setSelected(null);}}><ArrowLeft size={15}/><span><small>Source</small>{from.name}</span></button>
  <button type="button" {...menuKeys} title={`Go to target: ${to.name}`} onClick={()=>{onNavigate(to);setSelected(null);}}><ArrowRight size={15}/><span><small>Target</small>{to.name}</span></button>
  <button type="button" {...menuKeys} className="delete-connection" onClick={()=>removeEdge(selected.edge)}><Trash2 size={14}/>Delete connection</button>
 </div>:null;
 function removeNode(id:string){
  setEdges(current=>current.filter(edge=>edge.source!==id&&edge.target!==id));
  setSelected(current=>current&&(current.edge.source===id||current.edge.target===id)?null:current);
  if(draft?.source===id||draft?.target===id)cancel();
 }
 return {layer,ports,cancel,menu,removeNode,isConnected:(id:string)=>edges.some(edge=>edge.source===id||edge.target===id),incoming:(id:string)=>nodes.filter(node=>edges.some(edge=>edge.target===id&&edge.source===node.id))};
}
