import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { executionGraph, graphRunIncomingLinks, runGraphToNode, validateDesignerGraph } from '../lib/server/designer-graph';
import { resolveConnectedInput } from '../lib/context-tags';
import { MAX_ZOOM, MIN_ZOOM, canvasPoint, fitViewport, zoomAt } from '../lib/canvas-viewport';

function graph() {
  const base = { x: 0, y: 0, active: true, contextText: '', contextFiles: [], contextTags: [], taskText: '', instructionPrompt: '', testDocument: '', useTestDocument: false };
  return validateDesignerGraph({
    nodes: [
      { ...base, id: 'source', number: 1, name: 'Inactive agent', kind: 'agent', active: false },
      { ...base, id: 'context', number: 2, name: 'Context', kind: 'context', contextText: 'Current context', contextTags: [{ id: 'tag', name: 'Design', kind: 'text', text: 'Do not inject this.', fileId: null }] },
      { ...base, id: 'reader', number: 3, name: 'Reader', kind: 'repo-reader' },
      { ...base, id: 'approval', number: 4, name: 'Approval', kind: 'human-approval' },
    ],
    links: [{ source: 'source', target: 'context', command: 'input' }, { source: 'context', target: 'reader', command: 'input' }, { source: 'context', target: 'approval', command: 'input' }],
    screenContextsSeeded: false, screenContextVersion: 0, repoReaderSeeded: true,
  });
}

void test('Upgrading edges persist for display, including incoming reader edges, but never become execution dependencies', () => {
  const saved = graph();
  assert.equal(saved.links.length, 3);
  assert.equal(saved.linkMode, 'visual');
  assert.deepEqual(graphRunIncomingLinks(saved, 'reader'), []);
  assert.deepEqual(graphRunIncomingLinks(saved, 'context'), []);
  const runtime = executionGraph(saved);
  const result = resolveConnectedInput('reader', 'Use /Design/', runtime.nodes, runtime.links);
  assert.equal(result.ok, false);
  assert.equal(saved.links.length, 3);
});

void test('visual cycles are harmless while broken node references are still rejected', () => {
  const saved = graph();
  saved.links.push({ source: 'reader', target: 'context', command: 'input' });
  assert.equal(validateDesignerGraph(saved).links.length, 4);
  assert.deepEqual(executionGraph(saved).links, []);
  assert.throws(() => validateDesignerGraph({ ...saved, links: [{ source: 'missing', target: 'reader', command: 'input' }] }), /invalid link/);
});

void test('existing executable graphs retain their input and approval dependencies', () => {
  const saved = graph();
  const runtime = validateDesignerGraph({ ...saved, repoReaderSeeded: false, linkMode: undefined, links: [{ source: 'source', target: 'context', command: 'input' }] });
  assert.equal(executionGraph(runtime), runtime);
  assert.equal(graphRunIncomingLinks(runtime, 'context')[0].source, 'source');
});

void test('Play in a visual graph neither visits inactive upstream nodes nor submits connected approvals', async () => {
  const db = globalThis as typeof globalThis & { toolhubPool?: Pool };
  const previous = { pool: db.toolhubPool, url: process.env.DATABASE_URL, fetch: globalThis.fetch };
  const saved = graph(), statements: string[] = [];
  const query = async (sql: string) => {
    statements.push(sql);
    if (sql.includes('SELECT document')) return { rows: [{ document: saved, revision: '1' }] };
    return { rows: [] };
  };
  db.toolhubPool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  process.env.DATABASE_URL = 'mock-only';
  globalThis.fetch = async () => { throw new Error('No upstream model or network should run.'); };
  try {
    const output = await runGraphToNode('context', {}, 'developer');
    assert.equal(output.output, 'Current context');
    assert.equal(output.status, 'complete');
    assert.equal(statements.some(sql => sql.startsWith('INSERT INTO designer_graph_approvals')), false);
    assert.equal(statements.some(sql => sql.startsWith('INSERT INTO designer_graph_outputs')), true);
  } finally {
    db.toolhubPool = previous.pool; globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
  }
});

void test('connection coordinates remain on the same canvas point after anchored zoom and panning', () => {
  const before = { x: 140, y: -60, zoom: 1 };
  const pointer = { x: 420, y: 250 };
  const world = canvasPoint(before, pointer);
  const zoomed = zoomAt(before, 1.5, pointer);
  assert.deepEqual(canvasPoint(zoomed, pointer), world);
  const screen = { x: zoomed.x + 312 * zoomed.zoom, y: zoomed.y + 96 * zoomed.zoom };
  assert.deepEqual(canvasPoint(zoomed, screen), { x: 312, y: 96 });
  assert.equal(zoomAt(before, 100, pointer).zoom, MAX_ZOOM);
  assert.equal(zoomAt(before, 0.001, pointer).zoom, MIN_ZOOM);
});

void test('Fit keeps graph bounds visible in the area above the chat', () => {
  const bounds = { x: 80, y: 100, width: 800, height: 260 };
  const size = { width: 1000, height: 600 };
  const view = fitViewport(bounds, size);
  assert.ok(view.x + bounds.x * view.zoom >= 0);
  assert.ok(view.x + (bounds.x + bounds.width) * view.zoom <= size.width);
  assert.ok(view.y + (bounds.y + bounds.height) * view.zoom <= size.height);
});
