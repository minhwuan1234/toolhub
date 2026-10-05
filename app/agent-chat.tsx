'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Bot, Send, Trash2 } from 'lucide-react';
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

  return <aside className="agent-chat" aria-label="Agent team chat">
    <header className="agent-chat-header">
      <span className="agent-chat-mark"><Bot size={18}/></span>
      <div><h2>Agent team</h2><p>BA → UI/UX → Developer</p></div>
      <button type="button" className="agent-chat-clear" aria-label="Clear chat" title="Clear chat" disabled={running || messages.length === 0} onClick={() => setMessages([])}><Trash2 size={17}/></button>
    </header>
    <div className="agent-roster" aria-label="Available agents">{agents.map(agent => <span key={agent.id} title={agent.outcome}><i aria-hidden="true"/>{agent.name}</span>)}</div>
    <div className="agent-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
      {loading && <p className="agent-chat-empty">Loading agents…</p>}
      {setupError && <p className="agent-chat-error" role="alert">{setupError}</p>}
      {!loading && !setupError && messages.length === 0 && <div className="agent-chat-welcome"><Bot size={24}/><strong>Give the team a task</strong><p>Send a brief to all three agents, or choose one specialist.</p></div>}
      {messages.map(message => <article key={message.id} className={`agent-message agent-message-${message.kind}`}>
        <div className="agent-message-author">{message.kind === 'user' ? 'You' : message.kind === 'error' ? 'System' : labels[message.agentId!]}</div>
        <div className="agent-message-text">{message.text}</div>
      </article>)}
      {activeAgent && <div className="agent-chat-working" role="status"><span className="agent-chat-pulse"/>{labels[activeAgent]} is working…</div>}
      <div ref={end}/>
    </div>
    <form className="agent-chat-compose" onSubmit={send}>
      {!loading && !configured && !setupError && <p className="agent-chat-setup">Set OPENAI_API_KEY on the server to enable the agents.</p>}
      <label htmlFor="agent-target">Send to</label>
      <select id="agent-target" value={target} disabled={running || loading} onChange={event => setTarget(event.target.value as 'all' | AgentId)}>
        <option value="all">All agents</option>
        {agents.map(agent => <option value={agent.id} key={agent.id}>{agent.title}</option>)}
      </select>
      <div className="agent-chat-input-wrap"><textarea aria-label="Message to agent team" placeholder="Describe the task for your team…" value={input} onChange={event => setInput(event.target.value)} onKeyDown={onKeyDown} maxLength={4000} rows={3} disabled={running || !configured} /><button type="submit" aria-label="Send message" title="Send message" disabled={running || !configured || input.trim().length < 3}><Send size={17}/></button></div>
      <small>Enter to send · Shift+Enter for a new line</small>
    </form>
  </aside>;
}
