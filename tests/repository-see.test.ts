import assert from 'node:assert/strict';
import { test } from 'node:test';
import { astLayers, dependencyGraph, ruleClassifier, layerAssignment } from '../lib/repository-see';
import type { SeeSymbol, LayerRule, SeeEdge } from '../lib/see-contract';
import { seedRepositoryReader, seedThinkNode, seedSeeNodes, validateDesignerGraph } from '../lib/server/designer-graph';
const metadata = { run_id: 'run-1', source_node_id: 'reader', repository: 'test/repo', commit: 'abc123', tool_id: 'tool', coverage: 'complete' };
const sources = [
  { path: 'frontend/Connect.tsx', content: `import { send } from './api'; export function Connect() { return <button onClick={() => send()}>Connect</button>; }` },
  { path: 'frontend/api.ts', content: `export function send() { return fetch('/api/connect', {method:'POST'}); }` },
  { path: 'app/api/connect/route.ts', content: `import { create } from '../../../services/connect'; export function POST() { return create(); }` },
  { path: 'services/connect.ts', content: `export function create() { if (allowed) return db.from('invitations').select('id'); return null; }` },
  { path: 'schema.sql', content: `CREATE TABLE invitations (id uuid);` },
  { path: 'utility.ts', content: `export function ambiguous() { return 1; }` },
];
void test('See stages follow real imports, calls and HTTP routes and assign per-function layers', () => {
  const ast = astLayers(sources, 'connect', metadata);
  assert.ok((ast.items as SeeSymbol[]).some(item => item.name === 'Connect' && item.parser === 'typescript-ast'));
  const graph = dependencyGraph(ast);
  const edges = graph.items as SeeEdge[];
  assert.ok(edges.some(edge => edge.relation === 'calls' && edge.evidence === 'send'));
  assert.ok(edges.some(edge => edge.relation === 'http' && edge.evidence === 'POST /api/connect'));
  const rules = ruleClassifier(graph);
  const assigned = layerAssignment(rules);
  const rows = assigned.items as Array<LayerRule & { layer: string }>;
  assert.equal(rows.find(row => row.name === 'Connect')?.layer, 'presentation');
  assert.equal(rows.find(row => row.name === 'create')?.layer, 'mixed');
  assert.deepEqual(rows.find(row => row.name === 'create')?.candidates, ['database', 'business_logic']);
  assert.equal(rows.find(row => row.path === 'schema.sql')?.layer, 'database');
  assert.equal(rows.find(row => row.name === 'ambiguous')?.layer, 'unknown');
  for (const stage of [ast, graph, rules, assigned]) { assert.equal(stage.model_calls, 0); assert.equal(stage.run_id, metadata.run_id); assert.equal(stage.commit, metadata.commit); }
});
void test('classifier does not classify from names or comments alone', () => {
  const ast = astLayers([{ path: 'database.ts', content: `// db.from('fake'); document.createElement('button');\nfunction presentation() { return "db.from('also_fake')"; }` }], '', metadata);
  const assigned = layerAssignment(ruleClassifier(dependencyGraph(ast)));
  assert.ok((assigned.items as Array<{ layer: string }>).every(item => item.layer === 'unknown'));
});
void test('See does not invent target functions for ambiguous imports and flags unresolved routes', () => {
  const ast = astLayers([{ path: 'page.ts', content: `import Other from './missing'; function one() { return fetch('/missing'); }` }], '', metadata);
  const graph = dependencyGraph(ast);
  assert.ok(graph.unresolved?.some(item => item.includes('import ./missing')));
  assert.ok(graph.unresolved?.some(item => item.includes('API GET /missing')));
  assert.deepEqual(graph.items, []);
  assert.throws(() => ruleClassifier(ast), /requires Dependency Graph/);
});
void test('four See nodes migrate once and connect the reader to Think without duplicating user nodes', () => {
  const original = seedThinkNode(seedRepositoryReader(null, 'developer', ['tool']), 'developer');
  const graph = seedSeeNodes(original, 'developer');
  assert.equal(graph.nodes.length, 6);
  assert.equal(graph.links.length, 5);
  assert.equal(graph.links[0].source, original.nodes[0].id);
  assert.equal(graph.links[4].target, original.nodes[1].id);
  assert.equal(validateDesignerGraph(graph).seeSeeded, true);
  assert.deepEqual(seedSeeNodes(graph, 'developer'), graph);
  assert.throws(() => validateDesignerGraph({ ...graph, nodes: graph.nodes.map(node => node.kind === 'ast-layers' ? { ...node, seeSourceId: 'foreign' } : node) }), /repository source/);
});
void test('large snapshots report bounded analysis rather than claiming complete coverage', () => {
  const ast = astLayers(Array.from({ length: 110 }, (_, index) => ({ path: `file${index}.ts`, content: `function a${index}() { return 1; }` })), '', metadata);
  assert.equal(ast.truncated, true);
  const assigned = layerAssignment(ruleClassifier(dependencyGraph(ast)));
  assert.equal(assigned.truncated, true);
  assert.ok(JSON.stringify(assigned).length <= 170000);
});

void test('vanilla JavaScript DOM rendering is presentation without relying on frontend filenames', () => {
  const ast = astLayers([{ path: 'app.js', content: `function renderConnect() { list.innerHTML = '<button>Connect</button>'; }` }], 'connect', metadata);
  const assigned = layerAssignment(ruleClassifier(dependencyGraph(ast)));
  assert.equal((assigned.items as Array<LayerRule & { layer: string }>).find(item => item.name === 'renderConnect')?.layer, 'presentation');
});

