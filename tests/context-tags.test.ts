import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTagRegistry, resolveContextText, resolveTag, type ContextTagSource } from '../lib/context-tags';

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
