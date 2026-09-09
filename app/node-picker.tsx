'use client';
import {Box,Database,Globe,FileText,MessageSquare,Workflow,X} from 'lucide-react';
export const nodeOptions=[
  {type:'tool',label:'Tool',icon:Box},
  {type:'database',label:'Database',icon:Database},
  {type:'api',label:'API',icon:Globe},
  {type:'document',label:'Document',icon:FileText},
  {type:'message',label:'Message',icon:MessageSquare},
  {type:'workflow',label:'Workflow',icon:Workflow},
] as const;
export type NodeKind=typeof nodeOptions[number]['type'];
export type BoardNode={id:string;type:NodeKind;x:number;y:number};
export function NodePicker({onSelect,onClose}:{onSelect:(kind:NodeKind)=>void;onClose:()=>void}){
 return <aside className="node-picker" aria-label="Add node"><header><h2>Add node</h2><button type="button" aria-label="Close node picker" onClick={onClose}><X size={18}/></button></header><div className="node-picker-options">{nodeOptions.map(({type,label,icon:Icon})=><button type="button" key={type} onClick={()=>onSelect(type)}><span><Icon size={22}/></span>{label}</button>)}</div></aside>;
}
