'use client';
import {useRef,useState} from 'react';
import {Pencil,Shapes} from 'lucide-react';
import {nodeOptions,type NodeKind} from './node-picker';
export function NodeDetails({name,active,onRename,onToggle,type,onIconChange}:{type:NodeKind;onIconChange:(type:NodeKind)=>void;name:string;active:boolean;onRename:(name:string)=>void;onToggle:()=>void}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(name);
 const [iconsOpen,setIconsOpen]=useState(false);
 const cancel=useRef(false);
 const renameButton=useRef<HTMLButtonElement>(null);
 function finish(){if(!cancel.current&&draft.trim())onRename(draft.trim());setEditing(false);}
 return <div className="node-details">
  {editing?<input className="node-name-input" aria-label="Node name" maxLength={60} value={draft} ref={element=>{if(element&&document.activeElement!==element){element.focus();element.select();}}} onChange={event=>setDraft(event.target.value)} onPointerDown={event=>event.stopPropagation()} onBlur={finish} onKeyDown={event=>{event.stopPropagation();if(event.key==='Enter'){event.preventDefault();finish();}else if(event.key==='Escape'){event.preventDefault();cancel.current=true;setEditing(false);requestAnimationFrame(()=>renameButton.current?.focus());}}}/>:<button ref={renameButton} type="button" className="node-name" title={`Rename ${name}`} aria-label={`Rename ${name}`} onPointerDown={event=>event.stopPropagation()} onClick={()=>{cancel.current=false;setDraft(name);setEditing(true);}}><span>{name}</span><Pencil size={11}/></button>}
  <div className="node-meta"><button type="button" className="node-change-icon" aria-label={`Change icon for ${name}`} title="Change icon" aria-expanded={iconsOpen} onPointerDown={event=>event.stopPropagation()} onClick={()=>setIconsOpen(current=>!current)}><Shapes size={12}/></button>
  <button type="button" className={`node-status ${active?'is-active':''}`} aria-label={`Active status for ${name}`} aria-pressed={active} title="Change node status" onPointerDown={event=>event.stopPropagation()} onClick={onToggle}><span aria-hidden="true"/>{active?'Active':'Inactive'}</button></div>
  {iconsOpen&&<div className="node-icon-options" role="toolbar" aria-label="Choose node icon">{nodeOptions.map(({type:kind,label,icon:Icon})=><button type="button" key={kind} aria-label={label} title={label} aria-pressed={type===kind} onPointerDown={event=>event.stopPropagation()} onClick={()=>{onIconChange(kind);setIconsOpen(false);}}><Icon size={18}/></button>)}</div>}
 </div>;
}