void test('unsupported fetched sources and syntax diagnostics affect AST coverage, not file loading', () => {
  const ast = astLayers([{ path: 'worker.go', content: 'package main' }, { path: 'broken.ts', content: 'function broken(' }], '', metadata);
  assert.equal(ast.coverage, 'partial');
  assert.ok(ast.notes.some(note => note.includes('syntax errors')));
  assert.ok(ast.notes.some(note => note.includes('no AST adapter')));
});

function classifySources(files: Record<string, string>) {
  const ast = astLayers(Object.entries(files).map(([path, content]) => ({ path, content })), '', metadata);
  const graph = dependencyGraph(ast);
  return layerAssignment(ruleClassifier(graph)).items as Array<LayerRule & { layer: string }>;
}

void test('resolved calls identify database wrappers and business orchestration outside conventional folders', () => {
  const rows = classifySources({
    'store.ts': `export function loadRows() { return db.from('contacts').select('id'); }`,
    'bridge.ts': `import { loadRows } from './store'; export function forwardRows() { return loadRows(); }`,
    'main.ts': `import { forwardRows } from './bridge'; export function processRequest(allowed) { if (allowed) return forwardRows(); return []; }`,
  });
  const wrapper = rows.find(row => row.name === 'forwardRows')!;
  assert.equal(wrapper.layer, 'database');
  assert.equal(wrapper.basis, 'dependency');
  assert.equal(wrapper.confidence, 'medium');
  assert.match(wrapper.evidence.join(' '), /store.ts:1 loadRows/);
  assert.equal(rows.find(row => row.name === 'processRequest')?.layer, 'business_logic');
});

void test('helper called by presentation and business is shared utility, not incorrectly mixed', () => {
  const rows = classifySources({
    'helpers.ts': `export function normalize(value) { return value.trim().toLowerCase(); }`,
    'Screen.tsx': `import { normalize } from './helpers'; export function Screen() { return <span>{normalize('hello')}</span>; }`,
    'app/api/name/route.ts': `import { normalize } from '../../../helpers'; export function POST() { return normalize('hello'); }`,
  });
  const helper = rows.find(row => row.name === 'normalize')!;
  assert.equal(helper.layer, 'shared_utility');
  assert.equal(helper.basis, 'utility');
  assert.match(helper.evidence.join(' '), /presentation.*business_logic|business_logic.*presentation/);
  assert.ok(!helper.unknown_reason);
});

void test('pure helper used exclusively by UI receives a medium-confidence presentation context', () => {
  const rows = classifySources({
    'helpers.ts': `export function label(value) { return String(value).trim(); }`,
    'Screen.tsx': `import { label } from './helpers'; export function Screen() { return <span>{label('name')}</span>; }`,
  });
  const helper = rows.find(row => row.name === 'label')!;
  assert.equal(helper.layer, 'presentation');
  assert.equal(helper.basis, 'dependency');
  assert.equal(helper.confidence, 'medium');
});

void test('import-only relationships and effects never turn arbitrary helpers into database or utility code', () => {
  const rows = classifySources({
    'helpers.ts': `export function helper(value) { return value; } export function effects() { return fetch('/send').then(result => String(result)); }`,
    'store.ts': `import { helper, effects } from './helpers'; export function loadRows() { return db.from('contacts').select('id'); }`,
  });
  for (const name of ['helper', 'effects']) {
    const helper = rows.find(row => row.name === name)!;
    assert.equal(helper.layer, 'unknown');
    assert.ok(helper.unknown_reason);
  }
});

void test('unseeded call cycles stay unknown with a reason instead of reinforcing a guessed label', () => {
  const rows = classifySources({ 'cycle.ts': `function first() { return second(); } function second() { return first(); }` });
  for (const name of ['first', 'second']) {
    const row = rows.find(row => row.name === name)!;
    assert.equal(row.layer, 'unknown');
    assert.match(row.unknown_reason!, /mixed or unresolved roles/);
  }
});

void test('default imports and Python self methods resolve to their actual function definitions', () => {
  const ast = astLayers([
    { path: 'helper.ts', content: `export default function normalize(value) { return value.trim(); }` },
    { path: 'Screen.tsx', content: `import label from './helper'; export function Screen() { return <span>{label('name')}</span>; }` },
    { path: 'worker.py', content: `class Client:\n    def load(self):\n        return db.table('items').select('id')\n    def forward(self):\n        return self.load()\n` },
  ], '', metadata);
  const graph = dependencyGraph(ast);
  const edges = graph.items as SeeEdge[];
  assert.ok(edges.some(edge => edge.relation === 'calls' && edge.evidence === 'label' && edge.target.includes(':normalize')));
  assert.ok(edges.some(edge => edge.relation === 'calls' && edge.evidence === 'self.load' && edge.target.includes('Client.load')));
  const rows = layerAssignment(ruleClassifier(graph)).items as Array<LayerRule & { layer: string }>;
  assert.equal(rows.find(row => row.name === 'Client.forward')?.layer, 'database');
});

void test('SQL cursor execute calls classify as database without requiring a from/table pattern', () => {
  const rows = classifySources({ 'connection.ts': `export function load() { return cursor.execute('SELECT id FROM contacts'); }` });
  assert.equal(rows.find(row => row.name === 'load')?.layer, 'database');
});
