import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { defaultAgentCards } from '../lib/agent-cards';
import { runAgent } from '../lib/agent-team';
import { executeAgentFunction } from '../lib/server/agent-tool-runtime';

test('only a granted agent receives and executes an imported tool, and revocation takes effect immediately', async () => {
  const globalDatabase = globalThis as typeof globalThis & { toolhubPool?: Pool };
  const previous = { pool: globalDatabase.toolhubPool, url: process.env.DATABASE_URL, key: process.env.OPENAI_API_KEY, pat: process.env.LINKEDIN_SCANNER_PAT, fetch: globalThis.fetch };
  let granted = true;
  let imported = true;
  let modelCalls = 0;
  let githubCalls = 0;
  const card = { ...defaultAgentCards[0], tool_ids: ['linkedin-scanner'], use_design_guidelines: false };
  const query = async (sql: string) => {
    if (sql.includes('FROM agent_cards')) return { rows: [{ ...card, tool_ids: granted ? ['linkedin-scanner'] : [] }] };
    if (sql.includes('FROM imported_tools')) return { rows: imported ? [{ id: 'linkedin-scanner' }] : [] };
    if (sql.includes('SELECT spent_micro_usd, reserved_micro_usd')) return { rows: [{ spent_micro_usd: 0, reserved_micro_usd: 0 }] };
    if (sql.includes('DELETE FROM agent_api_spend_reservations WHERE id')) return { rows: [{ reserved_micro_usd: 1000 }] };
    return { rows: [] };
  };
  globalDatabase.toolhubPool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  process.env.DATABASE_URL = 'mock-only';
  process.env.OPENAI_API_KEY = 'mock-openai-key';
  process.env.LINKEDIN_SCANNER_PAT = 'mock-github-key';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes('api.github.com')) {
      githubCalls++;
      return Response.json({ type: 'file', encoding: 'base64', sha: 'file-sha', content: Buffer.from('file data').toString('base64') });
    }
    assert.equal(url, 'https://api.openai.com/v1/responses');
    modelCalls++;
    const request = JSON.parse(String(init?.body)) as { tools?: Array<{ name: string }>; input: unknown[] };
    assert.ok(request.tools?.some(tool => tool.name === 'scanner_read_file'));
    if (modelCalls === 1) return Response.json({ output: [{ type: 'function_call', call_id: 'call-1', name: 'scanner_read_file', arguments: '{"path":"app/settings.py"}' }] });
    assert.ok(request.input.some(item => (item as { type?: string }).type === 'function_call_output'));
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'I read the file.' }] }] });
  };
  try {
    assert.equal((await runAgent('ba', 'Read the scanner settings')).content, 'I read the file.');
    assert.equal(modelCalls, 2);
    assert.equal(githubCalls, 1);
    granted = false;
    await assert.rejects(() => executeAgentFunction('ba', 'scanner_read_file', { path: 'app/settings.py' }), /not granted|revoked/);
    imported = false;
    assert.equal(githubCalls, 1);
  } finally {
    globalDatabase.toolhubPool = previous.pool;
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
    if (previous.pat === undefined) delete process.env.LINKEDIN_SCANNER_PAT; else process.env.LINKEDIN_SCANNER_PAT = previous.pat;
  }
});
