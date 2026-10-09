import { getAuth } from '@/lib/server/auth';
import { runAgent } from '@/lib/agent-team';
import { validateStructuredOutput } from '@/lib/structured-output';
import { getUnconsumedGraphFeedback, markGraphFeedbackConsumed, saveDesignerGraphOutput } from '@/lib/server/designer-graph';

export async function POST(request: Request) {
  try {
    const origin = process.env.BETTER_AUTH_URL && new URL(process.env.BETTER_AUTH_URL).origin;
    if (!origin || request.headers.get('origin') !== origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    if (Number(request.headers.get('content-length') || 0) > 48000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 48000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(raw) as { message?: unknown; instructions?: unknown; outputSchema?: unknown; nodeId?: unknown };
    if (typeof body.message !== 'string' || body.message.trim().length < 3 || body.message.length > 4000) return Response.json({ error: 'Task must be 3–4,000 characters.' }, { status: 400 });
    if (body.instructions !== undefined && (typeof body.instructions !== 'string' || body.instructions.length > 4000)) return Response.json({ error: 'Instruction prompt is too long.' }, { status: 400 });
    const output = validateStructuredOutput(JSON.stringify(body.outputSchema ?? null));
    if (!output.ok) return Response.json({ error: output.error }, { status: 400 });
    if (typeof body.nodeId !== 'string' || !body.nodeId || body.nodeId.length > 100) return Response.json({ error: 'AI Agent node ID is required.' }, { status: 400 });
    const feedback = await getUnconsumedGraphFeedback(body.nodeId);
    const message = feedback ? `${body.message}\n\nHuman review feedback for this revision:\n${feedback.feedback}` : body.message;
    const result = await runAgent('designer', message, '', { outputSchema: output.schema, additionalInstructions: typeof body.instructions === 'string' ? body.instructions : '' });
    await saveDesignerGraphOutput(body.nodeId, JSON.stringify(JSON.parse(result.content) as unknown, null, 2));
    if (feedback) await markGraphFeedbackConsumed(feedback.id);
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to run the AI Agent.' }, { status: 503 });
  }
}
