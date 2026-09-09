'use client';
import {useId,useRef,useState,type RefObject} from 'react';
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
export function useNodeConnections(nodes:BoardNode[],view:Viewport,viewport:RefObject<HTMLDivElement|null>){
 const [edges,setEdges]=useState<Edge[]>([]);
 const [draft,setDraft]=useState<Draft|null>(null);
 const [announcement,setAnnouncement]=useState('');
 const drag=useRef<{source:string;pointer:number}|null>(null);
 const marker=useId().replace(/:/g,'');
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
 function cancel(){drag.current=null;setDraft(null);}
 const source=draft?nodes.find(node=>node.id===draft.source):null;
 const target=draft?.target?nodes.find(node=>node.id===draft.target):null;
 const layer=<><svg className="canvas-connections" aria-hidden="true">
  <defs><marker id={marker} viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#96958e" strokeWidth="1.5"/></marker></defs>
  {edges.map(edge=>{const from=nodes.find(node=>node.id===edge.source),to=nodes.find(node=>node.id===edge.target);if(!from||!to)return null;const d=curve(portPoint(from,true),portPoint(to,false));return <g key={`${edge.source}-${edge.target}`}><path className="connection-line" d={d} markerEnd={`url(#${marker})`}/><path className="connection-motion" d={d}/></g>;})}
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
 return {layer,ports,cancel};
}
