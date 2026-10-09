export type AgentLink = { source: string; target: string };
export type AgentOutputSnapshot = { agentId: string; runId: string; content: string; createdAt: string };
export type AgentHandoffDelivery = { sourceAgentId: string; targetAgentId: string; handoffNodeId: string; runId: string; content: string; createdAt: string };

export const agentLinksStorageKey = 'toolhub:agent-links:v1';
export const agentOutputsStorageKey = 'toolhub:agent-outputs:v1';
export const agentLinksChangedEvent = 'toolhub:agent-links-changed';
export const agentOutputsChangedEvent = 'toolhub:agent-outputs-changed';
export const handoffDeliveriesStorageKey = 'toolhub:handoff-deliveries:v1';
export const handoffDeliveriesChangedEvent = 'toolhub:handoff-deliveries-changed';
const designerGraphStorageKey = 'toolhub:designer-graph:v3';

export function routesForAgent(links: AgentLink[], agentId: string) {
  return {
    incoming: [...new Set(links.filter(link => link.target === agentId).map(link => link.source))],
    outgoing: [...new Set(links.filter(link => link.source === agentId).map(link => link.target))],
  };
}

export function receiveHandoffContent(liveOutput: string, testDocument: string, useTestDocument: boolean): string {
  return liveOutput || (useTestDocument ? testDocument : '');
}

export function readAgentLinks(): AgentLink[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(agentLinksStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is AgentLink => Boolean(item && typeof item.source === 'string' && typeof item.target === 'string' && item.source !== item.target)).slice(0, 300) : [];
  } catch { return []; }
}

export function readAgentOutputs(): AgentOutputSnapshot[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(agentOutputsStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is AgentOutputSnapshot => Boolean(item && typeof item.agentId === 'string' && typeof item.runId === 'string' && typeof item.content === 'string' && typeof item.createdAt === 'string')).slice(-30) : [];
  } catch { return []; }
}

export function saveAgentOutput(output: AgentOutputSnapshot) {
  try {
    const previous = readAgentOutputs();
    const next = [...previous.filter(item => item.agentId !== output.agentId), output].slice(-30);
    localStorage.setItem(agentOutputsStorageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(agentOutputsChangedEvent));
    if (output.agentId === 'designer') syncDesignerHandoffDeliveries();
  } catch { /* Chat still works if local storage is unavailable. */ }
}

export function readHandoffDeliveries(): AgentHandoffDelivery[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(handoffDeliveriesStorageKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is AgentHandoffDelivery => Boolean(item && typeof item.sourceAgentId === 'string' && typeof item.targetAgentId === 'string' && typeof item.handoffNodeId === 'string' && typeof item.runId === 'string' && typeof item.content === 'string' && typeof item.createdAt === 'string')).slice(-100) : [];
  } catch { return []; }
}

export function deliveriesForDesigner(links: AgentLink[], outputs: AgentOutputSnapshot[], sendNodeIds: string[]): AgentHandoffDelivery[] {
  const output = outputs.find(item => item.agentId === 'designer');
  if (!output) return [];
  return sendNodeIds.flatMap(handoffNodeId => routesForAgent(links, 'designer').outgoing.map(targetAgentId => ({
    sourceAgentId: 'designer', targetAgentId, handoffNodeId, runId: output.runId, content: output.content, createdAt: output.createdAt,
  })));
}

export function readActiveDesignerHandoffModes(): Array<'receive' | 'send'> {
  try {
    const graph = JSON.parse(localStorage.getItem(designerGraphStorageKey) || '{}') as { nodes?: Array<{ kind?: unknown; handoffMode?: unknown; active?: unknown }> };
    return Array.isArray(graph.nodes) ? graph.nodes.filter(node => node.kind === 'agent-handoff' && node.active !== false).map(node => node.handoffMode === 'send' ? 'send' : 'receive') : [];
  } catch { return []; }
}

export function handoffContextForAgent(agentId: string, links: AgentLink[], outputs: AgentOutputSnapshot[], deliveries: AgentHandoffDelivery[], designerModes: Array<'receive' | 'send'>): string {
  if (agentId === 'designer') {
    if (!designerModes.includes('receive')) return '';
    const sources = routesForAgent(links, 'designer').incoming;
    return sources.flatMap(source => {
      const output = outputs.find(item => item.agentId === source);
      return output ? [`## ${source} handoff\n${output.content}`] : [];
    }).join('\n\n').slice(0, 8000);
  }
  return deliveries.filter(delivery => delivery.targetAgentId === agentId).map(delivery => `## ${delivery.sourceAgentId} handoff\n${delivery.content}`).join('\n\n').slice(0, 8000);
}

export function syncDesignerHandoffDeliveries() {
  try {
    const graph = JSON.parse(localStorage.getItem(designerGraphStorageKey) || '{}') as { nodes?: Array<{ id?: unknown; kind?: unknown; handoffMode?: unknown; active?: unknown }>; links?: Array<{ source?: unknown; target?: unknown; command?: unknown }> };
    const approvalIds = new Set(Array.isArray(graph.nodes) ? graph.nodes.filter(node => node.kind === 'human-approval' && typeof node.id === 'string').map(node => node.id as string) : []);
    const gatedIds = new Set(Array.isArray(graph.links) ? graph.links.filter(link => approvalIds.has(String(link.source)) && link.command === 'approve' && typeof link.target === 'string').map(link => link.target as string) : []);
    const sendNodeIds = Array.isArray(graph.nodes) ? graph.nodes.filter(node => node.kind === 'agent-handoff' && node.handoffMode === 'send' && node.active !== false && typeof node.id === 'string' && !gatedIds.has(node.id)).map(node => node.id as string) : [];
    const next = [...readHandoffDeliveries().filter(delivery => delivery.sourceAgentId !== 'designer' || gatedIds.has(delivery.handoffNodeId) && delivery.runId.startsWith('approval:')), ...deliveriesForDesigner(readAgentLinks(), readAgentOutputs(), sendNodeIds)];
    const value = JSON.stringify(next);
    if (localStorage.getItem(handoffDeliveriesStorageKey) !== value) {
      localStorage.setItem(handoffDeliveriesStorageKey, value);
      window.dispatchEvent(new Event(handoffDeliveriesChangedEvent));
    }
  } catch { /* Keep graph and chat usable if local storage is unavailable. */ }
}

export function deliverApprovedDesignerHandoff(handoffNodeId: string, runId: string, content: string) {
  try {
    const createdAt = new Date().toISOString();
    const deliveries = routesForAgent(readAgentLinks(), 'designer').outgoing.map(targetAgentId => ({ sourceAgentId: 'designer', targetAgentId, handoffNodeId, runId: `approval:${runId}`, content, createdAt }));
    const next = [...readHandoffDeliveries().filter(item => item.handoffNodeId !== handoffNodeId), ...deliveries].slice(-100);
    localStorage.setItem(handoffDeliveriesStorageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(handoffDeliveriesChangedEvent));
  } catch { /* The approval remains saved even if this browser cannot store handoffs. */ }
}
