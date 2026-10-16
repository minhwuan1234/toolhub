'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ArrowUp, Workflow, MessageSquare, ChevronDown } from 'lucide-react';
import type { GraphChatEvent } from '@/lib/server/graph-chat';

type Message = { id: string; kind: 'user' | 'agent' | 'error' | 'action'; text: string; nodeId?: string };

export function GraphChat({ agentId, agentName, disabled, onBeforeSend, onBusyChange, onNodeStart, onNodeResult, onOpenNode }: {
  agentId: string; agentName: string; disabled: boolean;
  onBeforeSend: () => Promise<void>; onBusyChange: (busy: boolean) => void;
  onNodeStart: (id: string | null, query?: string) => void; onNodeResult: (id: string, output: string) => void; onOpenNode: (id: string) => void;
}) {
  const [answersVisible, setAnswersVisible] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [configured, setConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [running, setRunning] = useState(false);
  const [activeNode, setActiveNode] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const pending = useRef<AbortController | null>(null);
  const key = `toolhub:graph-chat:${agentId}:v1`;
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(saved)) setMessages(saved.filter((item): item is Message => Boolean(item && typeof item === 'object' && typeof item.id === 'string' && typeof item.text === 'string' && ['user', 'agent', 'error', 'action'].includes(item.kind))).slice(-40));
      } catch { /* Start a new local conversation if storage is unavailable. */ }
    });
    void fetch(`/api/graph-chat?agentId=${encodeURIComponent(agentId)}`, { signal: controller.signal, cache: 'no-store' }).then(async response => {
      const data = await response.json() as { configured?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not load graph chat.');
      setConfigured(Boolean(data.configured));
    }).catch(error => { if (!controller.signal.aborted) setSetupError(error instanceof Error ? error.message : 'Could not load graph chat.'); }).finally(() => { if (!controller.signal.aborted) setLoaded(true); });
    return () => { controller.abort(); pending.current?.abort(); };
  }, [agentId, key]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(key, JSON.stringify(messages.slice(-40))); } catch { /* Chat remains available in this session. */ }
  }, [messages, loaded, key]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, running, activeNode]);

  async function send(event?: SyntheticEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = input.trim();
    if (text.length < 3 || running || disabled || !configured) return;
    const context = messages.filter(item => item.kind === 'user' || item.kind === 'agent').slice(-8).map(item => `${item.kind === 'user' ? 'User' : agentName}: ${item.text}`).join('\n\n').slice(-12000);
    setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'user', text }]);
    setInput(''); setRunning(true); onBusyChange(true);
    const controller = new AbortController();
    pending.current = controller;
    try {
      await onBeforeSend();
      const response = await fetch('/api/graph-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentId, message: text, context }), signal: controller.signal });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'Graph request failed.');
      }
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = '', completed = false;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const item = JSON.parse(line) as GraphChatEvent;
          if (item.type === 'node_start') { setActiveNode(item.name); onNodeStart(item.nodeId, item.query); }
          if (item.type === 'node_result') {
            onNodeResult(item.nodeId, item.output); setActiveNode(''); onNodeStart(null);
            setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'action', text: item.name, nodeId: item.nodeId }]);
            window.dispatchEvent(new Event('toolhub:graph-output'));
          }
          if (item.type === 'reply') setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'agent', text: item.text }]);
          if (item.type === 'error') setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'error', text: item.message }]);
          if (item.type === 'done') completed = true;
        }
        if (done) break;
      }
      if (!completed || buffer.trim()) throw new Error('The graph returned an incomplete response.');
    } catch (error) {
      if (!controller.signal.aborted) setMessages(current => [...current, { id: crypto.randomUUID(), kind: 'error', text: error instanceof Error ? error.message : 'Graph request failed.' }]);
    } finally {
      pending.current = null; setRunning(false); setActiveNode(''); onBusyChange(false); onNodeStart(null);
      window.dispatchEvent(new Event('toolhub:agent-api-spend'));
    }
  }

  return <section className="agent-chat graph-local-chat" aria-label={`${agentName} graph chat`}>
    {answersVisible && (messages.length > 0 || running) && <div className="agent-chat-messages" role="log" aria-live="polite" aria-relevant="additions text" id="graph-chat-answers">
      {messages.map(message => message.kind === 'action' ? <button type="button" key={message.id} className="graph-chat-node-result" onClick={() => { if (message.nodeId) onOpenNode(message.nodeId); }}><Workflow size={15}/>{message.text}</button> : <article key={message.id} className={`agent-message agent-message-${message.kind}`}><div className="agent-message-author">{message.kind === 'user' ? 'You' : message.kind === 'error' ? 'System' : agentName}</div><div className="agent-message-text">{message.text}</div></article>)}
      {running && <output className="agent-chat-working"><span className="agent-chat-pulse"/>{activeNode || agentName} is working…</output>}
      <div ref={end}/>
    </div>}
    <form className="agent-chat-compose" onSubmit={send}>
      <textarea className="agent-chat-input" aria-label="Message to this graph" placeholder={`Ask ${agentName}…`} value={input} maxLength={4000} rows={2} disabled={running || disabled || !loaded} onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/>
      <div className="agent-chat-footer"><div className="agent-chat-tools"><span className="agent-target-trigger"><Workflow size={17}/><span>Graph</span></span><button type="button" className="agent-target-trigger graph-chat-toggle" aria-label={answersVisible ? 'Hide replies' : 'Show replies'} title={answersVisible ? 'Hide replies' : 'Show replies'} aria-expanded={answersVisible} aria-controls="graph-chat-answers" onClick={() => setAnswersVisible(value => !value)}>{answersVisible ? <ChevronDown size={17}/> : <MessageSquare size={17}/>}</button><span className="agent-chat-status" role={setupError ? 'alert' : undefined}>{setupError || (loaded && !configured ? 'Model setup needed' : activeNode)}</span></div><button className="agent-chat-send" type="submit" aria-label="Send message" title="Send message" disabled={running || disabled || !configured || input.trim().length < 3}><ArrowUp size={20}/></button></div>
    </form>
  </section>;
}
