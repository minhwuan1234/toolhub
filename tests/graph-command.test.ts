import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asksToRunDesignerGraph, designerGraphNodeForTestDocument } from '../lib/graph-command';
import type { DesignerGraphDocument } from '../lib/server/designer-graph';
import { graphAgentTask } from '../lib/server/designer-graph';
import { resolveGraphAgentInput } from '../lib/context-tags';

void test('plain request for a UI/UX run from a Test document routes to the graph', () => {
  assert.equal(asksToRunDesignerGraph('Chạy agent UI/UX để thiết kế màn giao diện từ Test document trong Agent Handoff'), true);
  assert.equal(asksToRunDesignerGraph('Please run the UI/UX designer using the BA document'), true);
  assert.equal(asksToRunDesignerGraph('BA Agent, summarize this request'), false);
});

void test('graph command selects only an agent connected to the saved test handoff', () => {
  const graph = {
    nodes: [
      { id: 'handoff', kind: 'agent-handoff', active: true, handoffMode: 'receive', useTestDocument: true, testDocument: 'BA brief' },
      { id: 'agent', kind: 'agent', active: true },
      { id: 'other', kind: 'agent', active: true },
    ],
    links: [{ source: 'handoff', target: 'agent', command: 'input' }],
  } as DesignerGraphDocument;
  assert.equal(designerGraphNodeForTestDocument(graph), 'agent');
  const task = graphAgentTask({ ...graph.nodes[1], explicitInput: '' }, graph, 'Design from Test document');
  assert.equal(task, 'Design from Test document');
  assert.deepEqual(resolveGraphAgentInput('agent', task, graph.nodes.map(node => ({ ...node, contextFiles: [], contextTags: [] })), graph.links, { handoff: 'BA brief' }), { ok: true, content: 'Design from Test document\n\nBA brief' });
  assert.throws(() => designerGraphNodeForTestDocument({ ...graph, links: [] }), /Connect an active/);
});

void test('chat fallback includes only core style tags from connected Context Builder nodes', () => {
  const base = { number: 1, x: 0, y: 0, name: 'Test', active: true, contextText: '', testDocument: '', useTestDocument: false, instructionPrompt: '', explicitInput: '', structuredOutput: '', contextFiles: [], contextTags: [] };
  const graph: DesignerGraphDocument = {
    nodes: [
      { ...base, id: 'agent', kind: 'agent' },
      { ...base, id: 'colors', kind: 'context', contextTags: [{ id: 'tag', name: 'Color.Background', kind: 'text', text: '#ffffff', fileId: null }] },
      { ...base, id: 'unlinked', kind: 'context', contextTags: [{ id: 'tag-2', name: 'Type.Family', kind: 'text', text: 'wrong', fileId: null }] },
    ],
    links: [{ source: 'colors', target: 'agent', command: 'input' }],
    screenContextsSeeded: false,
    screenContextVersion: 0,
  };
  const task = graphAgentTask(graph.nodes[0], graph, 'Design the screen');
  assert.match(task, /\/Color\.Background\//);
  assert.equal(task.includes('/Type.Family/'), false);
  assert.deepEqual(resolveGraphAgentInput('agent', task, graph.nodes, graph.links), { ok: true, content: 'Design the screen\n\nUse these connected Toolhub design rules for the screen: #ffffff' });
});
