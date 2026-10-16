'use client';
import { Brain, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { thinkQuestions, type ThinkOutput } from '@/lib/think-contract';

export function ThinkDialog({ name, output, running, error, onRun, onClose }: { name: string; output: string; running: boolean; error: string; onRun: () => void; onClose: () => void }) {
  let plan: ThinkOutput | null = null;
  try { const value = JSON.parse(output) as ThinkOutput; if (value.kind === 'think' && value.answers) plan = value; } catch { /* No plan yet. */ }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="node-inspector node-inspector-agent repo-reader-dialog think-dialog">
    <header className="inspector-heading"><Brain size={21}/><DialogTitle>{name}</DialogTitle><span className="repo-reader-algorithm">5W + 1H</span></header>
    <DialogDescription className="sr-only">Feature update plan</DialogDescription>
    <div className="think-content" aria-busy={running}>
      {plan && <div className="repo-reader-snapshot"><span>{plan.request}</span><span>{plan.repository} · {plan.commit.slice(0, 7)}</span></div>}
      {error && <div role="alert" className="workflow-context-error">{error}</div>}
      {thinkQuestions.map(item => <section className="think-question" key={item.key}><h3>{item.label}</h3><p>{item.question}</p><div className="think-answer">{running ? 'Thinking…' : plan?.answers[item.key] || '—'}</div></section>)}
    </div>
    <footer className="think-footer"><button type="button" className="workflow-graph-agent-card" disabled={running} onClick={onRun}><Play size={15}/>{running ? 'Thinking…' : 'Run'}</button></footer>
  </DialogContent></Dialog>;
}
