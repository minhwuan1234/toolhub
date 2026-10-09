import type { DesignerGraphDocument } from './server/designer-graph';

export function asksToRunDesignerGraph(message: string): boolean {
  const text = message.trim().toLocaleLowerCase();
  return /\b(?:run|design)\b|chạy|thiết kế/.test(text)
    && /ui\s*\/\s*ux|ui\s*ux|designer|giao diện/.test(text)
    && /test document|tài liệu ba|ba document|agent handoff/.test(text);
}

export function designerGraphNodeForTestDocument(graph: DesignerGraphDocument): string {
  const handoffIds = new Set(graph.nodes.filter(node => node.kind === 'agent-handoff' && node.active !== false && node.handoffMode === 'receive' && node.useTestDocument && node.testDocument?.trim()).map(node => node.id));
  const workflowIds = new Set(graph.links.filter(link => link.command === 'input' && handoffIds.has(link.source)).map(link => link.target));
  const candidates = graph.nodes.filter(node => node.kind === 'agent' && node.active !== false && graph.links.some(link => link.command === 'input' && link.target === node.id && (handoffIds.has(link.source) || workflowIds.has(link.source))));
  if (!candidates.length) throw new Error('Connect an active AI Agent node to a Receive handoff with a Test document.');
  if (candidates.length > 1) throw new Error('More than one AI Agent receives the Test document. Run a specific node from the graph.');
  return candidates[0].id;
}
