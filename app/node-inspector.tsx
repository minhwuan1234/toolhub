'use client';
import { ArrowRight, Bot, CircleDashed } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { iconOptions, type BoardNode } from './node-picker';

export function NodeInspector({ node, incoming, onClose }: { node: BoardNode; incoming: BoardNode[]; onClose: () => void }) {
  const Icon = iconOptions.find(option => option.type === node.icon)?.icon ?? Bot;
  const isAgent = node.type === 'agent';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="node-inspector node-inspector-setup">
      <header className="inspector-heading"><span className="inspector-icon"><Icon size={21}/></span><DialogTitle>{node.name}</DialogTitle></header>
      <DialogDescription className="sr-only">Node details and setup status.</DialogDescription>
      <div className="inspector-setup-body">
        <span className="inspector-setup-icon"><CircleDashed size={28}/></span>
        <span className="inspector-setup-status">{isAgent ? 'Chờ thiết lập Agent' : 'Chưa cấu hình'}</span>
        <p>{isAgent ? 'Agent này đã được thêm vào canvas. Phần cấu hình và chạy Agent sẽ được bổ sung sau.' : 'Node này chưa có cấu hình trong workspace hiện tại.'}</p>
        {incoming.length > 0 && <div className="inspector-setup-inputs"><strong>Đầu vào trên canvas</strong>{incoming.map(source => <span key={source.id}>{source.name}<ArrowRight size={14}/>{node.name}</span>)}</div>}
      </div>
    </DialogContent>
  </Dialog>;
}
