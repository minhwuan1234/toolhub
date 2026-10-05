'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import type { AgentId, AgentResult } from '@/lib/agent-team';
import type { AgentState } from './department-board';

type AgentMeta = { id: AgentId; name: string; title: string; outcome: string };
type ChatMessage = { id: string; kind: 'user' | 'agent' | 'error'; text: string; agentId?: AgentId; name?: string };
type StreamEvent = { type: 'start'; agentId: AgentId } | { type: 'result'; result: AgentResult } | { type: 'error'; message: string } | { type: 'done' };

const labels: Record<AgentId, string> = { ba: 'BA', designer: 'UI/UX', developer: 'Developer' };

export function AgentChat({ onAgentState, onConfigured }: { onAgentState: (agentId: AgentId, state: AgentState) => void; onConfigured: (configured: boolean) => void }) {
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<'all' | AgentId>('all');
  const [running, setRunning] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentId | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/agent-chat', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { agents?: AgentMeta[]; configured?: boolean; error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load agents.');
        setAgents(data.agents || []);
        setConfigured(Boolean(data.configured));
        onConfigured(Boolean(data.configured));
      })
      .catch(error => { if (!controller.signal.aborted) setSetupError(error instanceof Error ? error.message : 'Unable to load agents.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, activeAgent]);

  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || running || !configured) return;
    const context = messages.slice(-8).map(message => `${message.kind === 'user' ? 'User' : message.name || 'System'}: ${message.text}`).join('\n\n').slice(-12000);
    setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'user', text }]);
    setInput('');
    setRunning(true);
    setActiveAgent(null);
    let workingAgent: AgentId | null = null;
    try {
      const response = await fetch('/api/agent-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, target, context }) });
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
      setRunning(false);
      setActiveAgent(null);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  }

  return <section className="agent-chat" aria-label="Agent team chat">
    {(messages.length > 0 || activeAgent) && <div className="agent-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
      {messages.map(message => <article key={message.id} className={`agent-message agent-message-${message.kind}`}>
        <div className="agent-message-author">{message.kind === 'user' ? 'You' : message.kind === 'error' ? 'System' : labels[message.agentId!]}</div>
        <div className="agent-message-text">{message.text}</div>
      </article>)}
      {activeAgent && <div className="agent-chat-working" role="status"><span className="agent-chat-pulse"/>{labels[activeAgent]} is working…</div>}
      <div ref={end}/>
    </div>}
    <form className="agent-chat-compose" onSubmit={send}>
      <div className="agent-chat-input-wrap"><textarea aria-label="Message to agent team" placeholder="Ask the agent team…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={4000} rows={2} disabled={running || loading} /><button type="submit" aria-label="Send message" title="Send message" disabled={running || !configured || input.trim().length < 3}><Send size={18}/></button></div>
      <div className="agent-chat-footer">
        <span className="agent-chat-status" role={setupError ? 'alert' : undefined} title={!configured && !setupError ? 'Set OPENAI_API_KEY on the server.' : undefined}>{setupError || (!loading && !configured ? 'Model setup needed' : activeAgent ? `${labels[activeAgent]} is working` : '')}</span>
        <label className="sr-only" htmlFor="agent-target">Send to</label>
        <select id="agent-target" aria-label="Send to" value={target} disabled={running || loading} onChange={event => setTarget(event.target.value as 'all' | AgentId)}>
          <option value="all">Auto · all agents</option>
          {agents.map(agent => <option value={agent.id} key={agent.id}>{agent.title}</option>)}
        </select>
      </div>
    </form>
  </section>;
}
