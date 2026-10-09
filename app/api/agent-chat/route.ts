import { agents, type AgentResult } from '@/lib/agent-team';
import { listAgentCards } from '@/lib/server/agent-cards';
import { invokeMcpTool } from '@/lib/mcp-server';
import { getAuth } from '@/lib/server/auth';
import { asksToRunDesignerGraph, designerGraphNodeForTestDocument } from '@/lib/graph-command';
import { getDesignerGraph, runStoredGraphAgent } from '@/lib/server/designer-graph';

async function authorized(request: Request) {
  return getAuth().api.getSession({ headers: request.headers });
}

export async function GET(request: Request) {
  try {
    const session = await authorized(request);
    if (!session) return Response.json({ error: 'Sign in required.' }, { status: 401 });
    const result = await invokeMcpTool('agent_team_list');
    if (result.isError) return Response.json({ error: 'Unable to load agents.' }, { status: 503 });
    return Response.json(result.structuredContent, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Account service is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const origin = process.env.BETTER_AUTH_URL && new URL(process.env.BETTER_AUTH_URL).origin;
    if (!origin || request.headers.get('origin') !== origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    const session = await authorized(request);
    if (!session) return Response.json({ error: 'Sign in required.' }, { status: 401 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    if (Number(request.headers.get('content-length') || 0) > 36000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 36000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(raw) as { message?: unknown; target?: unknown; context?: unknown; handoffs?: unknown };
    if (typeof body.message !== 'string' || body.message.trim().length < 3 || body.message.length > 4000) return Response.json({ error: 'Message must be 3–4,000 characters.' }, { status: 400 });
    const cards = await listAgentCards();
    if (body.target !== 'all' && !cards.some(card => card.id === body.target)) return Response.json({ error: 'Choose a valid agent.' }, { status: 400 });
    if (body.context !== undefined && (typeof body.context !== 'string' || body.context.length > 12000)) return Response.json({ error: 'Conversation context is too long.' }, { status: 400 });
    if (body.handoffs !== undefined && (typeof body.handoffs !== 'object' || body.handoffs === null || Array.isArray(body.handoffs) || Object.entries(body.handoffs).some(([id, value]) => !cards.some(card => card.id === id) || typeof value !== 'string' || value.length > 8000))) return Response.json({ error: 'Invalid handoff data.' }, { status: 400 });

    const message = body.message;
    const context = typeof body.context === 'string' ? body.context : '';
    const handoffs = (body.handoffs || {}) as Record<string, string>;
    const graphRun = (body.target === 'all' || body.target === 'designer') && asksToRunDesignerGraph(message);
    if (graphRun && session.user.role !== 'admin') return Response.json({ error: 'Admin access required to run a graph node.' }, { status: 403 });
    const selected = body.target === 'all' ? agents : cards.filter(card => card.id === body.target);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        const results: AgentResult[] = [];
        try {
          if (graphRun) {
            const { document } = await getDesignerGraph();
            if (!document) throw new Error('Open the UI/UX graph once to save it before running from chat.');
            const nodeId = designerGraphNodeForTestDocument(document);
            send({ type: 'start', agentId: 'designer' });
            const run = await runStoredGraphAgent(nodeId);
            send({ type: 'result', result: run.result });
            send({ type: 'done' });
            return;
          }
          for (const agent of selected) {
            send({ type: 'start', agentId: agent.id });
            const handoff = results.map(result => `## ${result.name} handoff\n${result.content}`).join('\n\n');
            const tool = await invokeMcpTool('agent_run', { agent_id: agent.id, message, context: [context, handoff, handoffs[agent.id]].filter(Boolean).join('\n\n').slice(-12000) });
            if (tool.isError) throw new Error(typeof tool.structuredContent?.error === 'string' ? tool.structuredContent.error : 'Agent request failed.');
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
