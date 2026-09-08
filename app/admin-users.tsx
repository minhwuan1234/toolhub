'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { departments } from '@/lib/departments';
type User = {id:string;name:string;email:string;department:string;role:string;banned:boolean;created_at:string};
export function AdminUsers({currentUserId,onBack}:{currentUserId:string;onBack:()=>void}) {
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
      .then(data=>{setUsers(data.users);setTotal(data.total);})
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
  return <main className="admin-page">
    <header className="admin-header"><div className="brand"><Image src="/notion.svg" width="30" height="30" alt="Notion"/><span>toolhub</span></div><Button variant="outline" onClick={onBack}>My account</Button></header>
    <section><h1>Accounts</h1>
      <form className="admin-search" onSubmit={e=>{e.preventDefault();setPage(0);setSearch(query);}}><Input aria-label="Search accounts" placeholder="Search name or email" value={query} onChange={e=>setQuery(e.target.value)}/><Button type="submit" disabled={!!saving}>Search</Button></form>
      {error && <p className="error" role="alert">{error}</p>}{notice && <output className="notice">{notice}</output>}
      {loading?<output>Loading accounts…</output>:<Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Department</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{users.map(user=><TableRow key={user.id}>
          <TableCell><strong>{user.name}{user.id===currentUserId?' (you)':''}</strong><div className="account-email">{user.email}</div></TableCell>
          <TableCell><NativeSelect aria-label={`Department for ${user.email}`} value={user.department} disabled={!!saving} onChange={e=>edit(user.id,{department:e.target.value})}>{departments.map(d=><option key={d}>{d}</option>)}</NativeSelect></TableCell>
          <TableCell><NativeSelect aria-label={`Role for ${user.email}`} value={user.role} disabled={!!saving || user.id===currentUserId} onChange={e=>edit(user.id,{role:e.target.value})}><option value="user">Member</option><option value="admin">Admin</option></NativeSelect></TableCell>
          <TableCell><NativeSelect aria-label={`Status for ${user.email}`} value={user.banned?'disabled':'active'} disabled={!!saving || user.id===currentUserId} onChange={e=>edit(user.id,{banned:e.target.value==='disabled'})}><option value="active">Active</option><option value="disabled">Disabled</option></NativeSelect></TableCell>
          <TableCell>{new Date(user.created_at).toLocaleDateString('en-GB')}</TableCell><TableCell><Button disabled={!!saving} onClick={()=>save(user)}>{saving===user.id?'Saving…':'Save'}</Button></TableCell>
        </TableRow>)}{!users.length && <TableRow><TableCell colSpan={6}>No accounts found.</TableCell></TableRow>}</TableBody></Table>}
      <footer className="admin-pagination"><Button variant="outline" disabled={page===0 || loading || !!saving} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page+1}</span><Button variant="outline" disabled={(page+1)*25>=total || loading || !!saving} onClick={()=>setPage(p=>p+1)}>Next</Button></footer>
    </section>
  </main>;
}
