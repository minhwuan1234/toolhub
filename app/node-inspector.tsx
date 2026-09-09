'use client';
import {useState} from 'react';
import {ArrowRight,ShieldCheck,Braces,Table2,ListTree,RefreshCw,ArrowUpRight} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {iconOptions,type BoardNode} from './node-picker';
const databaseTypes=['Supabase','PostgreSQL','MySQL','MongoDB','SQL Server','SQLite'] as const;
type DatabaseType=typeof databaseTypes[number];
export type ConnectionDraft={url:string;tables:string;provider?:DatabaseType};
export function NodeInspector({node,incoming,connected,draft,onDraft,onClose}:{node:BoardNode;connected:boolean;incoming:BoardNode[];draft:ConnectionDraft;onDraft:(draft:ConnectionDraft)=>void;onClose:()=>void}){
 const [key,setKey]=useState('');
 const [error,setError]=useState('');
 const provider=draft.provider??'Supabase';
 const [mode,setMode]=useState<'schema'|'table'|'json'>('table');
 const Icon=iconOptions.find(option=>option.type===node.icon)!.icon;
 function submit(){
  setError('Connection submission is not available yet. No data has been sent.');
 }
 const EmptyIcon=mode==='table'?Table2:mode==='schema'?ListTree:Braces;
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={`node-inspector ${connected?'has-connections':'standalone-node'}`}>
  <header className="inspector-heading"><span className="inspector-icon"><Icon size={21}/></span><DialogTitle>{node.name}</DialogTitle><span className="inspector-ui-badge">Connection setup</span></header>
  <DialogDescription className="sr-only">Review inputs, configure your connection and inspect its configuration. No external requests are made.</DialogDescription>
  <div className="inspector-panels">
   {connected&&<section className="inspector-panel inspector-input"><header><h3>INPUT</h3><span>{incoming.length} sources</span></header><div className="inspector-panel-body">
    {incoming.length?incoming.map(source=>{const SourceIcon=iconOptions.find(option=>option.type===source.icon)!.icon;return <div className="inspector-source" key={source.id}><SourceIcon size={17}/><span>{source.name}</span><ArrowRight size={14}/></div>;}):<div className="inspector-empty"><ArrowRight size={25}/><strong>No connected inputs</strong><p>Connect another node to this node to see its source here.</p></div>}
    {incoming.length>0&&<p className="inspector-muted">Sources are connected on the canvas. No input data has been loaded.</p>}
   </div></section>}
   <section className="inspector-panel inspector-parameters"><header><h3>Connection</h3><span className="inspector-readonly"><ShieldCheck size={12}/>Read only</span></header><div className="inspector-panel-body">
    <label className="inspector-field">Database type<select value={provider} onChange={event=>{onDraft({...draft,provider:event.target.value as DatabaseType});setKey('');setError('');}}>{databaseTypes.map(type=><option key={type} value={type}>{type}</option>)}</select></label>
    {provider==='Supabase'?<>
    <label className="inspector-field">Project URL<input type="url" placeholder="https://your-project.supabase.co" value={draft.url} maxLength={250} onChange={event=>{onDraft({...draft,url:event.target.value});setError('');}}/></label>
    <label className="inspector-field">API key<input type="password" autoComplete="off" placeholder="Placeholder key" value={key} maxLength={1000} onChange={event=>{setKey(event.target.value);setError('');}}/></label>
    <label className="inspector-field">Schema / Tables<textarea placeholder="public.outreach_jobs, public.outreach_job_targets" value={draft.tables} maxLength={2000} rows={4} onChange={event=>{onDraft({...draft,tables:event.target.value});setError('');}}/></label>
    </>:<div className="inspector-provider-pending">Connection fields for {provider} will be configured next.</div>}
    {error&&<p className="inspector-error" role="alert">{error}</p>}
    <button type="button" className="inspector-check" disabled={provider!=='Supabase'} onClick={submit}>Submit<ArrowUpRight size={15}/></button>
   </div></section>
   <section className="inspector-panel inspector-output"><header><h3>{connected?'OUTPUT':'DATA'}</h3><span>Not connected</span></header>
    <div className="inspector-data-toolbar"><select aria-label="Select data table" disabled><option>Select a table</option></select><button type="button" disabled aria-label="Refresh data" title="Connect a database to refresh data"><RefreshCw size={15}/></button></div>
    <div className="inspector-data-views"><div className="inspector-view-options" aria-label="Data format">{(['schema','table','json'] as const).map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='json'?'JSON':value==='table'?'Table':'Schema'}</button>)}</div></div>
    <div className="inspector-panel-body"><div className="inspector-empty"><EmptyIcon size={27}/><strong>{mode==='schema'?'No schema available':mode==='table'?'No table data':'No JSON data'}</strong><p>Connect a database to view its {mode==='schema'?'table structure':'data'}.</p></div></div>
    <footer className="inspector-data-pagination"><button type="button" disabled>Previous</button><span>No data</span><button type="button" disabled>Next</button></footer>
   </section>
  </div>
 </DialogContent></Dialog>;
}
