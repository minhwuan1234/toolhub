'use client';

import { useEffect, useState } from 'react';
import { FileCode2, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type ScanOutput = { repository: string; commit: string; scanned_files: number; source_bytes: number; returned_files: number; truncated: boolean; coverage: string; skipped_files: Array<{ path: string; reason: string }>; skipped_file_count: number; files: Array<{ path: string; bytes: number; lines: number }> };
function schema(value: unknown, path = '$', depth = 0): Array<{ path: string; type: string }> {
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (depth > 4) return [{ path, type }];
  const children = Array.isArray(value) ? value.length ? schema(value[0], `${path}[]`, depth + 1) : [] : value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => schema(child, `${path}.${key}`, depth + 1)) : [];
  return [{ path, type }, ...children];
}
export function RepositoryReaderDialog({ agentId, name, toolId, output, running, error, onChange, onRun, onClose }: {
  agentId: string; name: string; toolId: string; output: string; running: boolean; error: string;
  onChange: (value: { repoToolId?: string }) => void; onRun: () => void; onClose: () => void;
}) {
  const [tools, setTools] = useState<Array<{ id: string; name: string }>>([]);
  const [toolsError, setToolsError] = useState('');
  const [view, setView] = useState<'table' | 'json' | 'schema'>('table');
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
  try { const value = JSON.parse(output) as ScanOutput; if (Array.isArray(value.files)) scan = value; } catch { /* No completed fetch yet. */ }
  const selectedTool = tools.find(tool => tool.id === toolId) || (!toolId && tools.length === 1 ? tools[0] : undefined);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="node-inspector node-inspector-agent repo-reader-dialog">
    <header className="inspector-heading"><FileCode2 size={21}/><DialogTitle>{name}</DialogTitle><span className="repo-reader-algorithm">Code snapshot</span></header>
    <DialogDescription className="sr-only">Repository source files</DialogDescription>
    <div className="repo-reader-panels">
      <div className="agent-card-form repo-reader-settings">
        <div className="agent-card-field"><span>Tool</span><DropdownMenu><DropdownMenuTrigger className="workflow-handoff-select" disabled={running}>{selectedTool?.name || 'Select tool'}</DropdownMenuTrigger><DropdownMenuContent>{tools.map(tool => <DropdownMenuItem key={tool.id} onClick={() => onChange({ repoToolId: tool.id })}>{tool.name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>
        {!tools.length && !toolsError && <span className="repo-reader-empty">No repository tool enabled</span>}
        <button type="button" className="workflow-graph-agent-card repo-reader-run" disabled={running || !selectedTool} onClick={onRun}><Play size={15}/>{running ? 'Loading code…' : 'Run'}</button>
        {(error || toolsError) && <div role="alert" className="workflow-context-error">{error || toolsError}</div>}
      </div>
      <div className="repo-reader-results" aria-busy={running}>
        <div className="repo-reader-result-heading"><strong>Output</strong><output>{running ? 'Loading source files' : scan ? `${scan.scanned_files} files · ${scan.source_bytes.toLocaleString()} bytes` : 'Not run'}</output></div>
        <div className="repo-reader-tabs">{(['table', 'json', 'schema'] as const).map(tab => <button type="button" key={tab} data-active={view === tab} onClick={() => setView(tab)}>{tab === 'json' ? 'JSON' : tab === 'table' ? 'Table' : 'Schema'}</button>)}</div>
        {running ? <div className="repo-reader-empty">Loading code…</div> : !scan ? <div className="repo-reader-empty">No output yet</div> : view === 'json' ? <pre className="repo-reader-json">{JSON.stringify(scan, null, 2)}</pre> : <div className="repo-reader-function-list">
          <div className="repo-reader-snapshot">{scan.repository}<span>{scan.commit.slice(0, 7)}</span></div>
          {scan.truncated && <div className="repo-reader-notice">Showing {scan.returned_files} of {scan.scanned_files} loaded files</div>}
          {scan.coverage === 'partial' && <details className="repo-reader-notice"><summary>Partial snapshot · {scan.skipped_file_count} skipped files</summary>{scan.skipped_files.map(file => <div key={file.path}>{file.path}: {file.reason}</div>)}</details>}
          {view === 'schema' ? <table className="workflow-agent-output-table"><thead><tr><th>Path</th><th>Type</th></tr></thead><tbody>{schema(scan).map(row => <tr key={row.path}><td>{row.path}</td><td>{row.type}</td></tr>)}</tbody></table> : <table className="workflow-agent-output-table"><thead><tr><th>File</th><th>Bytes</th><th>Lines</th></tr></thead><tbody>{scan.files.map(file => <tr key={file.path}><td>{file.path}</td><td>{file.bytes}</td><td>{file.lines}</td></tr>)}</tbody></table>}
          {!scan.files.length && <div className="repo-reader-empty">No source files</div>}
        </div>}
      </div>
    </div>
  </DialogContent></Dialog>;
}
