import { timingSafeEqual } from 'node:crypto';
import { readLinkedInData } from './linkedin-data';

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
    {
      name: 'linkedin_connect_data',
      description: 'Đọc dữ liệu job và target của chức năng LinkedIn Connect.',
      inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, limit: { type: 'number', minimum: 1, maximum: 100 } }, additionalProperties: false },
    },
    {
      name: 'linkedin_acceptance_data',
      description: 'Đọc lịch sử kiểm tra acceptance của LinkedIn.',
      inputSchema: { type: 'object', properties: { job_id: { type: 'string' }, limit: { type: 'number', minimum: 1, maximum: 100 } }, additionalProperties: false },
    },
    {
      name: 'linkedin_message_data',
      description: 'Đọc dữ liệu message target và message batch của LinkedIn.',
      inputSchema: { type: 'object', properties: { limit: { type: 'number', minimum: 1, maximum: 100 } }, additionalProperties: false },
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
      instructions: 'MCP gateway trung tâm cho các tool được quản lý bởi Toolhub.',
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
    if (name === 'linkedin_connect_data' || name === 'linkedin_acceptance_data' || name === 'linkedin_message_data') {
      try {
        const data = await readLinkedInData(name, params.arguments && typeof params.arguments === 'object' ? params.arguments as Record<string, unknown> : {});
        return response(id, { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false });
      } catch (error) {
        return response(id, { content: [{ type: 'text', text: error instanceof Error ? error.message : 'LinkedIn database request failed.' }], isError: true });
      }
    }
    return response(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true });
  }

  return errorResponse(id, -32601, `Method not found: ${input.method}`);
}
