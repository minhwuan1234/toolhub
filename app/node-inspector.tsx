'use client';
import {useState} from 'react';
import {ArrowLeft,ArrowRight,Database,ShieldCheck,Check,Braces,Table2,ListTree} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogClose} from '@/components/ui/dialog';
import {iconOptions,type BoardNode} from './node-picker';
export type ConnectionDraft={url:string;tables:string};
export function NodeInspector({node,incoming,connected,draft,onDraft,onClose}:{node:BoardNode;connected:boolean;incoming:BoardNode[];draft:ConnectionDraft;onDraft:(draft:ConnectionDraft)=>void;onClose:()=>void}){
 const [key,setKey]=useState('');
 const [error,setError]=useState('');
 const [checked,setChecked]=useState(false);
 const [mode,setMode]=useState<'schema'|'table'|'json'>('schema');
 const Icon=iconOptions.find(option=>option.type===node.icon)!.icon;
 const tables=draft.tables.split(',').map(value=>value.trim()).filter(Boolean);
 function check(){
  setChecked(false);
  try{const url=new URL(draft.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw new Error();}catch{setError('Enter a Supabase Project URL, such as https://your-project.supabase.co.');return;}
  if(!key.trim()){setError('Enter a placeholder key to check this form.');return;}
  if(!tables.length||tables.some(table=>!/^([a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*$/i.test(table))){setError('Enter table names separated by commas, for example public.outreach_jobs.');return;}
  setError('');setChecked(true);
 }
 const preview={provider:'supabase',project_url:draft.url,tables,access:'read_only',connection_tested:false};
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={`node-inspector ${connected?'has-connections':'standalone-node'}`}>
  <header className="inspector-heading"><span className="inspector-icon"><Icon size={21}/></span><DialogTitle>{node.name}</DialogTitle><span className="inspector-ui-badge">Connection setup</span></header>
  <DialogDescription className="sr-only">Review inputs, configure your connection and inspect its configuration. No external requests are made.</DialogDescription>
  <div className="inspector-panels">
   {connected&&<section className="inspector-panel inspector-input"><header><h3>INPUT</h3><span>{incoming.length} sources</span></header><div className="inspector-panel-body">
    {incoming.length?incoming.map(source=>{const SourceIcon=iconOptions.find(option=>option.type===source.icon)!.icon;return <div className="inspector-source" key={source.id}><SourceIcon size={17}/><span>{source.name}</span><ArrowRight size={14}/></div>;}):<div className="inspector-empty"><ArrowRight size={25}/><strong>No connected inputs</strong><p>Connect another node to this node to see its source here.</p></div>}
    {incoming.length>0&&<p className="inspector-muted">Sources are connected on the canvas. No input data has been loaded.</p>}
   </div></section>}
   <section className="inspector-panel inspector-parameters"><header><h3>Connection</h3><span className="inspector-readonly"><ShieldCheck size={12}/>Read only</span></header><div className="inspector-panel-body">
    <div className="inspector-provider"><Database size={18}/><span>Supabase</span></div>
    <label className="inspector-field">Project URL<input type="url" placeholder="https://your-project.supabase.co" value={draft.url} maxLength={250} onChange={event=>{onDraft({...draft,url:event.target.value});setChecked(false);setError('');}}/></label>
    <label className="inspector-field">API key<input type="password" autoComplete="off" placeholder="Placeholder key" value={key} maxLength={1000} onChange={event=>{setKey(event.target.value);setChecked(false);setError('');}}/><small>UI preview only. Use a placeholder, not a real key.</small></label>
    <label className="inspector-field">Schema / Tables<textarea placeholder="public.outreach_jobs, public.outreach_job_targets" value={draft.tables} maxLength={2000} rows={4} onChange={event=>{onDraft({...draft,tables:event.target.value});setChecked(false);setError('');}}/><small>Separate table names with commas.</small></label>
    {error&&<p className="inspector-error" role="alert">{error}</p>}
    <button type="button" className="inspector-check" onClick={check}><Check size={15}/>Check fields</button>
    <p className="inspector-muted">Checks the form format only. Supabase access and approval are not connected yet.</p>
   </div><footer><DialogClose className="inspector-back"><ArrowLeft size={14}/>Back to canvas</DialogClose><button type="button" disabled title="Available when connection approval is implemented">Submit for approval</button></footer></section>
   <section className="inspector-panel inspector-output"><header><h3>{connected?'OUTPUT':'DATA'}</h3><div className="inspector-view-options" aria-label="Preview format">{(['schema','table','json'] as const).map(value=><button type="button" key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value==='json'?'JSON':value==='table'?'Table':'Schema'}</button>)}</div></header><div className="inspector-panel-body">
    {!checked?<div className="inspector-empty"><Braces size={27}/><strong>No preview yet</strong><p>Fill in the connection details and check the fields.</p></div>:<><div className="inspector-preview-status"><Check size={14}/>Form format valid</div><p className="inspector-muted">Configuration preview — not database output.</p>{mode==='json'?<pre>{JSON.stringify(preview,null,2)}</pre>:mode==='table'?<table className="inspector-preview-table"><thead><tr><th>Table</th><th>Access</th></tr></thead><tbody>{tables.map((table,index)=><tr key={`${table}-${index}`}><td>{table}</td><td>Read only</td></tr>)}</tbody></table>:<div className="inspector-schema"><div><ListTree size={16}/>Supabase</div>{tables.map((table,index)=><div key={`${table}-${index}`}><Table2 size={14}/><span>{table}</span></div>)}<p>Column definitions will appear after a real connection test.</p></div>}</>}
   </div></section>
  </div>
 </DialogContent></Dialog>;
}
