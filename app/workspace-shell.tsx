'use client';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { Gauge, Users, Workflow, ChevronRight, PanelLeftClose, PanelLeft, LogOut } from 'lucide-react';

import {UsageMeter} from './usage-panel';
import type {UsageData} from '@/lib/usage';
type WorkspaceUser = { name:string; email:string; role?:string };
export function WorkspaceShell({user,active,onNavigate,onSignOut,busy,usage,children}:{user:WorkspaceUser;active:'toolhub'|'members'|'usage';onNavigate:(page:'toolhub'|'members'|'usage')=>void;onSignOut:()=>void;busy:boolean;usage:UsageData|null;children:ReactNode}) {
  const [collapsed,setCollapsed]=useState(false);
  const isAdmin=user.role==='admin';
  return <div className={`admin-page ${collapsed?'sidebar-collapsed':''}`}>
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="sidebar-brand"><Image src="/notion.svg" width={27} height={27} alt="Notion"/><span>toolhub</span><button className="sidebar-collapse" aria-label="Collapse sidebar" onClick={()=>setCollapsed(true)}><PanelLeftClose size={17}/></button></div>
      <nav aria-label="Main menu"><div className="sidebar-label">Workspace</div><button className={`sidebar-link ${active==='toolhub'?'is-current':''}`} aria-current={active==='toolhub'?'page':undefined} onClick={()=>onNavigate('toolhub')}><Workflow size={17}/>Toolhub</button>{isAdmin && <button className={`sidebar-link ${active==='members'?'is-current':''}`} aria-current={active==='members'?'page':undefined} onClick={()=>onNavigate('members')}><Users size={17}/>Members</button>}</nav>{isAdmin && <button className={`sidebar-usage ${active==='usage'?'is-current':''}`} aria-current={active==='usage'?'page':undefined} onClick={()=>onNavigate('usage')}><span className="sidebar-usage-title"><Gauge size={16}/>Usage & limits</span><UsageMeter data={usage}/></button>}
      <div className="sidebar-bottom"><span className="sidebar-avatar" aria-hidden="true">{user.name.trim().slice(0,1).toUpperCase()}</span><div className="sidebar-profile"><strong>{user.name}</strong><span>{isAdmin?'Admin':'Member'}</span></div><button className="sidebar-collapse" aria-label="Sign out" title="Sign out" disabled={busy} onClick={onSignOut}><LogOut size={16}/></button></div>
    </aside>
    <div className="workspace-main"><header className="workspace-topbar"><div className="workspace-breadcrumb">{collapsed && <button className="sidebar-collapse" aria-label="Expand sidebar" onClick={()=>setCollapsed(false)}><PanelLeft size={18}/></button>}<span>Workspace</span><ChevronRight size={13}/><span>{isAdmin && active==='usage'?'Usage & limits':active==='members' && isAdmin?'Members':'Toolhub'}</span></div><span className="workspace-access">{isAdmin?'Admin':'Member'}</span></header><main id="workspace-content">{children}</main></div>
  </div>;
}
