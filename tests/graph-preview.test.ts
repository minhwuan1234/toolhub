import assert from 'node:assert/strict';
import { test } from 'node:test';
import { graphPreviewDocument } from '../lib/graph-preview';

void test('preview combines HTML, CSS and JS while isolating the document', () => {
  const page = graphPreviewDocument({
    html: '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head><body><button id="go">Go</button></body></html>',
    css: 'button { color: red; }',
    js: 'document.querySelector("#go").textContent = "Ready";',
  });
  assert.match(page, /Content-Security-Policy/);
  assert.match(page, /connect-src 'none'/);
  assert.match(page, /<style>button \{ color: red; \}<\/style>/);
  assert.match(page, /<script>document\.querySelector/);
  assert.equal(page.includes('href="styles.css"'), false);
});
