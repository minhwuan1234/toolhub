import { getAuth } from '@/lib/server/auth';
import { runAgent } from '@/lib/agent-team';
import { getDesignerGraph, getUnconsumedGraphFeedback, markGraphFeedbackConsumed, saveDesignerGraphOutput } from '@/lib/server/designer-graph';
import { maxGraphAgentInputCharacters } from '@/lib/context-tags';
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
    const body = JSON.parse(raw) as { message?: unknown; nodeId?: unknown; agentId?: unknown };
    const agentId = body.agentId === undefined ? 'designer' : body.agentId;
    if (typeof agentId !== 'string' || !await getAgentCard(agentId)) return Response.json({ error: 'Agent card not found.' }, { status: 404 });
    if (typeof body.message !== 'string' || body.message.trim().length < 3 || body.message.length > maxGraphAgentInputCharacters) return Response.json({ error: 'Graph input must be 3–100,000 characters.' }, { status: 400 });
    if (typeof body.nodeId !== 'string' || !body.nodeId || body.nodeId.length > 100) return Response.json({ error: 'AI Agent node ID is required.' }, { status: 400 });
    const { document } = await getDesignerGraph(agentId);
    if (!document?.nodes.some(node => node.id === body.nodeId && node.kind === 'agent' && node.active !== false)) return Response.json({ error: 'AI Agent node does not belong to this graph.' }, { status: 400 });
    const feedback = await getUnconsumedGraphFeedback(body.nodeId);
    const message = feedback ? `${body.message}\n\nHuman review feedback for this revision:\n${feedback.feedback}` : body.message;
    const result = await runAgent(agentId, message, '', { graphInput: true });
    await saveDesignerGraphOutput(body.nodeId, result.content, agentId);
    if (feedback) await markGraphFeedbackConsumed(feedback.id);
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to run the AI Agent.';
    const status = message === 'Agent tool call limit reached.' ? 422 : /^scanner_(?:list_files|read_file|write_file|list_tables|sent_connects_today|table):/.test(message) ? 424 : 503;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
