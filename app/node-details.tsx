'use client';
import {useRef,useState,type ReactNode} from 'react';
import {Pencil,Shapes,Power,Check} from 'lucide-react';
import {ContextMenu,ContextMenuTrigger,ContextMenuContent,ContextMenuItem,ContextMenuSub,ContextMenuSubTrigger,ContextMenuSubContent} from '@/components/ui/context-menu';
import {iconOptions,type NodeIcon} from './node-picker';
export function NodeDetails({name,active,onRename,onToggle,icon,onIconChange,x,y,children}:{x:number;y:number;children:ReactNode;icon:NodeIcon;onIconChange:(icon:NodeIcon)=>void;name:string;active:boolean;onRename:(name:string)=>void;onToggle:()=>void}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(name);
 const cancel=useRef(false);
 const input=useRef<HTMLInputElement>(null);
 function finish(){if(!cancel.current&&draft.trim())onRename(draft.trim());setEditing(false);}
 return <ContextMenu>
  <ContextMenuTrigger data-canvas-node className="canvas-node-group" style={{left:x,top:y}}>
   {children}
   <div className="node-details">
    {editing?<input ref={input} className="node-name-input" aria-label="Node name" maxLength={60} value={draft} onChange={event=>setDraft(event.target.value)} onPointerDown={event=>event.stopPropagation()} onBlur={finish} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();finish();}else if(event.key==='Escape'){event.preventDefault();cancel.current=true;setEditing(false);}}}/>:<span className="node-name" title={name}>{name}</span>}
    <span className={`node-status ${active?'is-active':''}`}><span aria-hidden="true"/>{active?'Active':'Inactive'}</span>
   </div>
  </ContextMenuTrigger>
  <ContextMenuContent className="node-context-menu" finalFocus={false} onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
   <ContextMenuItem onClick={()=>{cancel.current=false;setDraft(name);setEditing(true);requestAnimationFrame(()=>{input.current?.focus();input.current?.select();});}}><Pencil/>Rename</ContextMenuItem>
   <ContextMenuSub><ContextMenuSubTrigger><Shapes/>Change icon</ContextMenuSubTrigger><ContextMenuSubContent className="node-context-menu" onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>{iconOptions.map(({type:kind,label,icon:Icon})=><ContextMenuItem key={kind} onClick={()=>onIconChange(kind)}><Icon/>{label}{icon===kind&&<Check className="ml-auto"/>}</ContextMenuItem>)}</ContextMenuSubContent></ContextMenuSub>
   <ContextMenuItem onClick={onToggle}><Power/>{active?'Set inactive':'Set active'}</ContextMenuItem>
  </ContextMenuContent>
 </ContextMenu>;
}
