import { getAuth } from '@/lib/server/auth';
import { runAgent } from '@/lib/agent-team';
import { validateStructuredOutput } from '@/lib/structured-output';

export async function POST(request: Request) {
  try {
    const origin = process.env.BETTER_AUTH_URL && new URL(process.env.BETTER_AUTH_URL).origin;
    if (!origin || request.headers.get('origin') !== origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    if (!await getAuth().api.getSession({ headers: request.headers })) return Response.json({ error: 'Sign in required.' }, { status: 401 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    if (Number(request.headers.get('content-length') || 0) > 48000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 48000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(raw) as { message?: unknown; instructions?: unknown; outputSchema?: unknown };
    if (typeof body.message !== 'string' || body.message.trim().length < 3 || body.message.length > 4000) return Response.json({ error: 'Task must be 3–4,000 characters.' }, { status: 400 });
    if (body.instructions !== undefined && (typeof body.instructions !== 'string' || body.instructions.length > 4000)) return Response.json({ error: 'Instruction prompt is too long.' }, { status: 400 });
    const output = validateStructuredOutput(JSON.stringify(body.outputSchema ?? null));
    if (!output.ok) return Response.json({ error: output.error }, { status: 400 });
    const result = await runAgent('designer', body.message, '', { outputSchema: output.schema, additionalInstructions: typeof body.instructions === 'string' ? body.instructions : '' });
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to run the AI Agent.' }, { status: 503 });
  }
}
