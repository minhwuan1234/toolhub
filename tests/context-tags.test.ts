import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConnectedTagRegistry, buildTagRegistry, resolveConnectedInput, resolveContextText, resolveGraphAgentInput, resolveTag, type ContextTagSource } from '../lib/context-tags';

const source = (text: string, name = 'Design'): ContextTagSource => ({
  id: 'context-1', kind: 'context', contextFiles: [],
  contextTags: [{ id: 'tag-1', name, kind: 'text', text, fileId: null }],
});

test('a slash reference resolves current saved tag content without copying it into the editor', () => {
  const registry = buildTagRegistry([source('Use the existing spacing scale.')]);
  assert.deepEqual(resolveTag('design', registry), { ok: true, content: 'Use the existing spacing scale.' });
  assert.deepEqual(resolveContextText('Review /Design/ before drawing the screen.', registry), {
    ok: true, content: 'Review Use the existing spacing scale. before drawing the screen.',
  });
  assert.deepEqual(resolveContextText('/Design/ *Use the existing spacing scale*\nApply /Design/.', registry), {
    ok: true, content: 'Use the existing spacing scale.\nApply Use the existing spacing scale..',
  });
});

test('file tags resolve extracted file text', () => {
  const registry = buildTagRegistry([{
    id: 'context-2', kind: 'context',
    contextFiles: [{ id: 'file-1', name: 'DESIGN.md', content: 'Typography and layout rules' }],
    contextTags: [{ id: 'tag-2', name: 'Guidelines', kind: 'file', text: '', fileId: 'file-1' }],
  }]);
  assert.deepEqual(resolveContextText('Read /Guidelines/', registry), { ok: true, content: 'Read Typography and layout rules' });
});

test('missing and conflicting definitions fail instead of silently inserting the wrong content', () => {
  const registry = buildTagRegistry([source('First'), { ...source('Second'), id: 'context-2' }]);
  const conflicting = resolveTag('Design', registry);
  const missing = resolveContextText('Use /Missing/', registry);
  assert.equal(conflicting.ok, false);
  assert.equal(missing.ok, false);
  if (!conflicting.ok && !missing.ok) {
    assert.match(conflicting.error, /conflicting/);
    assert.match(missing.error, /no saved content/);
  }
});

test('a connected context grants access without automatically injecting all of its tags', () => {
  const nodes = [source('Use blue.', 'Color'), { ...source('Use Inter.', 'Type'), id: 'context-2' }];
  const links = [{ source: 'context-1', target: 'node-3', command: 'input' }, { source: 'context-2', target: 'node-3', command: 'input' }];
  assert.deepEqual(resolveConnectedInput('node-3', 'Make a screen.', nodes, links), { ok: true, content: 'Make a screen.' });
  assert.deepEqual(resolveConnectedInput('node-3', 'Use /Color/ only.', nodes, links), { ok: true, content: 'Use Use blue. only.' });
  assert.deepEqual(resolveConnectedInput('node-3', 'Use /Type/ and /Color/.', nodes, links), { ok: true, content: 'Use Use Inter. and Use blue..' });
  assert.deepEqual([...buildConnectedTagRegistry('node-3', nodes, links).definitions.keys()], ['color', 'type']);
});

test('an unconnected or inactive context cannot provide a tag', () => {
  const nodes = [source('Use blue.', 'Color'), { ...source('Use Inter.', 'Type'), id: 'context-2', active: false }];
  const links = [{ source: 'context-1', target: 'another-node', command: 'input' }, { source: 'context-2', target: 'node-3', command: 'input' }];
  const result = resolveConnectedInput('node-3', 'Use /Color/ and /Type/.', nodes, links);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /no saved content/);
});

test('connected file input includes only the referenced file tag', () => {
  const nodes: ContextTagSource[] = [{
    id: 'files', kind: 'context',
    contextFiles: [
      { id: 'design-file', name: 'DESIGN.md', content: 'Design rules' },
      { id: 'brief-file', name: 'brief.txt', content: 'Customer brief' },
    ],
    contextTags: [
      { id: 'design-tag', name: 'Design', kind: 'file', text: '', fileId: 'design-file' },
      { id: 'brief-tag', name: 'Brief', kind: 'file', text: '', fileId: 'brief-file' },
    ],
  }];
  const links = [{ source: 'files', target: 'node-3', command: 'input' }];
  assert.deepEqual(resolveConnectedInput('node-3', 'Apply /Design/.', nodes, links), { ok: true, content: 'Apply Design rules.' });
});

test('AI Agent input follows a linked task with selected tags and an incoming handoff', () => {
  const nodes: ContextTagSource[] = [
    source('Use blue.', 'Color'),
    { ...source('Use Inter.', 'Type'), id: 'context-2' },
    { id: 'handoff', kind: 'agent-handoff', active: true, handoffMode: 'receive', contextFiles: [], contextTags: [] },
    { id: 'workflow', kind: 'workflow', active: true, taskText: 'Design a screen with /Color/.', contextFiles: [], contextTags: [] },
    { id: 'agent', kind: 'agent', active: true, contextFiles: [], contextTags: [] },
  ];
  const links = [
    { source: 'context-1', target: 'workflow', command: 'input' },
    { source: 'context-2', target: 'workflow', command: 'input' },
    { source: 'handoff', target: 'workflow', command: 'input' },
    { source: 'workflow', target: 'agent', command: 'input' },
  ];
  assert.deepEqual(resolveGraphAgentInput('agent', '', nodes, links, { handoff: 'BA brief' }), { ok: true, content: 'Design a screen with Use blue..\n\nBA brief' });
  assert.equal(resolveGraphAgentInput('another-agent', '', nodes, links).ok, false);
});

test('AI Agent Explicit input resolves only directly connected tags and receives a direct handoff', () => {
  const nodes: ContextTagSource[] = [
    source('Use blue.', 'Color'),
    { ...source('Use Inter.', 'Type'), id: 'context-2' },
    { id: 'handoff', kind: 'agent-handoff', active: true, handoffMode: 'receive', contextFiles: [], contextTags: [] },
  ];
  const links = [
    { source: 'context-1', target: 'agent', command: 'input' },
    { source: 'handoff', target: 'agent', command: 'input' },
  ];
  assert.deepEqual(resolveGraphAgentInput('agent', 'Create a screen with /Color/.', nodes, links, { handoff: 'BA brief' }), { ok: true, content: 'Create a screen with Use blue..\n\nBA brief' });
  assert.equal(resolveGraphAgentInput('agent', 'Use /Type/.', nodes, links).ok, false);
});
