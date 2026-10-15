'use client';
import { useEffect, useState, type SyntheticEvent } from 'react';
import { ArrowRight, Bot, CircleDashed } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { AgentCard } from '@/lib/agent-cards';
import type { toolCatalog } from '@/lib/tool-catalog';
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

type ToolInfo = typeof toolCatalog[number];

export function NodeInspector({ node, incoming, configured, agentState, canManageAgents, onSaved, onClose }: { node: BoardNode; incoming: BoardNode[]; configured: boolean; agentState?: AgentState; canManageAgents: boolean; onSaved: (card: AgentCard) => void; onClose: () => void }) {
  const Icon = iconOptions.find(option => option.type === node.icon)?.icon ?? Bot;
  const isAgent = node.type === 'agent';
  const active = isAgent && !!node.agentId && configured && agentState !== 'error';
  const agentStatus = node.agentId ? configured ? `${agentState || 'ready'} · MCP managed` : 'Model setup needed' : 'Agent setup needed';
  const [draft, setDraft] = useState<AgentCard>(node.card ?? { id: node.id, name: node.name, role: '', mission: '', responsibilities: '', inputs: '', outputs: '', collaboration: '', useDesignGuidelines: false, toolIds: [], x: node.x, y: node.y });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toolCatalogItems, setToolCatalogItems] = useState<readonly ToolInfo[]>([]);
  const [importedTools, setImportedTools] = useState<string[]>([]);
  useEffect(() => {
    if (!isAgent) return;
    const controller = new AbortController();
    fetch('/api/tools', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to load tools.');
      const data = await response.json() as { catalog: ToolInfo[]; imported: ToolInfo[] };
      setToolCatalogItems(data.catalog);
      setImportedTools(data.imported.map(tool => tool.id));
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load tools.'); });
    return () => controller.abort();
  }, [isAgent]);

  async function importSelectedTool(id: string) {
    if (!canManageAgents || saving) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/tools', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId: id }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to import tool.');
      setImportedTools(current => [...new Set([...current, id])]);
      setDraft(current => ({ ...current, toolIds: [...new Set([...current.toolIds, id])] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to import tool.'); }
    finally { setSaving(false); }
  }

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
        <div className="agent-tool-access"><strong>Tools</strong>
          {toolCatalogItems.map(tool => <div key={tool.id} className="agent-tool-row">
            <span className="agent-tool-tag" data-selected={draft.toolIds.includes(tool.id)}>{tool.tag}</span>
            {importedTools.includes(tool.id)
              ? <button type="button" className="agent-tool-toggle" aria-pressed={draft.toolIds.includes(tool.id)} disabled={!canManageAgents || saving} onClick={() => setDraft(current => ({ ...current, toolIds: current.toolIds.includes(tool.id) ? current.toolIds.filter(id => id !== tool.id) : [...current.toolIds, tool.id] }))}>{draft.toolIds.includes(tool.id) ? 'Enabled' : 'Enable'}</button>
              : <button type="button" className="agent-tool-toggle" disabled={!canManageAgents || saving} onClick={() => void importSelectedTool(tool.id)}>Import</button>}
          </div>)}
        </div>
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
