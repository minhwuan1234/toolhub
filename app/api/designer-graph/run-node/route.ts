import { getAuth } from '@/lib/server/auth';
import { runGraphToNode } from '@/lib/server/designer-graph';

export async function POST(request: Request) {
  try {
    const base = process.env.BETTER_AUTH_URL;
    if (!base || request.headers.get('origin') !== new URL(base).origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415 });
    if (Number(request.headers.get('content-length') || 0) > 100000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 100000) return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(raw) as { nodeId?: unknown; handoffData?: unknown };
    if (typeof body.nodeId !== 'string' || !body.nodeId || body.nodeId.length > 100) return Response.json({ error: 'Graph node ID is required.' }, { status: 400 });
    if (body.handoffData !== undefined && (typeof body.handoffData !== 'object' || !body.handoffData || Array.isArray(body.handoffData) || Object.entries(body.handoffData).length > 20 || Object.entries(body.handoffData).some(([key, value]) => key.length > 100 || typeof value !== 'string' || value.length > 8000))) return Response.json({ error: 'Invalid handoff data.' }, { status: 400 });
    const result = await runGraphToNode(body.nodeId, body.handoffData as Record<string, string> | undefined);
    return Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to run this node.' }, { status: 400 });
  }
}
