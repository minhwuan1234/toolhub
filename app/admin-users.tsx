'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Search, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { departments } from '@/lib/departments';
type User = {image?:string|null;id:string;name:string;email:string;department:string;role:string;banned:boolean;created_at:string};
function AccountSelect({value,items,label,disabled,onChange,className=''}:{value:string;items:{value:string;label:string}[];label:string;disabled:boolean;onChange:(value:string)=>void;className?:string}) {
  return <Select value={value} items={items} disabled={disabled} onValueChange={v=>{if(v)onChange(v);}}><SelectTrigger className={`account-cell-select ${className}`} aria-label={label}><SelectValue/></SelectTrigger><SelectContent align="start" alignItemWithTrigger={false} className="account-select-menu">{items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>;
}
export function AdminUsers({currentUserId}:{currentUserId:string}) {
  const [originals,setOriginals]=useState<User[]>([]);
  const [users,setUsers]=useState<User[]>([]);
  const [query,setQuery]=useState(''); const [search,setSearch]=useState('');
  const [page,setPage]=useState(0); const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [saving,setSaving]=useState<string | null>(null);
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.resolve().then(()=>{ if(!controller.signal.aborted){setLoading(true);setError('');} });
    fetch(`/api/admin/users?search=${encodeURIComponent(search)}&page=${page}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{const data=await response.json() as {message:string;users:User[];total:number};if(!response.ok) throw new Error(data.message);return data;})
      .then(data=>{setUsers(data.users);setOriginals(data.users);setTotal(data.total);})
      .catch(e=>{if(e.name!=='AbortError')setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[search,page,revision]);
  function edit(id:string,changes:Partial<User>) {setUsers(rows=>rows.map(row=>row.id===id?{...row,...changes}:row));setNotice('');}
  async function save(user:User) {
    setSaving(user.id);setError('');setNotice('');
    try {
      const response=await fetch('/api/admin/users',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:user.id,department:user.department,role:user.role,banned:user.banned})});
      const data=await response.json() as {message:string;users:User[];total:number};if(!response.ok)throw new Error(data.message);
      setNotice(`Updated ${user.name}.`);setRevision(v=>v+1);
    } catch(e) {setError(e instanceof Error?e.message:'Update failed.');}
    finally {setSaving(null);}
  }
  const isDirty=(user:User)=>{const original=originals.find(row=>row.id===user.id);return original && (original.department!==user.department || original.role!==user.role || original.banned!==user.banned);};
  return <section className="accounts-content" id="accounts" aria-labelledby="accounts-heading">
        <div className="accounts-heading"><div className="page-icon"><Users size={28} strokeWidth={1.5}/></div><h1 id="accounts-heading">Members</h1><p>Manage the people in your workspace.</p></div>
        <div className="accounts-toolbar"><div className="accounts-view"><Users size={16}/><span>All members</span>{!loading && <span className="count-badge">{total}</span>}</div>
          <form className="admin-search" onSubmit={e=>{e.preventDefault();setPage(0);setSearch(query);}}><Search size={15} aria-hidden="true"/><Input aria-label="Search accounts" placeholder="Search accounts…" value={query} onChange={e=>setQuery(e.target.value)}/><Button variant="ghost" type="submit" disabled={!!saving} aria-label="Search accounts"><ChevronRight size={16}/></Button></form>
        </div>
        {error && <p className="error" role="alert">{error}</p>}{notice && <output className="admin-notice"><Check size={14}/>{notice}</output>}
        <div className="accounts-table" aria-busy={loading}>
        <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Department</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>{loading?<TableRow><TableCell colSpan={6}><output className="table-empty">Loading accounts…</output></TableCell></TableRow>:users.map(user=><TableRow key={user.id} className={isDirty(user)?'row-edited':''}>
            <TableCell><div className="member-identity"><span className="member-avatar" aria-hidden="true">{user.image?<Image src={user.image} unoptimized width={32} height={32} alt=""/>:user.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span><div><div className="member-name">{user.name}{user.id===currentUserId && <span className="you-label">you</span>}</div><div className="account-email">{user.email}</div></div></div></TableCell>
            <TableCell><AccountSelect label={`Department for ${user.email}`} value={user.department} items={departments.map(d=>({value:d,label:d}))} disabled={!!saving} onChange={department=>edit(user.id,{department})} className="department-cell"/></TableCell>
            <TableCell>{user.id===currentUserId?<span className="role-label">Admin</span>:<AccountSelect label={`Role for ${user.email}`} value={user.role} items={[{value:'user',label:'Member'},{value:'admin',label:'Admin'}]} disabled={!!saving} onChange={role=>edit(user.id,{role})}/>}</TableCell>
            <TableCell>{user.id===currentUserId?<span className="status-label status-active"><i/>Active</span>:<AccountSelect label={`Status for ${user.email}`} value={user.banned?'disabled':'active'} items={[{value:'active',label:'Active'},{value:'disabled',label:'Disabled'}]} disabled={!!saving} onChange={value=>edit(user.id,{banned:value==='disabled'})} className={`status-select ${user.banned?'status-disabled':'status-active'}`}/>}</TableCell>
            <TableCell className="joined-date">{new Date(user.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</TableCell><TableCell className="row-actions">{isDirty(user)?<Button className="row-save" disabled={!!saving} onClick={()=>save(user)}>{saving===user.id?'Saving…':'Save'}</Button>:<span className="saved-indicator" aria-label="No unsaved changes">—</span>}</TableCell>
          </TableRow>)}{!loading && !users.length && <TableRow><TableCell colSpan={6}><div className="table-empty"><Users size={24}/><strong>No accounts found</strong><span>Try a different name or email.</span></div></TableCell></TableRow>}</TableBody></Table>
        </div>
        <footer className="admin-pagination"><span className="results-caption">{loading?'Loading…':`${total} ${total===1?'account':'accounts'}`}</span><div><Button variant="ghost" aria-label="Previous page" disabled={page===0 || loading || !!saving} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/></Button><span>Page {page+1}</span><Button variant="ghost" aria-label="Next page" disabled={(page+1)*25>=total || loading || !!saving} onClick={()=>setPage(p=>p+1)}><ChevronRight size={15}/></Button></div></footer>
      </section>;
}
