'use client';
import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { Users, UserRound, ChevronRight, PanelLeftClose, PanelLeft, LogOut } from 'lucide-react';

type WorkspaceUser = { name:string; email:string; role?:string };
export function WorkspaceShell({user,active,onNavigate,onSignOut,busy,children}:{user:WorkspaceUser;active:'account'|'members';onNavigate:(page:'account'|'members')=>void;onSignOut:()=>void;busy:boolean;children:ReactNode}) {
  const [collapsed,setCollapsed]=useState(false);
  const isAdmin=user.role==='admin';
  return <div className={`admin-page ${collapsed?'sidebar-collapsed':''}`}>
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="sidebar-brand"><Image src="/notion.svg" width={27} height={27} alt="Notion"/><span>toolhub</span><button className="sidebar-collapse" aria-label="Collapse sidebar" onClick={()=>setCollapsed(true)}><PanelLeftClose size={17}/></button></div>
      <nav aria-label="Main menu"><div className="sidebar-label">Workspace</div><button className={`sidebar-link ${active==='account'?'is-current':''}`} aria-current={active==='account'?'page':undefined} onClick={()=>onNavigate('account')}><UserRound size={17}/>My account</button>{isAdmin && <button className={`sidebar-link ${active==='members'?'is-current':''}`} aria-current={active==='members'?'page':undefined} onClick={()=>onNavigate('members')}><Users size={17}/>Members</button>}</nav>
      <div className="sidebar-bottom"><span className="sidebar-avatar" aria-hidden="true">{user.name.trim().slice(0,1).toUpperCase()}</span><div className="sidebar-profile"><strong>{user.name}</strong><span>{isAdmin?'Admin':'Member'}</span></div><button className="sidebar-collapse" aria-label="Sign out" title="Sign out" disabled={busy} onClick={onSignOut}><LogOut size={16}/></button></div>
    </aside>
    <div className="workspace-main"><header className="workspace-topbar"><div className="workspace-breadcrumb">{collapsed && <button className="sidebar-collapse" aria-label="Expand sidebar" onClick={()=>setCollapsed(false)}><PanelLeft size={18}/></button>}<span>Workspace</span><ChevronRight size={13}/><span>{active==='members' && isAdmin?'Members':'My account'}</span></div><span className="workspace-access">{isAdmin?'Admin':'Member'}</span></header><main id="workspace-content">{children}</main></div>
  </div>;
}
