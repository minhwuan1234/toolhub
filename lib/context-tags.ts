export type ContextTagSource = {
  id: string;
  kind: string;
  active?: boolean;
  taskText?: string;
  handoffMode?: 'receive' | 'send';
  contextFiles: Array<{ id: string; name: string; content: string }>;
  contextTags: Array<{ id: string; name: string; kind: 'text' | 'file'; text: string; fileId: string | null }>;
};

export type TagDefinition = { id: string; name: string; sourceNodeId: string; content: string };
export type TagRegistry = { definitions: Map<string, TagDefinition>; conflicts: Set<string> };
export type TagResolution = { ok: true; content: string } | { ok: false; error: string };
export type ContextInputLink = { source: string; target: string; command: string };
export const maxGraphAgentInputCharacters = 100_000;

const tagPattern = /(^|\s)\/([^/*\n]{1,40})\/(?:\s*\*([\s\S]*?)\*)?/g;
const tagKey = (name: string) => name.trim().toLocaleLowerCase('en-US');

export function buildTagRegistry(nodes: ContextTagSource[]): TagRegistry {
  const definitions = new Map<string, TagDefinition>();
  const conflicts = new Set<string>();
  for (const node of nodes) {
    if (node.kind !== 'context') continue;
    for (const tag of node.contextTags) {
      const content = tag.kind === 'file' ? node.contextFiles.find(file => file.id === tag.fileId)?.content : tag.text;
      if (content === undefined) continue;
      const key = tagKey(tag.name);
      const previous = definitions.get(key);
      if (previous && previous.content !== content) conflicts.add(key);
      else if (!previous) definitions.set(key, { id: tag.id, name: tag.name, sourceNodeId: node.id, content });
    }
  }
  return { definitions, conflicts };
}

export function buildConnectedTagRegistry(targetNodeId: string, nodes: ContextTagSource[], links: ContextInputLink[]): TagRegistry {
  const allowed = new Set(links.filter(link => link.target === targetNodeId && link.command === 'input').map(link => link.source));
  return buildTagRegistry(nodes.filter(node => node.kind === 'context' && node.active !== false && allowed.has(node.id)));
}

export function resolveConnectedInput(targetNodeId: string, task: string, nodes: ContextTagSource[], links: ContextInputLink[]): TagResolution {
  return resolveContextText(task, buildConnectedTagRegistry(targetNodeId, nodes, links));
}

export function resolveGraphAgentInput(agentNodeId: string, explicitInput: string, nodes: ContextTagSource[], links: ContextInputLink[], handoffData: Record<string, string> = {}): TagResolution {
  const workflowIds = new Set(links.filter(link => link.target === agentNodeId && link.command === 'input').map(link => link.source));
  const workflows = nodes.filter(node => node.kind === 'workflow' && node.active !== false && workflowIds.has(node.id) && node.taskText?.trim());
  if (!explicitInput.trim() && !workflows.length) return { ok: false, error: 'Add Explicit input or connect a Workflow node with a task.' };
  const parts: string[] = [];
  if (explicitInput.trim()) {
    const resolved = resolveConnectedInput(agentNodeId, explicitInput, nodes, links);
    if (!resolved.ok) return resolved;
    parts.push(resolved.content);
  }
  for (const workflow of workflows) {
    const resolved = resolveConnectedInput(workflow.id, workflow.taskText!, nodes, links);
    if (!resolved.ok) return resolved;
    const incoming = new Set(links.filter(link => link.target === workflow.id && link.command === 'input').map(link => link.source));
    const handoffs = nodes.filter(node => node.kind === 'agent-handoff' && node.active !== false && node.handoffMode === 'receive' && incoming.has(node.id)).map(node => handoffData[node.id]).filter(Boolean);
    parts.push([resolved.content, ...handoffs].join('\n\n'));
  }
  const directHandoffs = nodes.filter(node => node.kind === 'agent-handoff' && node.active !== false && node.handoffMode === 'receive' && workflowIds.has(node.id)).map(node => handoffData[node.id]).filter(Boolean);
  parts.push(...directHandoffs);
  const content = parts.join('\n\n');
  if (content.length > maxGraphAgentInputCharacters) return { ok: false, error: 'Selected task and context exceed the 100,000 character graph input limit.' };
  return { ok: true, content };
}

export function resolveTag(name: string, registry: TagRegistry): TagResolution {
  const key = tagKey(name);
  if (registry.conflicts.has(key)) return { ok: false, error: `Tag “${name}” has conflicting saved content.` };
  const definition = registry.definitions.get(key);
  if (!definition) return { ok: false, error: `Tag “${name}” has no saved content.` };
  return { ok: true, content: definition.content };
}

export function resolveContextText(text: string, registry: TagRegistry): TagResolution {
  const failures: string[] = [];
  const content = text.replace(tagPattern, (match, leading: string, name: string) => {
    const result = resolveTag(name, registry);
    if (!result.ok) { failures.push(result.error); return match; }
    return `${leading}${result.content}`;
  });
  return failures.length ? { ok: false, error: [...new Set(failures)].join(' ') } : { ok: true, content };
}
