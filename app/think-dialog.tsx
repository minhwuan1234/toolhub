'use client';
import { useState } from 'react';
import { Brain, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { thinkQuestions, type ThinkOutput } from '@/lib/think-contract';

function schemaRows(value: unknown, path = '$'): Array<{ path: string; type: string }> {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const children = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).flatMap(([key, item]) => schemaRows(item, `${path}.${key}`)) : [];
  return [{ path, type }, ...children];
}

export function ThinkDialog({ name, output, running, error, onRun, onClose }: { name: string; output: string; running: boolean; error: string; onRun: () => void; onClose: () => void }) {
  const [view, setView] = useState<'table' | 'json' | 'schema'>('table');
  let plan: ThinkOutput | null = null;
  try { const value = JSON.parse(output) as ThinkOutput; if (value.kind === 'think' && value.answers) plan = value; } catch { /* No plan yet. */ }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="node-inspector node-inspector-agent repo-reader-dialog think-dialog">
    <header className="inspector-heading"><Brain size={21}/><DialogTitle>{name}</DialogTitle><span className="repo-reader-algorithm">5W + 1H</span></header>
    <DialogDescription className="sr-only">Feature update plan</DialogDescription>
    {plan && <div className="repo-reader-snapshot"><span>{plan.request}</span><span>{plan.repository} · {plan.commit.slice(0, 7)}</span></div>}
    <div className="repo-reader-tabs" role="tablist" aria-label="Output view">{(['table', 'json', 'schema'] as const).map(tab => <button type="button" role="tab" key={tab} id={`think-tab-${tab}`} aria-controls="think-output-panel" aria-selected={view === tab} data-active={view === tab} onClick={() => setView(tab)}>{tab === 'json' ? 'JSON' : tab === 'table' ? 'Table' : 'Schema'}</button>)}</div>
    <div className="think-content" id="think-output-panel" role="tabpanel" aria-labelledby={`think-tab-${view}`} aria-busy={running}>
      {error && <div role="alert" className="workflow-context-error">{error}</div>}
      {running ? <div className="repo-reader-empty">Thinking…</div> : view === 'table' ? <table className="workflow-agent-output-table think-output-table"><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>{thinkQuestions.map(item => <tr key={item.key}><td><strong>{item.label}</strong><p>{item.question}</p></td><td>{plan?.answers[item.key] || '—'}</td></tr>)}</tbody></table> : !plan ? <div className="repo-reader-empty">No output yet</div> : view === 'json' ? <pre className="repo-reader-json">{JSON.stringify(plan, null, 2)}</pre> : <table className="workflow-agent-output-table"><thead><tr><th>Path</th><th>Type</th></tr></thead><tbody>{schemaRows(plan).map(row => <tr key={row.path}><td>{row.path}</td><td>{row.type}</td></tr>)}</tbody></table>}
    </div>
    <footer className="think-footer"><button type="button" className="workflow-graph-agent-card" disabled={running} onClick={onRun}><Play size={15}/>{running ? 'Thinking…' : 'Run'}</button></footer>
  </DialogContent></Dialog>;
}
