import { timingSafeEqual } from 'node:crypto';
import { agents, isAgentId, runAgent, type AgentResult } from './agent-team';

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
      description: 'Check the central Toolhub MCP server.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'toolhub_list_departments',
      description: 'List the departments currently stored in Toolhub.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'agent_team_list',
      description: 'List the three app design agents and whether the model is configured.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'agent_run',
      description: 'Send a request to one BA, UI/UX, or Developer agent.',
      inputSchema: { type: 'object', properties: { agent_id: { type: 'string', enum: ['ba', 'designer', 'developer'] }, message: { type: 'string', minLength: 3, maxLength: 4000 }, context: { type: 'string', maxLength: 12000 } }, required: ['agent_id', 'message'], additionalProperties: false },
    },
    {
      name: 'agent_team_run',
      description: 'Run BA, UI/UX, and Developer in sequence, passing each result to the next agent.',
      inputSchema: { type: 'object', properties: { message: { type: 'string', minLength: 3, maxLength: 4000 }, context: { type: 'string', maxLength: 12000 } }, required: ['message'], additionalProperties: false },
    },
    {
      name: 'agent_team_parallel_run',
      description: 'Run BA, UI/UX, and Developer at the same time on the same request. Use when agents can work independently without handoffs.',
      inputSchema: { type: 'object', properties: { message: { type: 'string', minLength: 3, maxLength: 4000 }, context: { type: 'string', maxLength: 12000 } }, required: ['message'], additionalProperties: false },
    },
    {
      name: 'agent_multi_run',
      description: 'Run up to six independent tasks concurrently across the BA, UI/UX, and Developer agents. Each task can have its own message and context; results include task IDs and partial failures.',
      inputSchema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array', minItems: 1, maxItems: 6,
            items: {
              type: 'object',
              properties: {
                task_id: { type: 'string', minLength: 1, maxLength: 64 },
                agent_id: { type: 'string', enum: ['ba', 'designer', 'developer'] },
                message: { type: 'string', minLength: 3, maxLength: 4000 },
                context: { type: 'string', maxLength: 12000 },
              },
              required: ['task_id', 'agent_id', 'message'],
              additionalProperties: false,
            },
          },
        },
        required: ['tasks'],
        additionalProperties: false,
      },
    },
  ];
}

type ToolResult = { content: Array<{ type: 'text'; text: string }>; structuredContent?: Record<string, unknown>; isError: boolean };

function toolResult(value: unknown, isError = false): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(value && typeof value === 'object' && !Array.isArray(value) ? { structuredContent: value as Record<string, unknown> } : {}), isError };
}

