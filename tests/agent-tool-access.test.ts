import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { defaultAgentCards } from '../lib/agent-cards';
import { runAgent } from '../lib/agent-team';
import { executeAgentFunction } from '../lib/server/agent-tool-runtime';

void test('only a granted agent receives and executes an imported tool, and revocation takes effect immediately', async () => {
  const globalDatabase = globalThis as typeof globalThis & { toolhubPool?: Pool };
  const previous = { pool: globalDatabase.toolhubPool, url: process.env.DATABASE_URL, key: process.env.OPENAI_API_KEY, pat: process.env.LINKEDIN_SCANNER_PAT, supabaseUrl: process.env.LINKEDIN_SCANNER_SUPABASE_URL, supabaseKey: process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY, fetch: globalThis.fetch };
  let granted = true;
  let imported = true;
  let modelCalls = 0;
  let githubCalls = 0;
  let failDiscovery = false;
  let budgetRun = false;
  let budgetRounds = 0;
  let directRun = false;
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
  process.env.LINKEDIN_SCANNER_SUPABASE_URL = 'https://scanner.supabase.co';
  process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = 'mock-supabase-key';
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('scanner.supabase.co')) return Response.json({ code: 'PGRST301', message: 'Invalid API key' }, { status: 401 });
    if (url.includes('api.github.com')) {
      githubCalls++;
      if (url.endsWith('/contents/')) return Response.json([{ type: 'file', path: 'README.md', sha: 'root-sha' }]);
      if (url.endsWith('/contents/app')) return Response.json([{ type: 'file', path: 'app/settings.py', sha: 'file-sha' }]);
      return Response.json({ type: 'file', encoding: 'base64', sha: 'file-sha', content: Buffer.from('file data').toString('base64') });
    }
    assert.equal(url, 'https://api.openai.com/v1/responses');
    modelCalls++;
    const request = JSON.parse(init?.body as string) as { tools?: Array<{ name: string }>; input: unknown[]; tool_choice?: string; parallel_tool_calls?: boolean };
    assert.ok(request.tools?.some(tool => tool.name === 'scanner_read_file'));
    assert.ok(request.tools?.some(tool => tool.name === 'scanner_list_tables'));
    assert.ok(request.tools?.some(tool => tool.name === 'scanner_sent_connects_today'));
    if (directRun) return Response.json({ output: [{ type: 'function_call', call_id: 'direct-1', name: 'scanner_sent_connects_today', arguments: '{}' }] });
    if (budgetRun) {
      assert.equal(request.parallel_tool_calls, false);
      if (request.tool_choice === 'none') {
        assert.equal(budgetRounds, 8);
        return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Finished from tool results.' }] }] });
      }
      assert.equal(request.tool_choice, 'auto');
      budgetRounds++;
      return Response.json({ output: [{ type: 'function_call', call_id: `budget-${budgetRounds}`, name: 'scanner_list_files', arguments: '{"path":""}' }] });
    }
    if (failDiscovery) {
      if (modelCalls === 4) return Response.json({ output: [{ type: 'function_call', call_id: 'call-3', name: 'scanner_list_tables', arguments: '{}' }] });
      assert.ok(request.input.some(item => JSON.stringify(item).includes('PGRST301')));
      return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"success":false,"message":"Connection failed"}' }] }] });
    }
    if (modelCalls === 1) return Response.json({ output: [{ type: 'function_call', call_id: 'call-1', name: 'scanner_read_file', arguments: '{"path":"app"}' }] });
    assert.ok(request.input.some(item => (item as { type?: string }).type === 'function_call_output'));
    if (modelCalls === 2) {
      assert.ok(request.input.some(item => JSON.stringify(item).includes('GitHub directory')));
      return Response.json({ output: [{ type: 'function_call', call_id: 'call-2', name: 'scanner_read_file', arguments: '{"path":"app/settings.py"}' }] });
    }
    return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'I read the file.' }] }] });
  };
  try {
    assert.equal((await runAgent('ba', 'Read the scanner settings')).content, 'I read the file.');
    assert.equal(modelCalls, 3);
    assert.equal(githubCalls, 2);
    failDiscovery = true;
    await assert.rejects(() => runAgent('ba', 'List sent Connect records'), /scanner_list_tables: Supabase table discovery failed \(HTTP 401, PGRST301\): Invalid API key/);
    failDiscovery = false;
    budgetRun = true;
    assert.equal((await runAgent('ba', 'Inspect scanner files')).content, 'Finished from tool results.');
    assert.equal(budgetRounds, 8);
    budgetRun = false;
    directRun = true;
    const beforeDirectRun = modelCalls;
    await assert.rejects(() => runAgent('ba', 'List Connects sent today'), /scanner_sent_connects_today: Supabase table request failed \(HTTP 401, PGRST301\): Invalid API key/);
    assert.equal(modelCalls, beforeDirectRun + 1);
    granted = false;
    await assert.rejects(() => executeAgentFunction('ba', 'scanner_read_file', { path: 'app/settings.py' }), /not granted|revoked/);
    imported = false;
    assert.equal(githubCalls, 10);
  } finally {
    globalDatabase.toolhubPool = previous.pool;
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
    if (previous.pat === undefined) delete process.env.LINKEDIN_SCANNER_PAT; else process.env.LINKEDIN_SCANNER_PAT = previous.pat;
    if (previous.supabaseUrl === undefined) delete process.env.LINKEDIN_SCANNER_SUPABASE_URL; else process.env.LINKEDIN_SCANNER_SUPABASE_URL = previous.supabaseUrl;
    if (previous.supabaseKey === undefined) delete process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY; else process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = previous.supabaseKey;
  }
});
