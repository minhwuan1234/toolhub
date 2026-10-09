import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveGraphAgentInput } from '../lib/context-tags';
import { validateDesignerGraph } from '../lib/server/designer-graph';

const graph = {
  nodes: [
    { id: 'context-1', kind: 'context', x: 0, y: 0, active: true, contextFiles: [], contextTags: [{ id: 'tag-1', name: 'Color.Primary', kind: 'text', text: '#123456', fileId: null }] },
    { id: 'context-2', kind: 'context', x: 0, y: 100, active: true, contextFiles: [], contextTags: [{ id: 'tag-2', name: 'Secret', kind: 'text', text: 'do not include', fileId: null }] },
    { id: 'agent-1', kind: 'agent', x: 100, y: 0, active: true, contextFiles: [], contextTags: [] },
  ],
  links: [{ id: 'link-1', source: 'context-1', target: 'agent-1', command: 'input' }],
  screenContextsSeeded: false,
  screenContextVersion: 0,
};

void test('saved graph keeps connected tags available to MCP runs without injecting unrelated context', () => {
  const saved = validateDesignerGraph(graph);
  const result = resolveGraphAgentInput('agent-1', 'Use /Color.Primary/ for the button.', saved.nodes, saved.links);
  assert.deepEqual(result, { ok: true, content: 'Use #123456 for the button.' });
  const unrelated = resolveGraphAgentInput('agent-1', 'Use /Secret/.', saved.nodes, saved.links);
  assert.equal(unrelated.ok, false);
});

void test('saved graph rejects broken links and duplicate node IDs', () => {
  assert.throws(() => validateDesignerGraph({ ...graph, links: [{ source: 'missing', target: 'agent-1', command: 'input' }] }), /invalid link/);
  assert.throws(() => validateDesignerGraph({ ...graph, nodes: [...graph.nodes, graph.nodes[0]] }), /duplicate node IDs/);
});

void test('Human Approval keeps separate Approve and Deny connections', () => {
  const nodes = [
    ...graph.nodes,
    { ...graph.nodes[2], id: 'approval', kind: 'human-approval', x: 200 },
  ];
  const links = [
    { id: 'approve', source: 'approval', target: 'agent-1', command: 'approve' },
    { id: 'deny', source: 'approval', target: 'agent-1', command: 'deny' },
  ];
  assert.deepEqual(validateDesignerGraph({ ...graph, nodes, links }).links, links);
  assert.throws(() => validateDesignerGraph({ ...graph, nodes, links: [{ ...links[0], source: 'context-1' }] }), /invalid link/);
});
