'use client';
import { ArrowRight, Bot, CircleDashed } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { iconOptions, type BoardNode } from './node-picker';
import type { AgentState } from './department-board';

export function NodeInspector({ node, incoming, configured, agentState, onClose }: { node: BoardNode; incoming: BoardNode[]; configured: boolean; agentState?: AgentState; onClose: () => void }) {
  const Icon = iconOptions.find(option => option.type === node.icon)?.icon ?? Bot;
  const isAgent = node.type === 'agent';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="node-inspector node-inspector-setup">
      <header className="inspector-heading"><span className="inspector-icon"><Icon size={21}/></span><DialogTitle>{node.name}</DialogTitle></header>
      <DialogDescription className="sr-only">Node details and setup status.</DialogDescription>
      <div className="inspector-setup-body">
        <span className="inspector-setup-icon"><CircleDashed size={28}/></span>
        <span className="inspector-setup-status">{node.agentId ? configured ? `${agentState || 'ready'} · MCP managed` : 'Model setup needed' : isAgent ? 'Agent setup needed' : 'Not configured'}</span>
        <p>{node.agentId ? 'Use the Agent team chat to send commands. This agent is managed by the central MCP server.' : isAgent ? 'This canvas node has no assigned role yet. Use the Agent team chat to command BA, UI/UX, and Developer.' : 'This node has no configuration in the current workspace.'}</p>
        {incoming.length > 0 && <div className="inspector-setup-inputs"><strong>Canvas inputs</strong>{incoming.map(source => <span key={source.id}>{source.name}<ArrowRight size={14}/>{node.name}</span>)}</div>}
      </div>
    </DialogContent>
  </Dialog>;
}
