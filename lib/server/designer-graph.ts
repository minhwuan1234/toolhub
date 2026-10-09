import { randomUUID } from 'node:crypto';
import { resolveGraphAgentInput, type ContextTagSource, type ContextInputLink } from '@/lib/context-tags';
import { validateStructuredOutput } from '@/lib/structured-output';
import { runAgent } from '@/lib/agent-team';
import { getDatabase } from './database';

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
  explicitInput: string;
  structuredOutput: string;
};
export type DesignerGraphDocument = {
  nodes: DesignerGraphNode[];
  links: ContextInputLink[];
  screenContextsSeeded: boolean;
  screenContextVersion: number;
};

const graphId = 'uiux';

export function validateDesignerGraph(value: unknown): DesignerGraphDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Graph document must be an object.');
  const graph = value as Record<string, unknown>;
  if (!Array.isArray(graph.nodes) || graph.nodes.length > 100 || !Array.isArray(graph.links) || graph.links.length > 300) throw new Error('Graph exceeds its node or link limit.');
  const nodes = graph.nodes as unknown[];
  if (nodes.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as DesignerGraphNode).id !== 'string' || !(item as DesignerGraphNode).id || (item as DesignerGraphNode).id.length > 100 || !['workflow', 'context', 'agent', 'tool-calling', 'human-approval', 'skill', 'agent-handoff'].includes((item as DesignerGraphNode).kind) || !Number.isFinite((item as DesignerGraphNode).x) || !Number.isFinite((item as DesignerGraphNode).y) || !Array.isArray((item as DesignerGraphNode).contextTags) || !Array.isArray((item as DesignerGraphNode).contextFiles) || (item as DesignerGraphNode).contextTags.length > 30 || (item as DesignerGraphNode).contextFiles.length > 20)) throw new Error('Graph has an invalid node.');
  const ids = new Set(nodes.map(item => (item as DesignerGraphNode).id));
  if (ids.size !== nodes.length) throw new Error('Graph has duplicate node IDs.');
  if ((graph.links as unknown[]).some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as ContextInputLink).source !== 'string' || typeof (item as ContextInputLink).target !== 'string' || (item as ContextInputLink).source === (item as ContextInputLink).target || (item as ContextInputLink).command !== 'input' || !ids.has((item as ContextInputLink).source) || !ids.has((item as ContextInputLink).target))) throw new Error('Graph has an invalid link.');
  return {
    nodes: nodes as DesignerGraphNode[],
    links: graph.links as ContextInputLink[],
    screenContextsSeeded: graph.screenContextsSeeded === true,
    screenContextVersion: graph.screenContextVersion === 2 ? 2 : 0,
  };
}

export async function getDesignerGraph(): Promise<{ document: DesignerGraphDocument | null; revision: number }> {
  const { rows } = await getDatabase().query<{ document: DesignerGraphDocument; revision: string }>('SELECT document, revision FROM designer_graphs WHERE id=$1', [graphId]);
  const row = rows[0];
  return row ? { document: validateDesignerGraph(row.document), revision: Number(row.revision) } : { document: null, revision: 0 };
}

export async function saveDesignerGraph(value: unknown, expectedRevision: number): Promise<number> {
  const document = validateDesignerGraph(value);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid graph revision.');
  if (expectedRevision === 0) {
    const { rows } = await getDatabase().query<{ revision: string }>(
      'INSERT INTO designer_graphs (id, document) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING RETURNING revision',
      [graphId, document],
    );
    if (!rows[0]) throw new Error('Graph changed in another session. Reload before saving.');
    return Number(rows[0].revision);
  }
  const { rows } = await getDatabase().query<{ revision: string }>(
    'UPDATE designer_graphs SET document=$3, revision=revision+1, updated_at=now() WHERE id=$1 AND revision=$2 RETURNING revision',
    [graphId, expectedRevision, document],
  );
  if (!rows[0]) throw new Error('Graph changed in another session. Reload before saving.');
  return Number(rows[0].revision);
}

export async function getDesignerGraphOutputs(): Promise<Record<string, string>> {
  const { rows } = await getDatabase().query<{ node_id: string; content: string }>('SELECT node_id, content FROM designer_graph_outputs');
  return Object.fromEntries(rows.map(row => [row.node_id, row.content]));
}

export async function getDesignerGraphOutputChanges(since: string): Promise<{ outputs: Record<string, string>; cursor: string }> {
  if (!Number.isFinite(Date.parse(since))) throw new Error('Invalid output cursor.');
  const { rows } = await getDatabase().query<{ node_id: string; content: string; cursor: string }>(
    `SELECT node_id, content, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor
     FROM designer_graph_outputs WHERE updated_at > $1::timestamptz ORDER BY updated_at`,
    [since],
  );
  return { outputs: Object.fromEntries(rows.map(row => [row.node_id, row.content])), cursor: rows.at(-1)?.cursor || since };
}

export async function saveDesignerGraphOutput(nodeId: string, content: string): Promise<void> {
  if (!nodeId || nodeId.length > 100 || content.length > 200000) throw new Error('Graph output exceeds its limit.');
  await getDatabase().query(
    'INSERT INTO designer_graph_outputs (node_id,content) VALUES ($1,$2) ON CONFLICT (node_id) DO UPDATE SET content=EXCLUDED.content,updated_at=now()',
    [nodeId, content],
  );
}

export function graphAgentTask(node: DesignerGraphNode, document: DesignerGraphDocument, fallbackTask: string): string {
  const hasWorkflowTask = document.links.some(link => link.target === node.id && link.command === 'input' && document.nodes.some(item => item.id === link.source && item.kind === 'workflow' && item.active !== false && item.taskText?.trim()));
  return node.explicitInput?.trim() || (hasWorkflowTask ? '' : fallbackTask);
}

export async function runStoredGraphAgent(nodeId: string, fallbackTask = '') {
  const { document } = await getDesignerGraph();
  if (!document) throw new Error('Save the UI/UX graph before running it through MCP.');
  const node = document.nodes.find(item => item.id === nodeId);
  if (!node || node.kind !== 'agent') throw new Error('AI Agent node not found.');
  if (!node.active) throw new Error('AI Agent node is inactive.');
  const format = validateStructuredOutput(node.structuredOutput);
  if (!format.ok) throw new Error(format.error);
  const handoffData = Object.fromEntries(document.nodes.filter(item => item.kind === 'agent-handoff' && item.active !== false && item.handoffMode === 'receive' && item.useTestDocument).map(item => [item.id, item.testDocument || '']));
  const input = resolveGraphAgentInput(node.id, graphAgentTask(node, document, fallbackTask), document.nodes, document.links, handoffData);
  if (!input.ok) throw new Error(input.error);
  const result = await runAgent('designer', input.content, '', { outputSchema: format.schema, additionalInstructions: node.instructionPrompt });
  const content = JSON.stringify(JSON.parse(result.content) as unknown, null, 2);
  await saveDesignerGraphOutput(node.id, content);
  return { node_id: node.id, run_id: randomUUID(), result: { ...result, content } };
}
