import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { defaultAgentCards, validateAgentCard } from '../lib/agent-cards';
import { invokeMcpTool } from '../lib/mcp-server';

test('MCP discovers a saved custom card and runs its latest instructions with peer roles', async () => {
  const globalDatabase = globalThis as typeof globalThis & { toolhubPool?: Pool };
  const previous = { pool: globalDatabase.toolhubPool, url: process.env.DATABASE_URL, key: process.env.OPENAI_API_KEY, fetch: globalThis.fetch };
  const card = { ...defaultAgentCards[0], id: 'custom-2ec45a63-7193-4b5e-9f72-78cf933d3242', name: 'Research Agent', role: 'Researcher', mission: 'Compare customer solution options.' };
  let savedMission = card.mission;
  const query = async (sql: string) => {
    if (sql.includes('FROM agent_cards')) return { rows: [{ ...card, mission: savedMission, use_design_guidelines: false }] };
    if (sql.includes('SELECT spent_micro_usd, reserved_micro_usd')) return { rows: [{ spent_micro_usd: 0, reserved_micro_usd: 0 }] };
    if (sql.includes('DELETE FROM agent_api_spend_reservations WHERE id')) return { rows: [{ reserved_micro_usd: 1000 }] };
    return { rows: [] };
  };
  globalDatabase.toolhubPool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  process.env.DATABASE_URL = 'mock-only';
  process.env.OPENAI_API_KEY = 'mock-key';
  const requests: Array<{ instructions: string; input: string }> = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ output: [{ content: [{ type: 'output_text', text: 'Research result' }] }] });
  };
  try {
    const listing = await invokeMcpTool('agent_team_list');
    const cards = listing.structuredContent?.cards as Array<{ id: string }>;
    assert.ok(cards.some(item => item.id === card.id));
    savedMission = 'Validate a revised customer requirement.';
    const result = await invokeMcpTool('agent_run', { agent_id: card.id, message: 'Review the signup flow' });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent?.result, { agentId: card.id, name: card.name, content: 'Research result' });
    assert.match(requests[0].instructions, /Validate a revised customer requirement/);
    assert.match(requests[0].instructions, /UI\/UX Designer/);
    assert.doesNotMatch(requests[0].instructions, /Responsibilities:|Expected inputs:|Expected outputs:|Collaboration:/);
    const unknown = await invokeMcpTool('agent_run', { agent_id: 'custom-ffffffff-ffff-ffff-ffff-ffffffffffff', message: 'Review the signup flow' });
    assert.equal(unknown.isError, true);
    assert.equal(requests.length, 1, 'Unknown cards must not trigger model requests');
    await invokeMcpTool('agent_run', { agent_id: 'designer', message: 'Review the signup flow' });
    assert.match(requests[1].instructions, /Current Toolhub DESIGN.md guidance/);
    assert.doesNotMatch(requests[1].instructions, /Historical LinkedIn Daily Scanner design draft/);
  } finally {
    globalDatabase.toolhubPool = previous.pool;
    globalThis.fetch = previous.fetch;
    if (previous.url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
  }
});

test('Agent cards require core fields and accept omitted legacy fields', () => {
  assert.throws(() => validateAgentCard({ ...defaultAgentCards[0], id: 'arbitrary-id' }), /Invalid/);
  assert.throws(() => validateAgentCard({ ...defaultAgentCards[0], mission: '   ' }), /mission/);
  assert.throws(() => validateAgentCard({ ...defaultAgentCards[0], x: Infinity }), /position/);
  const { responsibilities: _responsibilities, inputs: _inputs, outputs: _outputs, collaboration: _collaboration, ...withoutRemovedFields } = defaultAgentCards[0];
  const card = validateAgentCard(withoutRemovedFields);
  assert.equal(card.responsibilities, '');
  assert.equal(card.inputs, '');
  assert.equal(card.outputs, '');
  assert.equal(card.collaboration, '');
});
