import { getAuth } from '@/lib/server/auth';
import { getDesignerGraph, runStoredGraphAgent } from '@/lib/server/designer-graph';
import { getAgentCard } from '@/lib/server/agent-cards';

export async function POST(request: Request) {
  try {
    const origin = process.env.BETTER_AUTH_URL && new URL(process.env.BETTER_AUTH_URL).origin;
    if (!origin || request.headers.get('origin') !== origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    if (Number(request.headers.get('content-length') || 0) > 300000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 300000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(raw) as { handoffData?: unknown; nodeId?: unknown; agentId?: unknown };
    const agentId = body.agentId === undefined ? 'designer' : body.agentId;
    if (typeof agentId !== 'string' || !await getAgentCard(agentId)) return Response.json({ error: 'Agent card not found.' }, { status: 404 });
    if (body.handoffData !== undefined && (typeof body.handoffData !== 'object' || !body.handoffData || Array.isArray(body.handoffData) || Object.entries(body.handoffData).length > 20 || Object.entries(body.handoffData).some(([key, value]) => key.length > 100 || typeof value !== 'string' || value.length > 8000))) return Response.json({ error: 'Invalid handoff data.' }, { status: 400 });
    if (typeof body.nodeId !== 'string' || !body.nodeId || body.nodeId.length > 100) return Response.json({ error: 'AI Agent node ID is required.' }, { status: 400 });
    const { document } = await getDesignerGraph(agentId);
    if (!document?.nodes.some(node => node.id === body.nodeId && node.kind === 'agent' && node.active !== false)) return Response.json({ error: 'AI Agent node does not belong to this graph.' }, { status: 400 });
    const run = await runStoredGraphAgent(body.nodeId, '', '', body.handoffData as Record<string, string> | undefined, agentId);
    return Response.json({ result: run.result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run the AI Agent.';
    const status = message === 'Agent tool call limit reached.' ? 422 : /^scanner_(?:list_files|read_file|write_file|list_tables|sent_connects_today|table):/.test(message) ? 424 : 503;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