export async function invokeMcpTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  if (name === 'toolhub_health') return toolResult({ status: 'ok', service: 'toolhub-mcp' });
  if (name === 'toolhub_list_departments') return toolResult(['Account', 'Business Development', 'Production', 'Project Management', 'HR', 'Andy Tran', 'Marketing']);
  if (name === 'agent_team_list') return toolResult({ agents, configured: Boolean(process.env.OPENAI_API_KEY) });
  if (name === 'agent_team_parallel_run') {
    try {
      const message = args.message;
      const context = args.context === undefined ? '' : args.context;
      if (typeof message !== 'string') throw new Error('message must be a string.');
      if (typeof context !== 'string') throw new Error('context must be a string.');
      const results = await Promise.all(agents.map(async agent => {
        try {
          return { agent_id: agent.id, result: await runAgent(agent.id, message, context) };
        } catch (error) {
          return { agent_id: agent.id, error: error instanceof Error ? error.message : 'Agent request failed.' };
        }
      }));
      const failed_count = results.filter(result => 'error' in result).length;
      return toolResult({ results, completed_count: results.length - failed_count, failed_count }, failed_count > 0);
    } catch (error) {
      return toolResult({ error: error instanceof Error ? error.message : 'Parallel agent request failed.' }, true);
    }
  }
  if (name === 'agent_multi_run') {
    try {
      if (!Array.isArray(args.tasks) || args.tasks.length < 1 || args.tasks.length > 6) throw new Error('tasks must contain between 1 and 6 tasks.');
      const taskIds = new Set<string>();
      const tasks = args.tasks.map((value, index) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`tasks[${index}] must be an object.`);
        const task = value as Record<string, unknown>;
        if (typeof task.task_id !== 'string' || !task.task_id.trim() || task.task_id.length > 64) throw new Error(`tasks[${index}].task_id must be 1–64 characters.`);
        if (taskIds.has(task.task_id)) throw new Error(`Duplicate task_id: ${task.task_id}`);
        taskIds.add(task.task_id);
        if (!isAgentId(task.agent_id)) throw new Error(`tasks[${index}].agent_id must be ba, designer, or developer.`);
        if (typeof task.message !== 'string' || task.message.trim().length < 3 || task.message.length > 4000) throw new Error(`tasks[${index}].message must be 3–4,000 characters.`);
        if (task.context !== undefined && (typeof task.context !== 'string' || task.context.length > 12000)) throw new Error(`tasks[${index}].context must be at most 12,000 characters.`);
        return { task_id: task.task_id, agent_id: task.agent_id, message: task.message, context: typeof task.context === 'string' ? task.context : '' };
      });
      const results = await Promise.all(tasks.map(async task => {
        try {
          return { task_id: task.task_id, agent_id: task.agent_id, result: await runAgent(task.agent_id, task.message, task.context) };
        } catch (error) {
          return { task_id: task.task_id, agent_id: task.agent_id, error: error instanceof Error ? error.message : 'Agent request failed.' };
        }
      }));
      const failed_count = results.filter(result => 'error' in result).length;
      return toolResult({ results, completed_count: results.length - failed_count, failed_count }, failed_count > 0);
    } catch (error) {
      return toolResult({ error: error instanceof Error ? error.message : 'Unable to start multi-agent request.' }, true);
    }
  }
  if (name === 'agent_run' || name === 'agent_team_run') {
    try {
      if (typeof args.message !== 'string') throw new Error('message must be a string.');
      if (args.context !== undefined && typeof args.context !== 'string') throw new Error('context must be a string.');
      const context = typeof args.context === 'string' ? args.context : '';
      if (name === 'agent_run') {
        if (!isAgentId(args.agent_id)) throw new Error('agent_id must be ba, designer, or developer.');
        return toolResult({ result: await runAgent(args.agent_id, args.message, context) });
      }
      const results: AgentResult[] = [];
      for (const agent of agents) {
        const handoff = results.map(result => `## ${result.name} handoff\n${result.content}`).join('\n\n');
        results.push(await runAgent(agent.id, args.message, [context, handoff].filter(Boolean).join('\n\n').slice(-12000)));
      }
      return toolResult({ results });
    } catch (error) {
      return toolResult({ error: error instanceof Error ? error.message : 'Agent request failed.' }, true);
    }
  }
  return toolResult({ error: `Unknown tool: ${name}` }, true);
}

export async function handleMcpRequest(input: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = input.id ?? null;
  if (input.jsonrpc !== '2.0' || !input.method) return errorResponse(id, -32600, 'Invalid JSON-RPC request.');

  if (input.method === 'notifications/initialized' || input.method === 'notifications/cancelled') return null;

  if (input.method === 'initialize') {
    return response(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'toolhub-mcp', version: '0.3.0' },
      instructions: 'Toolhub MCP server controls the BA, UI/UX, and Developer agents. Use agent_team_list to inspect them; agent_run for one agent; agent_team_run when downstream agents need upstream handoffs; agent_team_parallel_run when all three can analyze the same request independently; and agent_multi_run for up to six independent tasks with per-task agent assignment. MCP access does not expose the OpenAI API key. Results describe agent output only; do not claim external actions were performed.',
    });
  }

  if (input.method === 'ping') return response(id, {});
  if (input.method === 'tools/list') return response(id, { tools: tools() });

  if (input.method === 'tools/call') {
    const params = input.params ?? {};
    const name = typeof params.name === 'string' ? params.name : '';
    return response(id, await invokeMcpTool(name, params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments) ? params.arguments as Record<string, unknown> : {}));
  }

  return errorResponse(id, -32601, `Method not found: ${input.method}`);
}
