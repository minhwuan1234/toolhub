import { randomUUID } from 'node:crypto';
import { buildConnectedTagRegistry, resolveConnectedInput, resolveGraphAgentInput, type ContextTagSource, type ContextInputLink } from '@/lib/context-tags';
import { runAgent } from '@/lib/agent-team';
import { getDatabase } from './database';
import { readScannerFile } from './linkedin-scanner';
import { getAgentCard } from './agent-cards';
import { isToolImported } from './imported-tools';
import { seeStages, isSeeStage, type SeeOutput, type SeeStage } from '../see-contract';
import { astLayers, dependencyGraph, ruleClassifier, layerAssignment } from '../repository-see';
import { analyzeFeaturePlan } from './think';
import { readAgentRepository, repositoryReplayQuery, repositoryToolsForAgent } from './repository-reader';

export type DesignerGraphNode = ContextTagSource & {
  id: string;
  number: number;
  x: number;
  y: number;
  name: string;
  active: boolean;
  contextText: string;
  testDocument: string;
  useTestDocument: boolean;
  instructionPrompt: string;
  repoToolId?: string;
  seeSourceId?: string;
};
export type DesignerGraphDocument = {
  nodes: DesignerGraphNode[];
  links: ContextInputLink[];
  screenContextsSeeded: boolean;
  screenContextVersion: number;
  repoReaderSeeded?: boolean;
  thinkSeeded?: boolean;
  seeSeeded?: boolean;
  linkMode?: 'visual';
};

export function executionGraph(document: DesignerGraphDocument): DesignerGraphDocument {
  return document.linkMode === 'visual' || document.repoReaderSeeded ? { ...document, links: [] } : document;
}

export function graphIdForAgent(agentId: string) {
  if (agentId !== 'ba' && agentId !== 'designer' && agentId !== 'developer' && !/^custom-[0-9a-f-]{36}$/.test(agentId)) throw new Error('Invalid agent ID.');
  return agentId === 'designer' ? 'uiux' : `agent:${agentId}`;
}

async function agentIdForGraphNode(nodeId: string): Promise<string> {
  const { rows } = await getDatabase().query<{ id: string }>(
    "SELECT id FROM designer_graphs WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(document->'nodes') AS node(value) WHERE node.value->>'id'=$1) LIMIT 1",
    [nodeId],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Graph node not found.');
  if (id === 'uiux') return 'designer';
  if (id.startsWith('agent:')) return id.slice(6);
  throw new Error('Unknown graph.');
}

export function validateDesignerGraph(value: unknown): DesignerGraphDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Graph document must be an object.');
  const graph = value as Record<string, unknown>;
  if (!Array.isArray(graph.nodes) || graph.nodes.length > 100 || !Array.isArray(graph.links) || graph.links.length > 300) throw new Error('Graph exceeds its node or link limit.');
  const nodes = graph.nodes as unknown[];
  if (nodes.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as DesignerGraphNode).id !== 'string' || !(item as DesignerGraphNode).id || (item as DesignerGraphNode).id.length > 100 || !['workflow', 'context', 'agent', 'tool-calling', 'human-approval', 'skill', 'agent-handoff', 'repo-reader', 'think', ...seeStages.map(stage => stage.kind)].includes((item as DesignerGraphNode).kind) || !Number.isFinite((item as DesignerGraphNode).x) || !Number.isFinite((item as DesignerGraphNode).y) || !Array.isArray((item as DesignerGraphNode).contextTags) || !Array.isArray((item as DesignerGraphNode).contextFiles) || (item as DesignerGraphNode).contextTags.length > 30 || (item as DesignerGraphNode).contextFiles.length > 20 || (item as DesignerGraphNode).kind === 'repo-reader' && ((item as DesignerGraphNode).repoToolId !== undefined && (typeof (item as DesignerGraphNode).repoToolId !== 'string' || (item as DesignerGraphNode).repoToolId!.length > 100) || typeof (item as DesignerGraphNode).taskText !== 'string' || (item as DesignerGraphNode).taskText!.length > 500) || (item as DesignerGraphNode).contextFiles.some(file => typeof file.id !== 'string' || typeof file.name !== 'string' || typeof file.content !== 'string' || file.content.length > 200000 || file.repoPath !== undefined && (file.repository !== 'linkedin-scanner' || typeof file.repoPath !== 'string' || file.repoPath.length > 500 || !file.repoPath)))) throw new Error('Graph has an invalid node.');
  if ((nodes as DesignerGraphNode[]).some(node => isSeeStage(node.kind) && (typeof node.seeSourceId !== 'string' || node.seeSourceId.length > 100 || !(nodes as DesignerGraphNode[]).some(reader => reader.id === node.seeSourceId && reader.kind === 'repo-reader')))) throw new Error('See nodes require a repository source in this graph.');
  const ids = new Set(nodes.map(item => (item as DesignerGraphNode).id));
  if (ids.size !== nodes.length) throw new Error('Graph has duplicate node IDs.');
  const kinds = new Map(nodes.map(item => [(item as DesignerGraphNode).id, (item as DesignerGraphNode).kind]));
  const visual = graph.linkMode === 'visual' || graph.repoReaderSeeded === true;
  if ((graph.links as unknown[]).some(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return true;
    const link = item as ContextInputLink;
    if (typeof link.source !== 'string' || typeof link.target !== 'string' || link.source === link.target || !ids.has(link.source) || !ids.has(link.target)) return true;
    if (visual) return !['input', 'approve', 'deny', 'loop'].includes(link.command);
    return kinds.get(link.target) === 'repo-reader' || !(kinds.get(link.source) === 'human-approval' ? ['input', 'approve', 'deny', 'loop'] : ['input']).includes(link.command) || link.command === 'loop' && kinds.get(link.target) !== 'agent';
  })) throw new Error('Graph has an invalid link.');
  return {
    nodes: nodes as DesignerGraphNode[],
    links: graph.links as ContextInputLink[],
    screenContextsSeeded: graph.screenContextsSeeded === true,
    screenContextVersion: graph.screenContextVersion === 2 ? 2 : 0,
    ...(graph.repoReaderSeeded === true ? { repoReaderSeeded: true } : {}),
    ...(graph.thinkSeeded === true ? { thinkSeeded: true } : {}),
    ...(graph.seeSeeded === true ? { seeSeeded: true } : {}),
    ...(visual ? { linkMode: 'visual' as const } : {}),
  };
}

