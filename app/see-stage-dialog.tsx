'use client';
import { useState } from 'react';
import { Code, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { SeeOutput } from '@/lib/see-contract';

function schema(value: unknown, path = '$', depth = 0): Array<{ path: string; type: string }> {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (depth > 4) return [{ path, type }];
  const children = Array.isArray(value) ? value.length ? schema(value[0], `${path}[]`, depth + 1) : [] : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => schema(child, `${path}.${key}`, depth + 1)) : [];
  return [{ path, type }, ...children];
}
const cell = (value: unknown) => typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value);
export function SeeStageDialog({ name, output, running, error, onRun, onClose }: { name: string; output: string; running: boolean; error: string; onRun: () => void; onClose: () => void }) {
  const [view, setView] = useState<'table' | 'json' | 'schema'>('table');
  let data: SeeOutput | null = null;
  try { const parsed = JSON.parse(output) as SeeOutput; if (Array.isArray(parsed.items)) data = parsed; } catch { /* No stage output yet. */ }
  const columns = [...new Set(data?.items.flatMap(item => Object.keys(item)) || [])];
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="node-inspector node-inspector-agent repo-reader-dialog">
    <header className="inspector-heading"><Code size={21}/><DialogTitle>{name}</DialogTitle><span className="repo-reader-algorithm">Algorithm</span></header>
    <DialogDescription className="sr-only">Repository analysis output</DialogDescription>
    {data && <div className="repo-reader-snapshot"><span>{data.repository} · {data.commit.slice(0, 7)}</span><span>{data.items.length} / {data.total_items} items · {data.model_calls} model calls</span></div>}
    <div className="repo-reader-tabs">{(['table', 'json', 'schema'] as const).map(tab => <button type="button" data-active={view === tab} key={tab} onClick={() => setView(tab)}>{tab === 'json' ? 'JSON' : tab === 'table' ? 'Table' : 'Schema'}</button>)}</div>
    <div className="think-content" aria-busy={running}>
      {error && <div className="workflow-context-error" role="alert">{error}</div>}
      {running ? <div className="repo-reader-empty">Running…</div> : !data ? <div className="repo-reader-empty">No output yet</div> : view === 'json' ? <pre className="repo-reader-json">{JSON.stringify(data, null, 2)}</pre> : view === 'schema' ? <table className="workflow-agent-output-table"><thead><tr><th>Path</th><th>Type</th></tr></thead><tbody>{schema(data).map(row => <tr key={row.path}><td>{row.path}</td><td>{row.type}</td></tr>)}</tbody></table> : <>
        {data.counts && <div className="repo-reader-notice">{Object.entries(data.counts).map(([key, count]) => `${key}: ${count}`).join(' · ')}</div>}
        {(data.truncated || data.coverage === 'partial') && <div className="repo-reader-notice">Partial analysis</div>}
        {!data.items.length && <div className="repo-reader-empty">No items found</div>}
        <table className="workflow-agent-output-table see-output-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.items.map((item, index) => <tr key={index}>{columns.map(column => <td key={column}>{cell((item as unknown as Record<string, unknown>)[column])}</td>)}</tr>)}</tbody></table>
        {!!data.unresolved?.length && <details className="repo-reader-notice"><summary>Unresolved · {data.unresolved.length}</summary>{data.unresolved.map(item => <div key={item}>{item}</div>)}</details>}
      </>}
    </div>
    <footer className="think-footer"><button type="button" className="workflow-graph-agent-card" disabled={running} onClick={onRun}><Play size={15}/>{running ? 'Running…' : 'Run'}</button></footer>
  </DialogContent></Dialog>;
}
