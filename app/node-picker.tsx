'use client';
import {Box,Database,Globe,FileText,MessageSquare,Workflow,X,Mail,Calendar,Users,Folder,Code,Zap,Server,Shield,ShoppingCart,Image,Video,ChartColumn,Bot,Wrench,CircleCheck,BookOpen,ArrowRightLeft} from 'lucide-react';
import type { AgentId } from '@/lib/agent-team';
import type { AgentCard } from '@/lib/agent-cards';
export const nodeOptions=[
  {type:'agent',label:'AI Agent',icon:Bot},
  {type:'tool',label:'Tool',icon:Box},
  {type:'database',label:'Database',icon:Database},
  {type:'api',label:'API',icon:Globe},
  {type:'document',label:'Document',icon:FileText},
  {type:'message',label:'Message',icon:MessageSquare},
  {type:'workflow',label:'Workflow',icon:Workflow},
] as const;
export const iconOptions=[
  ...nodeOptions,
  {type:'email',label:'Email',icon:Mail},
  {type:'calendar',label:'Calendar',icon:Calendar},
  {type:'team',label:'Team',icon:Users},
  {type:'folder',label:'Folder',icon:Folder},
  {type:'code',label:'Code',icon:Code},
  {type:'automation',label:'Automation',icon:Zap},
  {type:'server',label:'Server',icon:Server},
  {type:'security',label:'Security',icon:Shield},
  {type:'sales',label:'Sales',icon:ShoppingCart},
  {type:'image',label:'Image',icon:Image},
  {type:'video',label:'Video',icon:Video},
  {type:'analytics',label:'Analytics',icon:ChartColumn},
  {type:'tool-calling',label:'Tool Calling',icon:Wrench},
  {type:'human-approval',label:'Human Approval',icon:CircleCheck},
  {type:'skill',label:'Skill',icon:BookOpen},
  {type:'agent-handoff',label:'Agent Handoff',icon:ArrowRightLeft},
] as const;
export type NodeKind=typeof nodeOptions[number]['type'];
export type NodeIcon=typeof iconOptions[number]['type'];
export type BoardNode={id:string;type:NodeKind;icon:NodeIcon;name:string;active:boolean;x:number;y:number;agentId?:AgentId;card?:AgentCard};
export function NodePicker({onSelect,onClose,canAddAgent}:{onSelect:(kind:NodeKind)=>void;onClose:()=>void;canAddAgent:boolean}){
 return <aside className="node-picker" aria-label="Add node"><header><h2>Add node</h2><button type="button" aria-label="Close node picker" onClick={onClose}><X size={18}/></button></header><div className="node-picker-options">{nodeOptions.map(({type,label,icon:Icon})=><button type="button" key={type} draggable={type!=='agent'||canAddAgent} disabled={type==='agent'&&!canAddAgent} title={type==='agent'&&!canAddAgent?'Admin access required':undefined} onDragStart={event=>{event.dataTransfer.setData('application/x-toolhub-node',type);event.dataTransfer.effectAllowed='copy';}} onClick={()=>onSelect(type)}><span><Icon size={22}/></span>{label}</button>)}</div></aside>;
}
