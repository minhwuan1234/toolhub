'use client';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { Bell, Users, Workflow, ChevronRight, PanelLeftClose, PanelLeft, LogOut } from 'lucide-react';

import {AvatarEditor} from './avatar-editor';
import type {UsageData} from '@/lib/usage';
type WorkspaceUser = { name:string; email:string; role?:string; image?:string|null };
export function WorkspaceShell({user,active,onNavigate,onSignOut,onAvatarChanged,busy,usage,children}:{user:WorkspaceUser;active:'toolhub'|'members'|'usage';onNavigate:(page:'toolhub'|'members'|'usage')=>void;onSignOut:()=>void;onAvatarChanged:(image:string|null)=>void;busy:boolean;usage:UsageData|null;children:ReactNode}) {
  const [collapsed,setCollapsed]=useState(false);
  const isAdmin=user.role==='admin';
  const known=usage?.railway.status==='connected' && usage.railway.current!==null;
  const total=known?usage!.railway.current!+Object.values(usage!.settings.external).reduce((sum,cost)=>sum+cost,0):null;
  const percent=total===null?null:total/usage!.settings.budget;
  const usageLabel=percent===null?'Usage & limits: connection unavailable':`Usage & limits: $${total!.toFixed(2)} of $${usage!.settings.budget.toFixed(2)} budget${percent>=1?', budget reached':percent>=0.8?', approaching budget':''}`;
  return <div className={`admin-page ${collapsed?'sidebar-collapsed':''}`}>
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="sidebar-brand"><Image src="/notion.svg" width={27} height={27} alt="Notion"/><span>toolhub</span><button className="sidebar-collapse" aria-label="Collapse sidebar" onClick={()=>setCollapsed(true)}><PanelLeftClose size={17}/></button></div>
      <nav aria-label="Main menu"><div className="sidebar-label">Workspace</div><button className={`sidebar-link ${active==='toolhub'?'is-current':''}`} aria-current={active==='toolhub'?'page':undefined} onClick={()=>onNavigate('toolhub')}><Workflow size={17}/>Toolhub</button>{isAdmin && <button className={`sidebar-link ${active==='members'?'is-current':''}`} aria-current={active==='members'?'page':undefined} onClick={()=>onNavigate('members')}><Users size={17}/>Members</button>}</nav>
      <div className="sidebar-bottom"><AvatarEditor name={user.name} image={user.image} onChanged={onAvatarChanged}/><div className="sidebar-profile"><strong>{user.name}</strong><span>{isAdmin?'Admin':'Member'}</span></div><button className="sidebar-collapse" aria-label="Sign out" title="Sign out" disabled={busy} onClick={onSignOut}><LogOut size={16}/></button></div>
    </aside>
    <div className="workspace-main"><header className="workspace-topbar"><div className="workspace-breadcrumb">{collapsed && <button className="sidebar-collapse" aria-label="Expand sidebar" onClick={()=>setCollapsed(false)}><PanelLeft size={18}/></button>}<span>Workspace</span><ChevronRight size={13}/><span>{isAdmin && active==='usage'?'Usage & limits':active==='members' && isAdmin?'Members':'Toolhub'}</span></div><div className="topbar-actions">{isAdmin && <button className={`usage-notification ${active==='usage'?'is-current':''}`} title={active==='usage'?'Close usage & limits':usageLabel} aria-label={active==='usage'?'Close usage & limits':usageLabel} aria-pressed={active==='usage'} aria-current={active==='usage'?'page':undefined} onClick={()=>onNavigate('usage')}><Bell size={17}/>{(percent===null||percent>=0.8)&&<span aria-hidden="true" className={`usage-notification-dot ${percent===null?'is-unknown':percent>=1?'is-over':'is-warning'}`}/>}</button>}<span className="workspace-access">{isAdmin?'Admin':'Member'}</span></div></header><main id="workspace-content">{children}</main></div>
  </div>;
}
