import { getAuth } from '@/lib/server/auth';
import { deleteAgentCard, listAgentCards, saveAgentCard } from '@/lib/server/agent-cards';

const headers = { 'Cache-Control': 'no-store' };

async function session(request: Request) {
  return getAuth().api.getSession({ headers: request.headers });
}

function sameOrigin(request: Request) {
  const base = process.env.BETTER_AUTH_URL;
  return Boolean(base && request.headers.get('origin') === new URL(base).origin);
}

export async function GET(request: Request) {
  try {
    if (!await session(request)) return Response.json({ error: 'Sign in required.' }, { status: 401, headers });
    return Response.json({ cards: await listAgentCards() }, { headers });
  } catch {
    return Response.json({ error: 'Unable to load agent cards.' }, { status: 503, headers });
  }
}

export async function PUT(request: Request) {
  return writeCard(request, false);
}

export async function PATCH(request: Request) {
  return writeCard(request, true);
}

async function writeCard(request: Request, positionOnly: boolean) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const current = await session(request);
    if (!current) return Response.json({ error: 'Sign in required.' }, { status: 401, headers });
    if (current.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415, headers });
    const raw = await request.text();
    if (raw.length > 12000) return Response.json({ error: 'Agent card is too large.' }, { status: 413, headers });
    let card: unknown;
    try { card = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400, headers }); }
    try { return Response.json({ card: await saveAgentCard(card, positionOnly) }, { headers }); }
    catch (error) { if (error instanceof Error && /invalid|must be|characters/i.test(error.message)) return Response.json({ error: error.message }, { status: 400, headers }); throw error; }
  } catch {
    return Response.json({ error: 'Unable to save agent card.' }, { status: 503, headers });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const current = await session(request);
    if (!current) return Response.json({ error: 'Sign in required.' }, { status: 401, headers });
    if (current.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    try { await deleteAgentCard(new URL(request.url).searchParams.get('id') || ''); }
    catch (error) { if (error instanceof Error && /invalid|cannot be deleted/i.test(error.message)) return Response.json({ error: error.message }, { status: 400, headers }); throw error; }
    return Response.json({ deleted: true }, { headers });
  } catch {
    return Response.json({ error: 'Unable to delete agent card.' }, { status: 503, headers });
  }
}
