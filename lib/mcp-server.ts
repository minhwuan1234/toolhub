import { timingSafeEqual } from 'node:crypto';

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

const protocolVersion = '2025-06-18';

function response(id: JsonRpcResponse['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id: JsonRpcResponse['id'], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function tokenMatches(value: string | null): boolean {
  const expected = process.env.MCP_SERVER_TOKEN;
  if (!expected || !value) return false;
  const received = Buffer.from(value);
  const target = Buffer.from(expected);
  return received.length === target.length && timingSafeEqual(received, target);
}

export function isMcpAuthorized(request: Request): boolean {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
  return tokenMatches(token);
}

function tools() {
  return [
    {
      name: 'toolhub_health',
      description: 'Kiểm tra MCP Server trung tâm của Toolhub.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'toolhub_list_departments',
      description: 'Lấy danh sách department hiện có trong Toolhub.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ];
}

export async function handleMcpRequest(input: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = input.id ?? null;
  if (input.jsonrpc !== '2.0' || !input.method) return errorResponse(id, -32600, 'Invalid JSON-RPC request.');

  if (input.method === 'notifications/initialized' || input.method === 'notifications/cancelled') return null;

  if (input.method === 'initialize') {
    return response(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'toolhub-mcp', version: '0.1.0' },
      instructions: 'MCP gateway của Toolhub. Agent management is pending setup.',
    });
  }

  if (input.method === 'ping') return response(id, {});
  if (input.method === 'tools/list') return response(id, { tools: tools() });

  if (input.method === 'tools/call') {
    const params = input.params ?? {};
    const name = typeof params.name === 'string' ? params.name : '';
    if (name === 'toolhub_health') {
      return response(id, { content: [{ type: 'text', text: JSON.stringify({ status: 'ok', service: 'toolhub-mcp' }) }], isError: false });
    }
    if (name === 'toolhub_list_departments') {
      return response(id, { content: [{ type: 'text', text: JSON.stringify(['Account', 'Business Development', 'Production', 'Project Management', 'HR', 'Andy Tran', 'Marketing']) }], isError: false });
    }
    return response(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true });
  }

  return errorResponse(id, -32601, `Method not found: ${input.method}`);
}