async function refreshLinkedContext(document: DesignerGraphDocument, agentId: string, targetNodeId: string, selectionText = ''): Promise<DesignerGraphDocument> {
  const connected = new Set(document.links.filter(link => link.command === 'input' && link.target === targetNodeId).map(link => link.source));
  const playingContext = document.nodes.some(node => node.id === targetNodeId && node.kind === 'context');
  if (playingContext) connected.add(targetNodeId);
  let selectedText = selectionText;
  for (const node of document.nodes.filter(item => connected.has(item.id) && item.kind === 'workflow')) {
    selectedText += `\n${node.taskText || ''}`;
    for (const link of document.links.filter(item => item.command === 'input' && item.target === node.id)) connected.add(link.source);
  }
  const selectedTags = new Set(Array.from(selectedText.matchAll(/(^|\s)\/([^/*\n]{1,40})\//g), match => match[2].trim().toLowerCase()));
  const selectedFileIds = new Set(document.nodes.filter(node => node.kind === 'context' && node.active !== false && connected.has(node.id)).flatMap(node => node.contextTags.filter(tag => tag.kind === 'file' && tag.fileId && selectedTags.has(tag.name.toLowerCase())).map(tag => tag.fileId)));
  const linked = document.nodes.filter(node => node.kind === 'context' && node.active !== false && connected.has(node.id)).flatMap(node => node.contextFiles.filter(file => file.repository === 'linkedin-scanner' && file.repoPath && (playingContext || selectedFileIds.has(file.id))));
  if (!linked.length) return document;
  const card = await getAgentCard(agentId);
  if (!card?.toolIds.includes('linkedin-scanner') || !await isToolImported('linkedin-scanner')) throw new Error('Repository access is not enabled for this agent.');
  const fresh = new Map(await Promise.all([...new Set(linked.map(file => file.repoPath!))].map(async path => {
    const file = await readScannerFile(path);
    if (file.content.length > 200000) throw new Error(`${path} exceeds the context limit.`);
    return [path, file] as const;
  })));
  return { ...document, nodes: document.nodes.map(node => connected.has(node.id) && node.kind === 'context' ? { ...node, contextFiles: node.contextFiles.map(file => file.repository === 'linkedin-scanner' && file.repoPath && fresh.has(file.repoPath) ? { ...file, content: fresh.get(file.repoPath)!.content, sha: fresh.get(file.repoPath)!.sha } : file) } : node) };
}

export async function getDesignerGraph(agentId = 'designer'): Promise<{ document: DesignerGraphDocument | null; revision: number }> {
  const { rows } = await getDatabase().query<{ document: DesignerGraphDocument; revision: string }>('SELECT document, revision FROM designer_graphs WHERE id=$1', [graphIdForAgent(agentId)]);
  const row = rows[0];
  const document = row ? validateDesignerGraph(row.document) : null;
  if (!document?.repoReaderSeeded || !document?.thinkSeeded || !document?.seeSeeded) {
    const card = await getAgentCard(agentId);
    if (card && (document?.repoReaderSeeded || /\bupgrading\b/i.test(card.name))) {
      const seeded = seedSeeNodes(seedThinkNode(seedRepositoryReader(document, agentId, card.toolIds), agentId), agentId);
      try {
        const revision = await saveDesignerGraph(seeded, Number(row?.revision) || 0, agentId);
        return { document: seeded, revision };
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('another session')) throw error;
        const current = await getDatabase().query<{ document: DesignerGraphDocument; revision: string }>('SELECT document, revision FROM designer_graphs WHERE id=$1', [graphIdForAgent(agentId)]);
        if (current.rows[0]) return { document: validateDesignerGraph(current.rows[0].document), revision: Number(current.rows[0].revision) };
        throw error;
      }
    }
  }
  return { document, revision: Number(row?.revision) || 0 };
}

export function seedRepositoryReader(document: DesignerGraphDocument | null, agentId: string, toolIds: string[]): DesignerGraphDocument {
  const graph = document || { nodes: [], links: [], screenContextsSeeded: false, screenContextVersion: 0 };
  if (graph.repoReaderSeeded) return graph;
  const node: DesignerGraphNode & { icon: string } = {
    id: `repo-reader:${agentId}`, number: Math.max(0, ...graph.nodes.map(node => node.number || 0)) + 1,
    kind: 'repo-reader', name: 'Read Repository', icon: 'code', x: graph.nodes.length ? Math.max(...graph.nodes.map(node => node.x)) + 220 : 180, y: 180,
    active: true, contextText: '', contextFiles: [], contextTags: [], testDocument: '', useTestDocument: false, instructionPrompt: '', taskText: '',
    repoToolId: toolIds.length === 1 ? toolIds[0] : '',
  };
  if (graph.nodes.length >= 100) throw new Error('Remove a node before adding Read Repository.');
  return { ...graph, repoReaderSeeded: true, linkMode: 'visual', nodes: [...graph.nodes, node] };
}

export function seedThinkNode(graph: DesignerGraphDocument, agentId: string): DesignerGraphDocument {
  if (graph.thinkSeeded) return graph;
  if (graph.nodes.some(node => node.kind === 'think')) return { ...graph, thinkSeeded: true };
  if (graph.nodes.length >= 100) throw new Error('Remove a node before adding Think.');
  const reader = graph.nodes.find(node => node.kind === 'repo-reader');
  const node: DesignerGraphNode & { icon: string } = {
    id: `think:${agentId}`, number: Math.max(0, ...graph.nodes.map(node => node.number || 0)) + 1,
    kind: 'think', name: 'Think', icon: 'think', x: Math.max(0, ...graph.nodes.map(node => node.x)) + 220, y: reader?.y || 180,
    active: true, contextText: '', contextFiles: [], contextTags: [], testDocument: '', useTestDocument: false, instructionPrompt: '', taskText: '',
  };
  return { ...graph, thinkSeeded: true, nodes: [...graph.nodes, node] };
}

export function seedSeeNodes(graph: DesignerGraphDocument, agentId: string): DesignerGraphDocument {
  if (graph.seeSeeded) return graph;
  const reader = graph.nodes.find(node => node.kind === 'repo-reader');
  if (!reader) return graph;
  const nodes = [...graph.nodes], links = graph.links.filter(link => !(link.source === reader.id && graph.nodes.some(node => node.id === link.target && node.kind === 'think')));
  const baseX = reader.x + 220;
  let previous = reader.id;
  for (const [index, stage] of seeStages.entries()) {
    let node = nodes.find(node => node.kind === stage.kind && node.seeSourceId === reader.id);
    if (!node) {
      if (nodes.length >= 100) throw new Error('Remove a node before adding the See pipeline.');
      node = { ...reader, id: `${stage.kind}:${agentId}`, number: Math.max(...nodes.map(item => item.number)) + 1, kind: stage.kind, name: stage.name, x: baseX + index * 220, y: reader.y, seeSourceId: reader.id, instructionPrompt: '', contextText: '', contextFiles: [], contextTags: [] };
      nodes.push({ ...node, icon: stage.kind === 'dependency-graph' ? 'workflow' : stage.kind === 'layer-assignment' ? 'database' : 'code' } as DesignerGraphNode);
    }
    if (!links.some(link => link.source === previous && link.target === node!.id)) links.push({ id: `see:${previous}:${node.id}`, source: previous, target: node.id, command: 'input' } as ContextInputLink);
    previous = node.id;
  }
  const thinker = nodes.find(node => node.kind === 'think');
  if (thinker) {
    const index = nodes.indexOf(thinker);
    nodes[index] = { ...thinker, x: baseX + 4 * 220, y: reader.y };
    if (!links.some(link => link.source === previous && link.target === thinker.id)) links.push({ id: `see:${previous}:${thinker.id}`, source: previous, target: thinker.id, command: 'input' } as ContextInputLink);
  }
  return { ...graph, nodes, links, seeSeeded: true };
}

type SeeEvent = { type: 'node_start'; nodeId: string; name: string; query: string } | { type: 'node_result'; nodeId: string; name: string; output: string };
async function assertSeeAccess(agentId: string, readerId: string, stageId: string, toolId: string) {
  const [graph, tools] = await Promise.all([getDesignerGraph(agentId), repositoryToolsForAgent(agentId)]);
  const reader = graph.document?.nodes.find(node => node.id === readerId && node.kind === 'repo-reader' && node.active !== false && (!node.repoToolId || node.repoToolId === toolId));
  const node = graph.document?.nodes.find(node => node.id === stageId && isSeeStage(node.kind) && node.seeSourceId === readerId && node.active !== false);
  if (!reader || !node || !tools.some(tool => tool.id === toolId)) throw new Error('See pipeline node or repository access is not enabled.');
  return node;
}

export async function runRepositorySee(agentId: string, readerId: string, toolId: string, query: string, request: string, emit: (event: SeeEvent) => void = () => {}, signal?: AbortSignal, stopAfter?: SeeStage) {
  const runId = randomUUID();
  const graph = await getDesignerGraph(agentId);
  const reader = graph.document?.nodes.find(node => node.id === readerId && node.kind === 'repo-reader' && node.active !== false);
  if (!reader || reader.repoToolId && toolId && reader.repoToolId !== toolId) throw new Error('Read Repository is not enabled in this graph.');
  const stages = seeStages.map(stage => graph.document!.nodes.find(node => node.kind === stage.kind && node.seeSourceId === readerId));
  if (stages.slice(0, stopAfter ? seeStages.findIndex(stage => stage.kind === stopAfter) + 1 : 4).some(node => !node || node.active === false)) throw new Error('Enable all four See nodes before reading this repository.');
  let assignment: SeeOutput | undefined;
  const scan = await readAgentRepository(agentId, toolId, query, async (result, sources) => {
    signal?.throwIfAborted();
    const currentReader = (await getDesignerGraph(agentId)).document?.nodes.find(node => node.id === readerId && node.kind === 'repo-reader' && node.active !== false && (!node.repoToolId || node.repoToolId === result.tool_id));
    if (!currentReader || !(await repositoryToolsForAgent(agentId)).some(tool => tool.id === result.tool_id)) throw new Error('Graph access changed during repository read.');
    const output = JSON.stringify({ ...result, run_id: runId, query_source: 'model', user_request: request });
    await saveDesignerGraphOutput(readerId, output, agentId);
    emit({ type: 'node_result', nodeId: reader.id, name: reader.name, output });
    let previous: SeeOutput | undefined;
    for (const [index, stage] of seeStages.entries()) {
      signal?.throwIfAborted();
      const node = await assertSeeAccess(agentId, readerId, stages[index]!.id, result.tool_id);
      emit({ type: 'node_start', nodeId: node.id, name: node.name, query: '' });
      previous = index === 0 ? astLayers(sources, query, { run_id: runId, source_node_id: readerId, repository: result.repository, commit: result.commit, tool_id: result.tool_id, coverage: result.coverage }) : index === 1 ? dependencyGraph(previous!) : index === 2 ? ruleClassifier(previous!) : layerAssignment(previous!);
      await assertSeeAccess(agentId, readerId, node.id, result.tool_id);
      const output = JSON.stringify(previous);
      await saveDesignerGraphOutput(node.id, output, agentId);
      emit({ type: 'node_result', nodeId: node.id, name: node.name, output });
      if (stage.kind === stopAfter) break;
    }
    assignment = previous;
  });
  return { ...scan, run_id: runId, query_source: 'model', user_request: request, layer_counts: assignment?.counts };
}

export async function runStoredSeeStage(nodeId: string, agentId: string) {
  const graph = await getDesignerGraph(agentId);
  const node = graph.document?.nodes.find(node => node.id === nodeId && isSeeStage(node.kind));
  if (!node?.seeSourceId) throw new Error('See stage not found.');
  const outputs = await getDesignerGraphOutputs(agentId);
  const scan = JSON.parse(outputs[node.seeSourceId] || '{}') as { run_id?: string; tool_id?: string; commit?: string };
  if (!scan.run_id || !scan.tool_id) throw new Error('Run Read Repository first.');
  await assertSeeAccess(agentId, node.seeSourceId, nodeId, scan.tool_id);
  const index = seeStages.findIndex(stage => stage.kind === node.kind);
  if (index === 0) {
    const saved = JSON.parse(outputs[node.seeSourceId]) as { query?: string; user_request?: string };
    await runRepositorySee(agentId, node.seeSourceId, scan.tool_id, saved.query || '', saved.user_request || '', undefined, undefined, 'ast-layers');
    return JSON.parse((await getDesignerGraphOutputs(agentId))[node.id]) as SeeOutput;
  }
  const previousNode = graph.document!.nodes.find(item => item.kind === seeStages[index - 1].kind && item.seeSourceId === node.seeSourceId && item.active !== false);
  const previous = JSON.parse(outputs[previousNode?.id || ''] || '{}') as SeeOutput;
  if (previous.stage !== seeStages[index - 1].kind || previous.run_id !== scan.run_id || previous.commit !== scan.commit) throw new Error('Run the preceding See stage for the current repository snapshot.');
  const result = index === 1 ? dependencyGraph(previous) : index === 2 ? ruleClassifier(previous) : layerAssignment(previous);
  await assertSeeAccess(agentId, node.seeSourceId, nodeId, scan.tool_id);
  await saveDesignerGraphOutput(nodeId, JSON.stringify(result), agentId);
  return result;
}

export async function runStoredThinkNode(nodeId: string, agentId: string, sourceNodeId?: string, request?: string, signal?: AbortSignal) {
  const { document } = await getDesignerGraph(agentId);
  if (!document?.nodes.some(node => node.id === nodeId && node.kind === 'think' && node.active !== false)) throw new Error('Think node is not enabled in this graph.');
  const readers = document.nodes.filter(node => node.kind === 'repo-reader' && node.active !== false && (!sourceNodeId || node.id === sourceNodeId));
  const outputs = await getDesignerGraphOutputs(agentId);
  const candidates = readers.filter(node => outputs[node.id]);
  if (candidates.length !== 1) throw new Error(candidates.length ? 'Select which Read Repository output Think should use.' : 'Run Read Repository from the graph chat before Think.');
  const reader = candidates[0];
  const scan = JSON.parse(outputs[reader.id]) as Record<string, unknown>;
  const allowed = await repositoryToolsForAgent(agentId);
  if (typeof scan.tool_id !== 'string' || !allowed.some(tool => tool.id === scan.tool_id) || reader.repoToolId && reader.repoToolId !== scan.tool_id) throw new Error('Repository access is not enabled for this agent.');
  const originalRequest = request || (typeof scan.user_request === 'string' ? scan.user_request : '');
  for (const stage of seeStages) {
    const stageNode = document.nodes.find(node => node.kind === stage.kind && node.seeSourceId === reader.id && node.active !== false);
    const savedStage = JSON.parse(outputs[stageNode?.id || ''] || '{}') as SeeOutput;
    if (!stageNode || savedStage.stage !== stage.kind || savedStage.run_id !== scan.run_id || savedStage.commit !== scan.commit) throw new Error('Complete the four See stages for this repository read before Think.');
  }
  const assignmentNode = document.nodes.find(node => node.kind === 'layer-assignment' && node.seeSourceId === reader.id && node.active !== false);
  const assignment = JSON.parse(outputs[assignmentNode?.id || ''] || '{}') as SeeOutput;
  if (!assignmentNode || assignment.stage !== 'layer-assignment' || !scan.run_id || assignment.run_id !== scan.run_id || assignment.commit !== scan.commit) throw new Error('Complete the four See stages for this repository read before Think.');
  const result = await analyzeFeaturePlan(originalRequest, reader.id, { ...scan, layer_assignment: assignment }, signal);
  const fresh = await getDesignerGraph(agentId);
  const freshTools = await repositoryToolsForAgent(agentId);
  if (!fresh.document?.nodes.some(node => node.id === nodeId && node.kind === 'think' && node.active !== false) || !fresh.document.nodes.some(node => node.id === reader.id && node.kind === 'repo-reader' && node.active !== false && (!node.repoToolId || node.repoToolId === scan.tool_id)) || !freshTools.some(tool => tool.id === scan.tool_id)) throw new Error('Graph access changed during Think.');
  const output = JSON.stringify(result);
  await saveDesignerGraphOutput(nodeId, output, agentId);
  return result;
}

export async function saveDesignerGraph(value: unknown, expectedRevision: number, agentId = 'designer'): Promise<number> {
  const document = validateDesignerGraph(value);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid graph revision.');
  if (expectedRevision === 0) {
    const { rows } = await getDatabase().query<{ revision: string }>(
      'INSERT INTO designer_graphs (id, document) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING RETURNING revision',
      [graphIdForAgent(agentId), document],
    );
    if (!rows[0]) throw new Error('Graph changed in another session. Reload before saving.');
    return Number(rows[0].revision);
  }
  const { rows } = await getDatabase().query<{ revision: string }>(
    'UPDATE designer_graphs SET document=$3, revision=revision+1, updated_at=now() WHERE id=$1 AND revision=$2 RETURNING revision',
    [graphIdForAgent(agentId), expectedRevision, document],
  );
  if (!rows[0]) throw new Error('Graph changed in another session. Reload before saving.');
  return Number(rows[0].revision);
}

export async function getDesignerGraphOutputs(agentId = 'designer'): Promise<Record<string, string>> {
  const { rows } = await getDatabase().query<{ node_id: string; content: string }>("SELECT node_id, content FROM designer_graph_outputs WHERE node_id IN (SELECT node.value->>'id' FROM designer_graphs, jsonb_array_elements(document->'nodes') AS node(value) WHERE designer_graphs.id=$1)", [graphIdForAgent(agentId)]);
  return Object.fromEntries(rows.map(row => [row.node_id, row.content]));
}

export async function getDesignerGraphOutputChanges(since: string, agentId = 'designer'): Promise<{ outputs: Record<string, string>; cursor: string }> {
  if (!Number.isFinite(Date.parse(since))) throw new Error('Invalid output cursor.');
  const { rows } = await getDatabase().query<{ node_id: string; content: string; cursor: string }>(
    `SELECT node_id, content, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor
     FROM designer_graph_outputs WHERE updated_at > $1::timestamptz AND node_id IN (SELECT node.value->>'id' FROM designer_graphs, jsonb_array_elements(document->'nodes') AS node(value) WHERE designer_graphs.id=$2) ORDER BY updated_at`,
    [since, graphIdForAgent(agentId)],
  );
  return { outputs: Object.fromEntries(rows.map(row => [row.node_id, row.content])), cursor: rows.at(-1)?.cursor || since };
}

export async function saveDesignerGraphOutput(nodeId: string, content: string, agentId = 'designer'): Promise<void> {
  if (!nodeId || nodeId.length > 100 || content.length > 200000) throw new Error('Graph output exceeds its limit.');
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ document: DesignerGraphDocument }>('SELECT document FROM designer_graphs WHERE id=$1', [graphIdForAgent(agentId)]);
    if (!rows[0]) throw new Error('Save the graph before running a node.');
    const graph = executionGraph(validateDesignerGraph(rows[0].document));
    const source = graph.nodes.find(node => node.id === nodeId);
    if (!source) throw new Error('Node does not belong to this agent graph.');
    await client.query('INSERT INTO designer_graph_outputs (node_id,content) VALUES ($1,$2) ON CONFLICT (node_id) DO UPDATE SET content=EXCLUDED.content,updated_at=now()', [nodeId, content]);
    for (const link of graph.links.filter(link => link.source === nodeId && link.command === 'input')) {
      const approval = graph.nodes.find(node => node.id === link.target && node.kind === 'human-approval' && node.active !== false);
      if (approval) await client.query('INSERT INTO designer_graph_approvals (id,source_node_id,approval_node_id,source_name,output) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), nodeId, approval.id, source.name, content]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export type GraphApproval = { id: string; source_node_id: string; approval_node_id: string; source_name: string; output: string; created_at: string };

export async function getPendingGraphApproval(): Promise<GraphApproval | null> {
  const { rows } = await getDatabase().query<GraphApproval>(`SELECT a.id, a.source_node_id, a.approval_node_id, a.source_name, a.output, a.created_at FROM designer_graph_approvals a WHERE a.status=$1 AND EXISTS (SELECT 1 FROM designer_graphs g, jsonb_array_elements(g.document->'nodes') AS n(value) WHERE n.value->>'id'=a.approval_node_id AND COALESCE(g.document->>'linkMode','')<>'visual' AND COALESCE(g.document->>'repoReaderSeeded','false')<>'true') ORDER BY a.created_at, a.id LIMIT 1`, ['pending']);
  return rows[0] || null;
}

export type GraphApprovalHistory = GraphApproval & { status: 'pending' | 'approved' | 'denied' | 'upstream-output'; feedback: string | null; decided_at: string | null };

export async function getLatestGraphApproval(approvalNodeId: string): Promise<GraphApprovalHistory | null> {
  if (!approvalNodeId || approvalNodeId.length > 100) throw new Error('Invalid approval node ID.');
  const { rows } = await getDatabase().query<GraphApprovalHistory>(
    'SELECT id, source_node_id, approval_node_id, source_name, output, status, feedback, created_at, decided_at FROM designer_graph_approvals WHERE approval_node_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1',
    [approvalNodeId],
  );
  const latestApproval = rows[0] || null;
  let agentId: string;
  try { agentId = await agentIdForGraphNode(approvalNodeId); }
  catch (error) { if (error instanceof Error && error.message === 'Graph node not found.') return latestApproval; throw error; }
  const { document } = await getDesignerGraph(agentId);
  const incoming = document ? executionGraph(document).links.filter(link => link.target === approvalNodeId && link.command === 'input').map(link => link.source) : [];
  if (!incoming.length) return latestApproval;
  const { rows: outputs } = await getDatabase().query<{ node_id: string; content: string; updated_at: Date }>(
    'SELECT node_id, content, updated_at FROM designer_graph_outputs WHERE node_id = ANY($1::text[]) ORDER BY updated_at DESC LIMIT 1',
    [incoming],
  );
  const output = outputs[0];
  if (!output || latestApproval && new Date(output.updated_at).getTime() <= new Date(latestApproval.created_at).getTime()) return latestApproval;
  const source = document?.nodes.find(node => node.id === output.node_id);
  return { id: `upstream:${output.node_id}`, source_node_id: output.node_id, approval_node_id: approvalNodeId, source_name: source?.name || 'Connected node', output: output.content, status: 'upstream-output', feedback: null, created_at: output.updated_at.toISOString(), decided_at: null };
}

export async function decideGraphApproval(id: string | null, decision: 'approved' | 'denied', feedback: string, review?: { approvalNodeId: string; sourceNodeId: string; output: string }): Promise<{ targets: string[]; output: string; approvalId: string; agentId: string }> {
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid approval ID.');
  if (!id && (!review || !review.approvalNodeId || !review.sourceNodeId || review.output.length > 200000)) throw new Error('Invalid approval output.');
  if (decision === 'denied' && !feedback.trim()) throw new Error('Feedback is required when denying.');
  if (feedback.length > 4000) throw new Error('Feedback is too long.');
  const approvalNodeId = id ? (await getDatabase().query<{ approval_node_id: string }>('SELECT approval_node_id FROM designer_graph_approvals WHERE id=$1', [id])).rows[0]?.approval_node_id : review?.approvalNodeId;
  if (!approvalNodeId) throw new Error('Approval node not found.');
  const agentId = await agentIdForGraphNode(approvalNodeId);
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ document: DesignerGraphDocument }>('SELECT document FROM designer_graphs WHERE id=$1 FOR UPDATE', [graphIdForAgent(agentId)]);
    const graph = rows[0] ? executionGraph(validateDesignerGraph(rows[0].document)) : null;
    if (!graph) throw new Error('Save the agent graph before reviewing output.');
    let approval: { approval_node_id: string; output: string };
    let approvalId = id;
    if (approvalId) {
      const { rows: approvals } = await client.query<{ approval_node_id: string; output: string }>('SELECT approval_node_id, output FROM designer_graph_approvals WHERE id=$1 AND status=$2 FOR UPDATE', [approvalId, 'pending']);
      if (!approvals[0]) throw new Error('This approval has already been handled.');
      approval = approvals[0];
    } else {
      const target = graph.nodes.find(node => node.id === review!.approvalNodeId && node.kind === 'human-approval' && node.active !== false);
      const source = graph.nodes.find(node => node.id === review!.sourceNodeId && node.active !== false);
      if (!target || !source || !graph.links.some(link => link.source === source.id && link.target === target.id && link.command === 'input')) throw new Error('The output is no longer connected to this approval node.');
      const { rows: outputs } = await client.query<{ content: string }>('SELECT content FROM designer_graph_outputs WHERE node_id=$1 FOR UPDATE', [source.id]);
      if (outputs[0] && outputs[0].content !== review!.output) throw new Error('The connected output changed. Reopen this node to review the latest version.');
      const { rows: pending } = await client.query<{ id: string }>('SELECT id FROM designer_graph_approvals WHERE approval_node_id=$1 AND source_node_id=$2 AND output=$3 AND status=$4 ORDER BY created_at DESC LIMIT 1 FOR UPDATE', [target.id, source.id, review!.output, 'pending']);
      approvalId = pending[0]?.id || randomUUID();
      if (!pending[0]) await client.query('INSERT INTO designer_graph_approvals (id,source_node_id,approval_node_id,source_name,output) VALUES ($1,$2,$3,$4,$5)', [approvalId, source.id, target.id, source.name, review!.output]);
      approval = { approval_node_id: target.id, output: review!.output };
    }
    const targets = graph.links.filter(link => link.source === approval.approval_node_id && (decision === 'approved' ? link.command === 'approve' : link.command === 'deny' || link.command === 'loop')).map(link => link.target);
    await client.query('UPDATE designer_graph_approvals SET status=$2, feedback=$3, branch_targets=$4, decided_at=now() WHERE id=$1', [approvalId, decision, decision === 'denied' ? feedback.trim() : null, JSON.stringify(targets)]);
    await client.query('COMMIT');
    return { targets, output: approval.output, approvalId: approvalId!, agentId };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function getUnconsumedGraphFeedback(nodeId: string): Promise<{ id: string; feedback: string } | null> {
  const { rows } = await getDatabase().query<{ id: string; feedback: string }>('SELECT id, feedback FROM designer_graph_approvals WHERE source_node_id=$1 AND status=$2 AND feedback_consumed_at IS NULL ORDER BY decided_at DESC LIMIT 1', [nodeId, 'denied']);
  return rows[0] || null;
}

export async function markGraphFeedbackConsumed(id: string): Promise<void> {
  await getDatabase().query('UPDATE designer_graph_approvals SET feedback_consumed_at=now() WHERE id=$1 AND feedback_consumed_at IS NULL', [id]);
}

export function graphAgentTask(node: DesignerGraphNode, document: DesignerGraphDocument, fallbackTask: string): string {
  document = executionGraph(document);
  const hasWorkflowTask = document.links.some(link => link.target === node.id && link.command === 'input' && document.nodes.some(item => item.id === link.source && item.kind === 'workflow' && item.active !== false && item.taskText?.trim()));
  if (node.instructionPrompt?.trim()) return node.instructionPrompt.trim();
  if (hasWorkflowTask || !fallbackTask.trim()) return '';
  const registry = buildConnectedTagRegistry(node.id, document.nodes, document.links);
  const styleTags = ['Screen.Shell', 'Navigation.Topbar', 'Layout.Content', 'Color.Background', 'Color.Surface', 'Color.Text', 'Color.Border', 'Type.Family', 'Type.PageTitle', 'Surface.Panel', 'Button.Base', 'Responsive.Shell']
    .filter(name => registry.definitions.has(name.toLowerCase()) && !registry.conflicts.has(name.toLowerCase()));
  return [fallbackTask.trim(), styleTags.length ? `Use these connected Toolhub design rules for the screen: ${styleTags.map(name => `/${name}/`).join(' ')}` : ''].filter(Boolean).join('\n\n');
}

export function graphRunIncomingLinks(document: DesignerGraphDocument, nodeId: string): ContextInputLink[] {
  document = executionGraph(document);
  const incoming = document.links.filter(link => link.target === nodeId && (link.command === 'input' || link.command === 'approve'));
  if (!incoming.length && document.links.some(link => link.target === nodeId && (link.command === 'deny' || link.command === 'loop'))) throw new Error('The Deny branch is waiting for its execution logic.');
  return incoming;
}

export async function runStoredGraphAgent(nodeId: string, fallbackTask = '', approvedOutput = '', liveHandoffs: Record<string, string> = {}, agentId = 'designer') {
  const stored = await getDesignerGraph(agentId);
  if (!stored.document) throw new Error('Save the agent graph before running it through MCP.');
  stored.document = executionGraph(stored.document);
  const savedNode = stored.document.nodes.find(item => item.id === nodeId);
  const initialTask = savedNode ? graphAgentTask(savedNode, stored.document, fallbackTask || (approvedOutput ? 'Continue the workflow using the approved output from the previous node.' : '')) : '';
  const document = await refreshLinkedContext(stored.document, agentId, nodeId, initialTask);
  const node = document.nodes.find(item => item.id === nodeId);
  if (!node || node.kind !== 'agent') throw new Error('AI Agent node not found.');
  if (!node.active) throw new Error('AI Agent node is inactive.');
  const handoffData = { ...Object.fromEntries(document.nodes.filter(item => item.kind === 'agent-handoff' && item.active !== false && item.handoffMode === 'receive' && item.useTestDocument).map(item => [item.id, item.testDocument || ''])), ...liveHandoffs };
  const task = graphAgentTask(node, document, fallbackTask || (approvedOutput ? 'Continue the workflow using the approved output from the previous node.' : ''));
  const input = resolveGraphAgentInput(node.id, task, document.nodes, document.links, handoffData);
  if (!input.ok) throw new Error(input.error);
  if (approvedOutput.length > 99000) throw new Error('Approved output exceeds the next agent context limit.');
  const feedback = await getUnconsumedGraphFeedback(node.id);
  const message = feedback ? `${input.content}\n\nHuman review feedback for this revision:\n${feedback.feedback}` : input.content;
  const result = await runAgent(agentId, message, approvedOutput ? `Upstream graph output:\n${approvedOutput}` : '', { graphApprovedContext: Boolean(approvedOutput), graphInput: true });
  const content = result.content;
  await saveDesignerGraphOutput(node.id, content, agentId);
  if (feedback) await markGraphFeedbackConsumed(feedback.id);
  return { node_id: node.id, run_id: randomUUID(), result: { ...result, content } };
}

export async function runGraphToNode(nodeId: string, liveHandoffs: Record<string, string> = {}, agentId = 'designer') {
  const stored = await getDesignerGraph(agentId);
  if (!stored.document) throw new Error('Save the agent graph before running a node.');
  stored.document = executionGraph(stored.document);
  const document = stored.document.nodes.some(node => node.id === nodeId && node.kind === 'context') ? await refreshLinkedContext(stored.document, agentId, nodeId) : stored.document;
  const nodeById = new Map(document.nodes.map(node => [node.id, node]));
  if (!nodeById.has(nodeId)) throw new Error('Graph node not found.');
  const visiting = new Set<string>();
  const completed = new Map<string, string>();
  let waitingForApproval = false;

  async function visit(id: string): Promise<string> {
    if (completed.has(id)) return completed.get(id)!;
    if (visiting.has(id)) throw new Error('The graph contains a cycle. Remove the loop before pressing Play.');
    const node = nodeById.get(id);
    if (!node) throw new Error('An upstream node is missing.');
    if (node.active === false) throw new Error(`${node.name} is inactive.`);
    if (node.kind === 'tool-calling' || node.kind === 'skill') throw new Error(`${node.name} does not have execution logic yet.`);
    visiting.add(id);
    try {
      if (node.kind === 'human-approval' && id !== nodeId) {
        const approval = await getLatestGraphApproval(id);
        if (approval?.status !== 'approved') throw new Error(`${node.name} is waiting for approval.`);
        completed.set(id, approval.output);
        return approval.output;
      }
      const incoming = graphRunIncomingLinks(document!, id);
      const previous: Array<{ node: DesignerGraphNode | undefined; output: string }> = [];
      for (const link of incoming) previous.push({ node: nodeById.get(link.source), output: await visit(link.source) });
      let output = '';
      if (node.kind === 'agent') {
        const modelContext = previous.filter(item => item.node?.kind === 'agent' || item.node?.kind === 'human-approval' || item.node?.kind === 'repo-reader' || item.node?.kind === 'agent-handoff' && item.node.handoffMode === 'send').map(item => `${item.node!.name}:\n${item.output}`).join('\n\n');
        const run = await runStoredGraphAgent(id, '', modelContext, liveHandoffs, agentId);
        output = run.result.content;
      } else if (node.kind === 'human-approval') {
        const approval = await getLatestGraphApproval(id);
        if (approval?.status !== 'pending') throw new Error(`${node.name} has no pending output. Connect an AI Agent and run again.`);
        output = approval.output;
        waitingForApproval = true;
      } else if (node.kind === 'repo-reader') {
        const previous = await getDatabase().query<{ content: string }>('SELECT content FROM designer_graph_outputs WHERE node_id=$1', [node.id]);
        const replay = repositoryReplayQuery(previous.rows[0]?.content);
        let userRequest = '';
        try { const saved = JSON.parse(previous.rows[0]?.content || '{}') as { user_request?: unknown }; if (typeof saved.user_request === 'string') userRequest = saved.user_request; } catch { /* No original request on older scans. */ }
        output = JSON.stringify(await runRepositorySee(agentId, node.id, node.repoToolId || '', replay.query, userRequest));
      } else if (isSeeStage(node.kind)) {
        output = JSON.stringify(await runStoredSeeStage(node.id, agentId));
      } else if (node.kind === 'think') {
        output = JSON.stringify(await runStoredThinkNode(node.id, agentId));
      } else if (node.kind === 'context') {
        output = node.contextText || '';
      } else if (node.kind === 'workflow') {
        const resolved = resolveConnectedInput(id, node.taskText || '', document!.nodes, document!.links);
        if (!resolved.ok) throw new Error(resolved.error);
        const received = previous.filter(item => item.node?.kind === 'agent-handoff' && item.node.handoffMode === 'receive').map(item => item.output).filter(Boolean);
        output = [resolved.content, ...received].filter(Boolean).join('\n\n');
      } else if (node.kind === 'agent-handoff') {
        output = node.handoffMode === 'receive' ? liveHandoffs[id] || (node.useTestDocument ? node.testDocument || '' : '') : previous.map(item => item.output).filter(Boolean).join('\n\n');
      }
      if (id === nodeId && node.kind !== 'agent' && node.kind !== 'human-approval' && node.kind !== 'think' && !isSeeStage(node.kind) && node.kind !== 'repo-reader' && output) await saveDesignerGraphOutput(id, output, agentId);
      completed.set(id, output);
      return output;
    } finally { visiting.delete(id); }
  }

  const output = await visit(nodeId);
  const node = nodeById.get(nodeId)!;
  return { node_id: nodeId, node_name: node.name, kind: node.kind, status: waitingForApproval ? 'waiting_approval' : 'complete', output };
}
