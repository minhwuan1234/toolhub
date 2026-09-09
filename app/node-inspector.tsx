'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ShieldCheck,Braces,Table2,ListTree,RefreshCw,ArrowUpRight} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import type {ConnectionPreview} from '@/lib/connection-preview';
import {ConnectionDataView} from './connection-data-view';
import {iconOptions,type BoardNode} from './node-picker';
const databaseTypes=['Supabase','PostgreSQL','MySQL','MongoDB','SQL Server','SQLite'] as const;
type DatabaseType=typeof databaseTypes[number];
export type ConnectionDraft={url:string;tables:string;provider?:DatabaseType};
export function NodeInspector({node,incoming,connected,draft,onDraft,onClose}:{node:BoardNode;connected:boolean;incoming:BoardNode[];draft:ConnectionDraft;onDraft:(draft:ConnectionDraft)=>void;onClose:()=>void}){
 const [key,setKey]=useState('');
 const [data,setData]=useState<ConnectionPreview|null>(null);
 const [busy,setBusy]=useState(false);
 const [tables,setTables]=useState<string[]>([]);
 const [selectedTable,setSelectedTable]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 function invalidate(){controller.current?.abort();setBusy(false);setData(null);setTables([]);setSelectedTable('');setError('');}
 async function load(table:string,page=0){
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  setBusy(true);setError('');setSelectedTable(table);setData(null);
  try{const response=await fetch('/api/connections/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:draft.url.trim(),key:key.trim(),table,page}),signal:abort.signal});const result=await response.json() as ConnectionPreview&{message?:string};if(!response.ok)throw new Error(result.message||'Connection failed.');if(!abort.signal.aborted)setData(result);}
  catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'Connection failed.');}finally{if(!abort.signal.aborted)setBusy(false);}
 }
 const [error,setError]=useState('');
 const provider=draft.provider??'Supabase';
 const [mode,setMode]=useState<'schema'|'table'|'json'>('table');
 const Icon=iconOptions.find(option=>option.type===node.icon)!.icon;
 function submit(){
  const names=[...new Set(draft.tables.split(',').map(value=>value.trim()).filter(Boolean))];
  if(!names.length||names.length>10||names.some(name=>!/^([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/i.test(name))){setError('Enter 1–10 table names separated by commas.');return;}
  if(!draft.url.trim()||!key.trim()){setError('Enter the Project URL and API key.');return;}
  setTables(names);void load(names[0]);
 }
 const EmptyIcon=mode==='table'?Table2:mode==='schema'?ListTree:Braces;
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={`node-inspector ${connected?'has-connections':'standalone-node'}`}>
  <header className="inspector-heading"><span className="inspector-icon"><Icon size={21}/></span><DialogTitle>{node.name}</DialogTitle></header>
  <DialogDescription className="sr-only">Configure a read-only Supabase connection and inspect table data.</DialogDescription>
  <div className="inspector-panels">
   {connected&&<section className="inspector-panel inspector-input"><header><h3>INPUT</h3><span>{incoming.length} sources</span></header><div className="inspector-panel-body">
    {incoming.length?incoming.map(source=>{const SourceIcon=iconOptions.find(option=>option.type===source.icon)!.icon;return <div className="inspector-source" key={source.id}><SourceIcon size={17}/><span>{source.name}</span><ArrowRight size={14}/></div>;}):<div className="inspector-empty"><ArrowRight size={25}/><strong>No connected inputs</strong><p>Connect another node to this node to see its source here.</p></div>}
    {incoming.length>0&&<p className="inspector-muted">Sources are connected on the canvas. No input data has been loaded.</p>}
   </div></section>}
   <section className="inspector-panel inspector-parameters"><header><h3>Connection</h3><span className="inspector-readonly"><ShieldCheck size={12}/>Read only</span></header><div className="inspector-panel-body">
    <div className="inspector-field"><span id="database-type-label">Database type</span><Select value={provider} onValueChange={value=>{if(value){invalidate();onDraft({...draft,provider:value as DatabaseType});setKey('');}}}><SelectTrigger className="inspector-select" aria-labelledby="database-type-label"><SelectValue/></SelectTrigger><SelectContent className="inspector-select-popup" alignItemWithTrigger={false}>{databaseTypes.map(type=><SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
    {provider==='Supabase'?<>
    <label className="inspector-field">Project URL<input type="url" placeholder="https://your-project.supabase.co" value={draft.url} maxLength={250} onChange={event=>{invalidate();onDraft({...draft,url:event.target.value});}}/></label>
    <label className="inspector-field">API key<input type="password" autoComplete="off" placeholder="Enter API key" value={key} maxLength={4096} onChange={event=>{invalidate();setKey(event.target.value);}}/></label>
    <label className="inspector-field">Schema / Tables<textarea placeholder="public.outreach_jobs, public.outreach_job_targets" value={draft.tables} maxLength={2000} rows={4} onChange={event=>{invalidate();onDraft({...draft,tables:event.target.value});}}/></label>
    </>:<div className="inspector-provider-pending">Connection fields for {provider} will be configured next.</div>}
    {error&&<p className="inspector-error" role="alert">{error}</p>}
    <button type="button" className="inspector-check" disabled={provider!=='Supabase'||busy} onClick={submit}>{busy?'Connecting…':'Submit'}<ArrowUpRight size={15}/></button>
   </div></section>
   <section className="inspector-panel inspector-output"><header><h3>{connected?'OUTPUT':'DATA'}</h3><span>{busy?'Loading…':data?'Connected':'Not connected'}</span></header>
    <div className="inspector-data-toolbar"><Select value={selectedTable||null} disabled={!tables.length||busy} onValueChange={value=>{if(value)void load(value);}}><SelectTrigger className="inspector-select" aria-label="Select data table"><SelectValue placeholder="Select a table"/></SelectTrigger><SelectContent className="inspector-select-popup" alignItemWithTrigger={false}>{tables.map(table=><SelectItem key={table} value={table}>{table}</SelectItem>)}</SelectContent></Select><button type="button" disabled={!selectedTable||busy} aria-label="Refresh data" title="Refresh data" onClick={()=>void load(selectedTable,data?.page??0)}><RefreshCw size={15} className={busy?'is-loading':''}/></button></div>
    <div className="inspector-data-views"><div className="inspector-view-options" aria-label="Data format">{(['schema','table','json'] as const).map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='json'?'JSON':value==='table'?'Table':'Schema'}</button>)}</div></div>
    <div className="inspector-panel-body">{data?<ConnectionDataView data={data} mode={mode}/>:<div className="inspector-empty"><EmptyIcon size={27}/><strong>{busy?'Loading data…':mode==='schema'?'No schema available':mode==='table'?'No table data':'No JSON data'}</strong><p>{busy?'Reading from Supabase.':'Submit a connection to view this table.'}</p></div>}</div>
    <footer className="inspector-data-pagination"><button type="button" disabled={!data||data.page===0||busy} onClick={()=>{if(data)void load(selectedTable,data.page-1);}}>Previous</button><span>{data?`Page ${data.page+1} · ${data.rows.length} rows`:'No data'}</span><button type="button" disabled={!data?.hasNext||busy} onClick={()=>{if(data)void load(selectedTable,data.page+1);}}>Next</button></footer>
   </section>
  </div>
 </DialogContent></Dialog>;
}
