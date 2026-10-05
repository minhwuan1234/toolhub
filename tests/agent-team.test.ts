import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMcpRequest, isMcpAuthorized } from '../lib/mcp-server';

test('MCP lists exactly three agents and exposes control tools', async () => {
  const list = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const tools = (list?.result as { tools: Array<{ name: string }> }).tools;
  assert.deepEqual(tools.filter(tool => tool.name.startsWith('agent_')).map(tool => tool.name), ['agent_team_list', 'agent_run', 'agent_team_run']);
  const team = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'agent_team_list' } });
  const payload = (team?.result as { structuredContent: { agents: Array<{ id: string }> } }).structuredContent;
  assert.deepEqual(payload.agents.map(agent => agent.id), ['ba', 'designer', 'developer']);
});

test('MCP team run passes each completed handoff to the next agent', async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-key';
  const inputs: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { input: string; store: boolean };
    inputs.push(body.input);
    assert.equal(body.store, false);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: `Result ${inputs.length}` }] }] });
  };
  try {
    const response = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'agent_team_run', arguments: { message: 'Design a task flow' } } });
    const result = response?.result as { isError: boolean; structuredContent: { results: Array<{ agentId: string; content: string }> } };
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent.results.map(item => item.agentId), ['ba', 'designer', 'developer']);
    assert.equal(inputs.length, 3);
    assert.match(inputs[1], /Result 1/);
    assert.match(inputs[2], /Result 1/);
    assert.match(inputs[2], /Result 2/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});

test('external MCP requests require the configured bearer token', () => {
  const previous = process.env.MCP_SERVER_TOKEN;
  process.env.MCP_SERVER_TOKEN = 'test-token';
  try {
    assert.equal(isMcpAuthorized(new Request('https://example.test/api/mcp')), false);
    assert.equal(isMcpAuthorized(new Request('https://example.test/api/mcp', { headers: { Authorization: 'Bearer wrong' } })), false);
    assert.equal(isMcpAuthorized(new Request('https://example.test/api/mcp', { headers: { Authorization: 'Bearer test-token' } })), true);
  } finally {
    if (previous === undefined) delete process.env.MCP_SERVER_TOKEN;
    else process.env.MCP_SERVER_TOKEN = previous;
  }
});
