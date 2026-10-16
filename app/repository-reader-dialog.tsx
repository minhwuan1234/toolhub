'use client';

import { useEffect, useState } from 'react';
import { FileCode2, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { RepositoryFunction } from '@/lib/repository-functions';

type ScanOutput = { repository: string; commit: string; scanned_files: number; total_functions: number; matched_functions: number; returned_functions: number; truncated: boolean; coverage: string; skipped_files: Array<{ path: string; reason: string }>; skipped_file_count: number; errors: string[]; functions: RepositoryFunction[] };

export function RepositoryReaderDialog({ agentId, name, toolId, query, output, running, error, onChange, onRun, onClose }: {
  agentId: string; name: string; toolId: string; query: string; output: string; running: boolean; error: string;
  onChange: (value: { repoToolId?: string; taskText?: string }) => void; onRun: () => void; onClose: () => void;
}) {
  const [tools, setTools] = useState<Array<{ id: string; name: string }>>([]);
  const [toolsError, setToolsError] = useState('');
  const [view, setView] = useState<'functions' | 'json'>('functions');
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`/api/repository-reader?agentId=${encodeURIComponent(agentId)}`, { signal: abort.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json() as { tools?: Array<{ id: string; name: string }>; error?: string };
      if (!response.ok || !data.tools) throw new Error(data.error || 'Could not load repository tools.');
      setTools(data.tools);
    }).catch(error => { if (!abort.signal.aborted) setToolsError(error instanceof Error ? error.message : 'Could not load tools.'); });
    return () => abort.abort();
  }, [agentId]);
  let scan: ScanOutput | null = null;
  try { const value = JSON.parse(output) as ScanOutput; if (Array.isArray(value.functions)) scan = value; } catch { /* No completed scan yet. */ }
  const selectedTool = tools.find(tool => tool.id === toolId) || (!toolId && tools.length === 1 ? tools[0] : undefined);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="node-inspector node-inspector-agent repo-reader-dialog">
    <header className="inspector-heading"><FileCode2 size={21}/><DialogTitle>{name}</DialogTitle><span className="repo-reader-algorithm">Algorithm</span></header>
    <DialogDescription className="sr-only">Read repository source files and inspect functions.</DialogDescription>
    <div className="repo-reader-panels">
      <div className="agent-card-form repo-reader-settings">
        <div className="agent-card-field"><span>Tool</span><DropdownMenu><DropdownMenuTrigger className="workflow-handoff-select" disabled={running}>{selectedTool?.name || 'Select tool'}</DropdownMenuTrigger><DropdownMenuContent>{tools.map(tool => <DropdownMenuItem key={tool.id} onClick={() => onChange({ repoToolId: tool.id })}>{tool.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>
        {!tools.length && !toolsError && <span className="repo-reader-empty">No repository tool enabled</span>}
        <div className="agent-card-field"><label htmlFor="repo-reader-query">Search functions</label><input id="repo-reader-query" value={query} maxLength={500} disabled={running} onChange={event => onChange({ taskText: event.target.value })}/></div>
        <button type="button" className="workflow-graph-agent-card repo-reader-run" disabled={running || !selectedTool} onClick={onRun}><Play size={15}/>{running ? 'Reading repository…' : 'Run'}</button>
        {(error || toolsError) && <div role="alert" className="workflow-context-error">{error || toolsError}</div>}
      </div>
      <div className="repo-reader-results" aria-busy={running}>
        <div className="repo-reader-result-heading"><strong>Output</strong><output>{running ? 'Reading files · extracting functions' : scan ? `${scan.scanned_files} files · ${scan.total_functions} functions` : 'Not run'}</output></div>
        <div className="repo-reader-tabs"><button type="button" data-active={view === 'functions'} onClick={() => setView('functions')}>Functions</button><button type="button" data-active={view === 'json'} onClick={() => setView('json')}>JSON</button></div>
        {running ? <div className="repo-reader-empty">Reading repository…</div> : !scan ? <div className="repo-reader-empty">No output yet</div> : view === 'json' ? <pre className="repo-reader-json">{JSON.stringify(scan, null, 2)}</pre> : <div className="repo-reader-function-list">
          <div className="repo-reader-snapshot">{scan.repository}<span>{scan.commit.slice(0, 7)}</span></div>
          {scan.truncated && <div className="repo-reader-notice">Showing {scan.returned_functions} of {scan.matched_functions} matches</div>}
          {scan.coverage === 'partial' && <details className="repo-reader-notice"><summary>Partial scan · {scan.skipped_file_count} skipped files</summary>{scan.skipped_files.map(file => <div key={file.path}>{file.path}: {file.reason}</div>)}{scan.errors.map(message => <div key={message}>{message}</div>)}</details>}
          {!scan.functions.length && <div className="repo-reader-empty">No matching functions</div>}
          {scan.functions.map(fn => <details className="repo-reader-function" key={`${fn.path}:${fn.startLine}:${fn.name}`}><summary><strong>{fn.name}</strong><span>{fn.path}:{fn.startLine}–{fn.endLine}</span><small>{fn.kind}</small></summary><pre>{fn.signature}{'\n\n'}{fn.excerpt}</pre></details>)}
        </div>}
      </div>
    </div>
  </DialogContent></Dialog>;
}
