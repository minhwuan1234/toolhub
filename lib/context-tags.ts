export type ContextTagSource = {
  id: string;
  kind: string;
  active?: boolean;
  contextFiles: Array<{ id: string; name: string; content: string }>;
  contextTags: Array<{ id: string; name: string; kind: 'text' | 'file'; text: string; fileId: string | null }>;
};

export type TagDefinition = { id: string; name: string; sourceNodeId: string; content: string };
export type TagRegistry = { definitions: Map<string, TagDefinition>; conflicts: Set<string> };
export type TagResolution = { ok: true; content: string } | { ok: false; error: string };
export type ContextInputLink = { source: string; target: string; command: string };

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
