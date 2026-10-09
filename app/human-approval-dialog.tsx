'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { graphPreviewDocument } from '@/lib/graph-preview';
import { deliverApprovedDesignerHandoff } from '@/lib/agent-handoff';

type Approval = { id: string; source_name: string; output: string };
type View = 'preview' | 'html' | 'css' | 'js' | 'json';

function outputFiles(value: string): { html: string; css: string; js: string } | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const files = parsed as Record<string, unknown>;
      if (typeof files.html === 'string' && typeof files.css === 'string' && typeof files.js === 'string') return { html: files.html, css: files.css, js: files.js };
    }
  } catch { /* Other structured outputs remain readable as JSON. */ }
  return null;
}

export function HumanApprovalDialog() {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [view, setView] = useState<View>('preview');
  const [denying, setDenying] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (busy || document.visibilityState === 'hidden') return;
    try {
      const response = await fetch('/api/designer-graph/approvals', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { approval?: Approval | null };
      setApproval(current => current?.id === data.approval?.id ? current : data.approval || null);
    } catch { /* Retry while the workspace remains open. */ }
  }, [busy]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    window.addEventListener('toolhub:graph-output', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener('toolhub:graph-output', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [refresh]);

  async function decide(decision: 'approved' | 'denied') {
    if (!approval || busy) return;
    if (decision === 'denied' && !denying) { setDenying(true); setError(''); return; }
    if (decision === 'denied' && !feedback.trim()) { setError('Enter feedback for the agent.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/designer-graph/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: approval.id, decision, feedback: decision === 'denied' ? feedback.trim() : '' }) });
      const data = await response.json() as { error?: string; errors?: string[]; handoffs?: string[]; handoffOutput?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to save your decision.');
      if (decision === 'approved' && data.handoffOutput) for (const nodeId of data.handoffs || []) deliverApprovedDesignerHandoff(nodeId, approval.id, data.handoffOutput);
      setApproval(null); setDenying(false); setFeedback(''); setView('preview');
      setNotice(data.errors?.length ? data.errors.join(' ') : '');
      void refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save your decision.'); }
    finally { setBusy(false); }
  }

  const files = approval ? outputFiles(approval.output) : null;
  const selectedView = files ? view : 'json';
  const code = selectedView === 'json' ? approval?.output : selectedView === 'preview' ? '' : files?.[selectedView];
  return <>{notice && !approval && <div className="human-approval-notice" role="alert">{notice}<button type="button" onClick={() => setNotice('')}>Dismiss</button></div>}<Dialog open={Boolean(approval)} onOpenChange={() => {}}>
    <DialogContent showCloseButton={false} className="node-inspector node-inspector-setup node-inspector-agent human-approval-dialog">
      <header className="inspector-heading"><span className="inspector-icon"><CircleCheck size={21}/></span><DialogTitle>Human Approval</DialogTitle></header>
      <DialogDescription className="sr-only">Review the previous node output and approve or deny it.</DialogDescription>
      <div className="human-approval-content">
        <div className="human-approval-source">Output from <strong>{approval?.source_name}</strong></div>
        {files && <fieldset className="workflow-agent-output-tabs"><legend className="sr-only">Output file</legend>{(['preview', 'html', 'css', 'js', 'json'] as const).map(item => <button type="button" key={item} aria-pressed={selectedView === item} onClick={() => setView(item)}>{item === 'preview' ? 'Preview' : item === 'json' ? 'JSON' : `${item === 'html' ? 'index' : item === 'css' ? 'styles' : 'script'}.${item}`}</button>)}</fieldset>}
        <div className="human-approval-output">{selectedView === 'preview' && files ? <iframe title="Output preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={graphPreviewDocument(files)}/> : <pre>{code}</pre>}</div>
      </div>
      <div className="human-approval-footer">
        {denying && <label className="agent-card-field" htmlFor="human-approval-feedback"><span>Feedback for the agent</span><textarea id="human-approval-feedback" value={feedback} maxLength={4000} onChange={event => { setFeedback(event.target.value); setError(''); }}/></label>}
        {error && <p role="alert" className="workflow-task-error">{error}</p>}
        <div className="human-approval-actions">{denying && <button type="button" disabled={busy} onClick={() => { setDenying(false); setFeedback(''); setError(''); }}>Cancel</button>}<button type="button" disabled={busy} onClick={() => void decide('denied')}>{denying ? 'Submit denial' : 'Deny'}</button><button type="button" disabled={busy} onClick={() => void decide('approved')}>{busy ? 'Saving…' : 'Approve'}</button></div>
      </div>
    </DialogContent>
  </Dialog></>;
}
