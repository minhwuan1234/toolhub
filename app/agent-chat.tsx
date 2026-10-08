'use client';

import { useEffect, useRef, useState, type SyntheticEvent, type KeyboardEvent } from 'react';
import { ArrowUp, Bot, ChevronDown, Code2, ListChecks, Palette, Sparkles } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { AgentId, AgentResult } from '@/lib/agent-team';
import { handoffContextForAgent, readActiveDesignerHandoffModes, readAgentLinks, readAgentOutputs, readHandoffDeliveries, saveAgentOutput } from '@/lib/agent-handoff';
import type { AgentState } from './department-board';

type ChatMessage = { id: string; kind: 'user' | 'agent' | 'error'; text: string; agentId?: AgentId; name?: string };
type StreamEvent = { type: 'start'; agentId: AgentId } | { type: 'result'; result: AgentResult } | { type: 'error'; message: string } | { type: 'done' };

const labels: Record<AgentId, string> = { ba: 'BA', designer: 'UI/UX', developer: 'Developer' };
type AgentMeta = { id: string; name: string; title: string; outcome: string };
const icons = { ba: ListChecks, designer: Palette, developer: Code2 };

export function AgentChat({ onAgentState, onConfigured, refreshKey }: { onAgentState: (agentId: AgentId, state: AgentState) => void; onConfigured: (configured: boolean) => void; refreshKey: number }) {
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<AgentId>('all');
  const [running, setRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/agent-chat', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { agents?: AgentMeta[]; configured?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load agents.');
        setSetupError('');
        setAgents(data.agents || []);
        setTarget(current => current === 'all' || data.agents?.some(agent => agent.id === current) ? current : 'all');
        setConfigured(Boolean(data.configured));
        onConfigured(Boolean(data.configured));
      })
      .catch(error => { if (!controller.signal.aborted) setSetupError(error instanceof Error ? error.message : 'Unable to load agents.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshKey, onConfigured]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, activeAgent]);

  async function send(event?: SyntheticEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || running || !configured) return;
    const context = messages.slice(-8).map(message => `${message.kind === 'user' ? 'User' : message.name || 'System'}: ${message.text}`).join('\n\n').slice(-12000);
    const links = readAgentLinks();
    const outputs = readAgentOutputs();
    const deliveries = readHandoffDeliveries();
    const modes = readActiveDesignerHandoffModes();
    const handoffs = Object.fromEntries(agents.map(agent => [agent.id, handoffContextForAgent(agent.id, links, outputs, deliveries, modes)]).filter(([, value]) => value));
    setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'user', text }]);
    setInput('');
    setRunning(true);
    setActiveAgent(null);
    let workingAgent: AgentId | null = null;
    try {
      const response = await fetch('/api/agent-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, target, context, handoffs }) });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'Unable to send the request.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let failed = false;
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line) continue;
          const item = JSON.parse(line) as StreamEvent;
          if (item.type === 'start') { workingAgent = item.agentId; setActiveAgent(item.agentId); onAgentState(item.agentId, 'working'); }
          if (item.type === 'result') {
            window.dispatchEvent(new Event('toolhub:agent-api-spend'));
            saveAgentOutput({ agentId: item.result.agentId, runId: crypto.randomUUID(), content: item.result.content, createdAt: new Date().toISOString() });
            setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'agent', agentId: item.result.agentId, name: item.result.name, text: item.result.content }]);
            setActiveAgent(null);
            onAgentState(item.result.agentId, 'complete');
            workingAgent = null;
          }
          if (item.type === 'error') {
            setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'error', text: item.message }]);
            failed = true;
            setActiveAgent(null);
            if (workingAgent) onAgentState(workingAgent, 'error');
          }
        }
        if (done) break;
      }
      if (!failed && buffer.trim()) throw new Error('The server returned an incomplete response.');
    } catch (error) {
      if (workingAgent) onAgentState(workingAgent, 'error');
      setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'error', text: error instanceof Error ? error.message : 'Request failed.' }]);
    } finally {
      window.dispatchEvent(new Event('toolhub:agent-api-spend'));
      setRunning(false);
      setActiveAgent(null);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  }
  const targets = [
    { id: 'all', label: 'Auto', description: 'Send to the full agent team', icon: Sparkles },
    ...agents.map(agent => ({ id: agent.id, label: agent.id.startsWith('custom-') ? agent.name : agent.title, description: agent.outcome, icon: icons[agent.id as keyof typeof icons] || Bot })),
  ];
  const selectedTarget = targets.find(option => option.id === target) || targets[0];
  const SelectedIcon = selectedTarget.icon;
  const agentName = (id: string) => agents.find(agent => agent.id === id)?.name || labels[id] || id;

  return <section className="agent-chat" aria-label="Agent team chat">
    {(messages.length > 0 || activeAgent) && <div className="agent-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
      {messages.map(message => <article key={message.id} className={`agent-message agent-message-${message.kind}`}>
        <div className="agent-message-author">{message.kind === 'user' ? 'You' : message.kind === 'error' ? 'System' : message.name || agentName(message.agentId!)}</div>
        <div className="agent-message-text">{message.text}</div>
      </article>)}
      {activeAgent && <output className="agent-chat-working"><span className="agent-chat-pulse"/>{agentName(activeAgent)} is working…</output>}
      <div ref={end}/>
    </div>}
    <form className="agent-chat-compose" onSubmit={send}>
      <textarea className="agent-chat-input" aria-label="Message to agent team" placeholder="Ask the agent team…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={4000} rows={2} disabled={running || loading} />
      <div className="agent-chat-footer">
        <div className="agent-chat-tools">
          <DropdownMenu>
            <DropdownMenuTrigger type="button" className="agent-target-trigger" aria-label={`Send to ${selectedTarget.label}`} disabled={running || loading}>
              <SelectedIcon size={17}/><span>{selectedTarget.label}</span><ChevronDown size={15}/>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="agent-target-menu" side="top" align="start" sideOffset={12}>
              {targets.map(option => {
                const Icon = option.icon;
                return <DropdownMenuItem key={option.id} className="agent-target-option" data-selected={target === option.id} onClick={() => setTarget(option.id)}>
                  <Icon size={20}/><span><strong>{option.label}</strong><small>{option.description}</small></span>
                </DropdownMenuItem>;
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="agent-chat-status" role={setupError ? 'alert' : undefined} title={!configured && !setupError ? 'Set OPENAI_API_KEY on the server.' : undefined}>{setupError || (!loading && !configured ? 'Model setup needed' : activeAgent ? `${agentName(activeAgent)} is working` : '')}</span>
        </div>
        <button className="agent-chat-send" type="submit" aria-label="Send message" title="Send message" disabled={running || !configured || input.trim().length < 3}><ArrowUp size={20}/></button>
      </div>
    </form>
  </section>;
}
