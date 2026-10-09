import { randomUUID } from 'node:crypto';
import { buildConnectedTagRegistry, resolveConnectedInput, resolveGraphAgentInput, type ContextTagSource, type ContextInputLink } from '@/lib/context-tags';
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
  const kinds = new Map(nodes.map(item => [(item as DesignerGraphNode).id, (item as DesignerGraphNode).kind]));
  if ((graph.links as unknown[]).some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as ContextInputLink).source !== 'string' || typeof (item as ContextInputLink).target !== 'string' || (item as ContextInputLink).source === (item as ContextInputLink).target || !ids.has((item as ContextInputLink).source) || !ids.has((item as ContextInputLink).target) || !(kinds.get((item as ContextInputLink).source) === 'human-approval' ? ['input', 'approve', 'deny', 'loop'] : ['input']).includes((item as ContextInputLink).command) || (item as ContextInputLink).command === 'loop' && kinds.get((item as ContextInputLink).target) !== 'agent')) throw new Error('Graph has an invalid link.');
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
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO designer_graph_outputs (node_id,content) VALUES ($1,$2) ON CONFLICT (node_id) DO UPDATE SET content=EXCLUDED.content,updated_at=now()', [nodeId, content]);
    const { rows } = await client.query<{ document: DesignerGraphDocument }>('SELECT document FROM designer_graphs WHERE id=$1', [graphId]);
    if (rows[0]) {
      const graph = validateDesignerGraph(rows[0].document);
      const source = graph.nodes.find(node => node.id === nodeId);
      if (source) {
        for (const link of graph.links.filter(link => link.source === nodeId && link.command === 'input')) {
          const approval = graph.nodes.find(node => node.id === link.target && node.kind === 'human-approval' && node.active !== false);
          if (approval) await client.query('INSERT INTO designer_graph_approvals (id,source_node_id,approval_node_id,source_name,output) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), nodeId, approval.id, source.name, content]);
        }
      }
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export type GraphApproval = { id: string; source_node_id: string; approval_node_id: string; source_name: string; output: string; created_at: string };

export async function getPendingGraphApproval(): Promise<GraphApproval | null> {
  const { rows } = await getDatabase().query<GraphApproval>('SELECT id, source_node_id, approval_node_id, source_name, output, created_at FROM designer_graph_approvals WHERE status=$1 ORDER BY created_at, id LIMIT 1', ['pending']);
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
  const { document } = await getDesignerGraph();
  const incoming = document?.links.filter(link => link.target === approvalNodeId && link.command === 'input').map(link => link.source) || [];
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

export async function decideGraphApproval(id: string, decision: 'approved' | 'denied', feedback: string): Promise<{ targets: string[]; output: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Invalid approval ID.');
  if (decision === 'denied' && !feedback.trim()) throw new Error('Feedback is required when denying.');
  if (feedback.length > 4000) throw new Error('Feedback is too long.');
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    const { rows: approvals } = await client.query<{ approval_node_id: string; output: string }>('SELECT approval_node_id, output FROM designer_graph_approvals WHERE id=$1 AND status=$2 FOR UPDATE', [id, 'pending']);
    if (!approvals[0]) throw new Error('This approval has already been handled.');
    const { rows } = await client.query<{ document: DesignerGraphDocument }>('SELECT document FROM designer_graphs WHERE id=$1', [graphId]);
    const graph = rows[0] ? validateDesignerGraph(rows[0].document) : null;
    const targets = graph?.links.filter(link => link.source === approvals[0].approval_node_id && (decision === 'approved' ? link.command === 'approve' : link.command === 'deny' || link.command === 'loop')).map(link => link.target) || [];
    await client.query('UPDATE designer_graph_approvals SET status=$2, feedback=$3, branch_targets=$4, decided_at=now() WHERE id=$1', [id, decision, decision === 'denied' ? feedback.trim() : null, JSON.stringify(targets)]);
    await client.query('COMMIT');
    return { targets, output: approvals[0].output };
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
  const hasWorkflowTask = document.links.some(link => link.target === node.id && link.command === 'input' && document.nodes.some(item => item.id === link.source && item.kind === 'workflow' && item.active !== false && item.taskText?.trim()));
  if (node.explicitInput?.trim()) return node.explicitInput.trim();
  if (hasWorkflowTask || !fallbackTask.trim()) return '';
  const registry = buildConnectedTagRegistry(node.id, document.nodes, document.links);
  const styleTags = ['Screen.Shell', 'Navigation.Topbar', 'Layout.Content', 'Color.Background', 'Color.Surface', 'Color.Text', 'Color.Border', 'Type.Family', 'Type.PageTitle', 'Surface.Panel', 'Button.Base', 'Responsive.Shell']
    .filter(name => registry.definitions.has(name.toLowerCase()) && !registry.conflicts.has(name.toLowerCase()));
  return [fallbackTask.trim(), styleTags.length ? `Use these connected Toolhub design rules for the screen: ${styleTags.map(name => `/${name}/`).join(' ')}` : ''].filter(Boolean).join('\n\n');
}

export function graphRunIncomingLinks(document: DesignerGraphDocument, nodeId: string): ContextInputLink[] {
  const incoming = document.links.filter(link => link.target === nodeId && (link.command === 'input' || link.command === 'approve'));
  if (!incoming.length && document.links.some(link => link.target === nodeId && (link.command === 'deny' || link.command === 'loop'))) throw new Error('The Deny branch is waiting for its execution logic.');
  return incoming;
}

export async function runStoredGraphAgent(nodeId: string, fallbackTask = '', approvedOutput = '', liveHandoffs: Record<string, string> = {}) {
  const { document } = await getDesignerGraph();
  if (!document) throw new Error('Save the UI/UX graph before running it through MCP.');
  const node = document.nodes.find(item => item.id === nodeId);
  if (!node || node.kind !== 'agent') throw new Error('AI Agent node not found.');
  if (!node.active) throw new Error('AI Agent node is inactive.');
  const format = validateStructuredOutput(node.structuredOutput);
  if (!format.ok) throw new Error(format.error);
  const handoffData = { ...Object.fromEntries(document.nodes.filter(item => item.kind === 'agent-handoff' && item.active !== false && item.handoffMode === 'receive' && item.useTestDocument).map(item => [item.id, item.testDocument || ''])), ...liveHandoffs };
  const task = graphAgentTask(node, document, fallbackTask || (approvedOutput ? 'Continue the workflow using the approved output from the previous node.' : ''));
  const input = resolveGraphAgentInput(node.id, task, document.nodes, document.links, handoffData);
  if (!input.ok) throw new Error(input.error);
  if (approvedOutput.length > 99000) throw new Error('Approved output exceeds the next agent context limit.');
  const feedback = await getUnconsumedGraphFeedback(node.id);
  const message = feedback ? `${input.content}\n\nHuman review feedback for this revision:\n${feedback.feedback}` : input.content;
  const result = await runAgent('designer', message, approvedOutput ? `Upstream graph output:\n${approvedOutput}` : '', { outputSchema: format.schema, additionalInstructions: node.instructionPrompt, graphApprovedContext: Boolean(approvedOutput), graphInput: true });
  const content = JSON.stringify(JSON.parse(result.content) as unknown, null, 2);
  await saveDesignerGraphOutput(node.id, content);
  if (feedback) await markGraphFeedbackConsumed(feedback.id);
  return { node_id: node.id, run_id: randomUUID(), result: { ...result, content } };
}

export async function runGraphToNode(nodeId: string, liveHandoffs: Record<string, string> = {}) {
  const { document } = await getDesignerGraph();
  if (!document) throw new Error('Save the UI/UX graph before running a node.');
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
        const modelContext = previous.filter(item => item.node?.kind === 'agent' || item.node?.kind === 'human-approval' || item.node?.kind === 'agent-handoff' && item.node.handoffMode === 'send').map(item => `${item.node!.name}:\n${item.output}`).join('\n\n');
        const run = await runStoredGraphAgent(id, '', modelContext, liveHandoffs);
        output = run.result.content;
      } else if (node.kind === 'human-approval') {
        const approval = await getLatestGraphApproval(id);
        if (approval?.status !== 'pending') throw new Error(`${node.name} has no pending output. Connect an AI Agent and run again.`);
        output = approval.output;
        waitingForApproval = true;
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
      if (id === nodeId && node.kind !== 'agent' && node.kind !== 'human-approval' && output) await saveDesignerGraphOutput(id, output);
      completed.set(id, output);
      return output;
    } finally { visiting.delete(id); }
  }

  const output = await visit(nodeId);
  const node = nodeById.get(nodeId)!;
  return { node_id: nodeId, node_name: node.name, kind: node.kind, status: waitingForApproval ? 'waiting_approval' : 'complete', output };
}
