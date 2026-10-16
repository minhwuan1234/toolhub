import { getAuth } from '@/lib/server/auth';
import { graphChatCapabilities, runGraphChat, type GraphChatEvent } from '@/lib/server/graph-chat';

const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    const agentId = new URL(request.url).searchParams.get('agentId') || '';
    return Response.json(await graphChatCapabilities(agentId), { headers });
  } catch { return Response.json({ error: 'Could not load graph capabilities.' }, { status: 400, headers }); }
}

export async function POST(request: Request) {
  try {
    const base = process.env.BETTER_AUTH_URL;
    if (!base || request.headers.get('origin') !== new URL(base).origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415, headers });
    if (Number(request.headers.get('content-length') || 0) > 20000) return Response.json({ error: 'Request is too large.' }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 20000) return Response.json({ error: 'Request is too large.' }, { status: 413, headers });
    const body = JSON.parse(raw) as { agentId?: unknown; message?: unknown; context?: unknown };
    if (typeof body.agentId !== 'string' || body.agentId.length > 100 || typeof body.message !== 'string' || body.message.trim().length < 3 || body.message.length > 4000 || body.context !== undefined && (typeof body.context !== 'string' || body.context.length > 12000)) return Response.json({ error: 'Invalid graph chat request.' }, { status: 400, headers });
    const agentId = body.agentId, message = body.message;
    const context = typeof body.context === 'string' ? body.context : '';
    await graphChatCapabilities(agentId);
    const encoder = new TextEncoder();
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: GraphChatEvent) => { if (!closed) { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { closed = true; } } };
        try { await runGraphChat(agentId, message, context, emit, request.signal); }
        catch (error) {
          let message = error instanceof Error ? error.message : 'Graph request failed.';
          for (const key of ['OPENAI_API_KEY', 'LINKEDIN_SCANNER_PAT', 'LINKEDIN_SCANNER_SUPABASE_SECRET_KEY', 'DATABASE_URL']) {
            const value = process.env[key]; if (value) message = message.replaceAll(value, '[redacted]');
          }
          emit({ type: 'error', message: message.replace(/sb_secret_[A-Za-z0-9._~-]{8,}/g, '[redacted]').slice(0, 500) });
        }
        finally { emit({ type: 'done' }); if (!closed) { closed = true; controller.close(); } }
      },
      cancel() { closed = true; },
    });
    return new Response(stream, { headers: { ...headers, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return Response.json({ error: 'Unable to start graph chat.' }, { status: 400, headers }); }
}
