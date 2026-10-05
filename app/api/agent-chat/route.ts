import { agents, isAgentId, type AgentResult } from '@/lib/agent-team';
import { invokeMcpTool } from '@/lib/mcp-server';
import { getAuth } from '@/lib/server/auth';

async function authorized(request: Request) {
  return getAuth().api.getSession({ headers: request.headers });
}

export async function GET(request: Request) {
  try {
    if (!await authorized(request)) return Response.json({ error: 'Sign in required.' }, { status: 401 });
    const result = await invokeMcpTool('agent_team_list');
    return Response.json(result.structuredContent, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Account service is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const origin = process.env.BETTER_AUTH_URL && new URL(process.env.BETTER_AUTH_URL).origin;
    if (!origin || request.headers.get('origin') !== origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    if (!await authorized(request)) return Response.json({ error: 'Sign in required.' }, { status: 401 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    if (Number(request.headers.get('content-length') || 0) > 36000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 36000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(raw) as { message?: unknown; target?: unknown; context?: unknown };
    if (typeof body.message !== 'string' || body.message.trim().length < 3 || body.message.length > 4000) return Response.json({ error: 'Message must be 3–4,000 characters.' }, { status: 400 });
    if (body.target !== 'all' && !isAgentId(body.target)) return Response.json({ error: 'Choose a valid agent.' }, { status: 400 });
    if (body.context !== undefined && (typeof body.context !== 'string' || body.context.length > 12000)) return Response.json({ error: 'Conversation context is too long.' }, { status: 400 });

    const message = body.message;
    const context = typeof body.context === 'string' ? body.context : '';
    const selected = body.target === 'all' ? agents : agents.filter(agent => agent.id === body.target);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        const results: AgentResult[] = [];
        try {
          for (const agent of selected) {
            send({ type: 'start', agentId: agent.id });
            const handoff = results.map(result => `## ${result.name} handoff\n${result.content}`).join('\n\n');
            const tool = await invokeMcpTool('agent_run', { agent_id: agent.id, message, context: [context, handoff].filter(Boolean).join('\n\n').slice(-12000) });
            if (tool.isError) throw new Error(String(tool.structuredContent?.error || 'Agent request failed.'));
            const result = tool.structuredContent?.result as AgentResult | undefined;
            if (!result) throw new Error('The MCP server returned no agent result.');
            results.push(result);
            send({ type: 'result', result });
          }
          send({ type: 'done' });
        } catch (error) {
          send({ type: 'error', message: error instanceof Error ? error.message : 'Agent request failed.' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return Response.json({ error: 'Unable to start the agent request.' }, { status: 503 });
  }
}
