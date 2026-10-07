'use client';
import { useState, type SyntheticEvent } from 'react';
import { ArrowRight, Bot, CircleDashed } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AgentCard } from '@/lib/agent-cards';
import { iconOptions, type BoardNode } from './node-picker';
import type { AgentState } from './department-board';

const fields = [
  { key: 'name', label: 'Agent name', hint: 'Name shown on the canvas and in chat', max: 80 },
  { key: 'role', label: 'Role', hint: 'For example, Business Analyst', max: 80 },
  { key: 'mission', label: 'Mission', hint: 'The main outcome this agent is responsible for', max: 1000 },
  { key: 'responsibilities', label: 'Responsibilities', hint: 'What this agent should do', max: 2000 },
  { key: 'inputs', label: 'Inputs', hint: 'Information this agent needs', max: 1000 },
  { key: 'outputs', label: 'Outputs', hint: 'What it should hand off', max: 1000 },
  { key: 'collaboration', label: 'Collaboration', hint: 'How it works with other agents', max: 1000 },
] as const;

export function NodeInspector({ node, incoming, configured, agentState, canManageAgents, onSaved, onClose }: { node: BoardNode; incoming: BoardNode[]; configured: boolean; agentState?: AgentState; canManageAgents: boolean; onSaved: (card: AgentCard) => void; onClose: () => void }) {
  const Icon = iconOptions.find(option => option.type === node.icon)?.icon ?? Bot;
  const isAgent = node.type === 'agent';
  const active = isAgent && !!node.agentId && configured && agentState !== 'error';
  const agentStatus = node.agentId ? configured ? `${agentState || 'ready'} · MCP managed` : 'Model setup needed' : 'Agent setup needed';
  const [draft, setDraft] = useState<AgentCard>(node.card ?? { id: node.id, name: node.name, role: '', mission: '', responsibilities: '', inputs: '', outputs: '', collaboration: '', useDesignGuidelines: false, x: node.x, y: node.y });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !canManageAgents) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/agent-cards', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, x: node.x, y: node.y }) });
      const data = await response.json() as { card?: AgentCard; error?: string };
      if (!response.ok || !data.card) throw new Error(data.error || 'Unable to save agent card.');
      onSaved(data.card);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to save agent card.'); }
    finally { setSaving(false); }
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className={`node-inspector node-inspector-setup${isAgent ? ' node-inspector-agent' : ''}`}>
      <header className="inspector-heading"><span className="inspector-icon"><Icon size={21}/></span><DialogTitle>{isAgent ? 'Agent card' : node.name}</DialogTitle>{isAgent && <span className="agent-card-status" data-active={active}><i aria-hidden="true"/>{agentStatus}</span>}</header>
      <DialogDescription className="sr-only">{isAgent ? 'Describe this agent so MCP can assign tasks to it.' : 'Node details and setup status.'}</DialogDescription>
      {isAgent ? <form className="agent-card-form" onSubmit={save}>
        {fields.map(field => <label key={field.key} className="agent-card-field">
          <span>{field.label}</span>
          {field.key === 'name' || field.key === 'role' ? <input required maxLength={field.max} disabled={!canManageAgents || saving} value={draft[field.key]} placeholder={field.hint} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))}/> : <textarea required maxLength={field.max} disabled={!canManageAgents || saving} value={draft[field.key]} placeholder={field.hint} rows={field.key === 'responsibilities' ? 3 : 2} onChange={event => setDraft(current => ({ ...current, [field.key]: event.target.value }))}/>}
        </label>)}
        <label className="agent-card-design"><input type="checkbox" checked={draft.useDesignGuidelines} disabled={!canManageAgents || saving} onChange={event => setDraft(current => ({ ...current, useDesignGuidelines: event.target.checked }))}/><span>Use current Toolhub DESIGN.md guidance</span></label>
        {incoming.length > 0 && <div className="inspector-setup-inputs"><strong>Canvas inputs</strong>{incoming.map(source => <span key={source.id}>{source.name}<ArrowRight size={14}/>{node.name}</span>)}</div>}
        {error && <p className="agent-card-error" role="alert">{error}</p>}
        {canManageAgents ? <button className="agent-card-save" type="submit" disabled={saving}>{saving ? 'Saving…' : node.agentId ? 'Save agent card' : 'Save and activate agent'}</button> : <p className="agent-card-readonly">Admin access is required to edit agent cards.</p>}
      </form> : <div className="inspector-setup-body">
        <span className="inspector-setup-icon"><CircleDashed size={28}/></span>
        <span className="inspector-setup-status">Not configured</span>
        <p>This node has no configuration in the current workspace.</p>
        {incoming.length > 0 && <div className="inspector-setup-inputs"><strong>Canvas inputs</strong>{incoming.map(source => <span key={source.id}>{source.name}<ArrowRight size={14}/>{node.name}</span>)}</div>}
      </div>}
    </DialogContent>
  </Dialog>;
}
