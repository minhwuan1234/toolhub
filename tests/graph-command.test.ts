import assert from 'node:assert/strict';
import { test } from 'node:test';
import { asksToRunDesignerGraph, designerGraphNodeForTestDocument } from '../lib/graph-command';
import type { DesignerGraphDocument } from '../lib/server/designer-graph';

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
  assert.throws(() => designerGraphNodeForTestDocument({ ...graph, links: [] }), /Connect an active/);
});
