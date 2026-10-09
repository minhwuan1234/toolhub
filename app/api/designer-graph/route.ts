import { getAuth } from '@/lib/server/auth';
import { getDesignerGraph, getDesignerGraphOutputs, saveDesignerGraph } from '@/lib/server/designer-graph';

const headers = { 'Cache-Control': 'no-store' };

async function admin(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

export async function GET(request: Request) {
  try {
    if (!await admin(request)) return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    const [graph, outputs] = await Promise.all([getDesignerGraph(), getDesignerGraphOutputs()]);
    return Response.json({ ...graph, outputs }, { headers });
  } catch { return Response.json({ error: 'Unable to load the graph.' }, { status: 503, headers }); }
}

export async function PUT(request: Request) {
  try {
    const base = process.env.BETTER_AUTH_URL;
    if (!base || request.headers.get('origin') !== new URL(base).origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    if (!await admin(request)) return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415, headers });
    if (Number(request.headers.get('content-length') || 0) > 2_000_000) return Response.json({ error: 'Graph is too large.' }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 2_000_000) return Response.json({ error: 'Graph is too large.' }, { status: 413, headers });
    const body = JSON.parse(raw) as { document?: unknown; expectedRevision?: unknown };
    if (typeof body.expectedRevision !== 'number') return Response.json({ error: 'Graph revision is required.' }, { status: 400, headers });
    try {
      const revision = await saveDesignerGraph(body.document, body.expectedRevision);
      return Response.json({ revision }, { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save graph.';
      return Response.json({ error: message }, { status: message.includes('another session') ? 409 : 400, headers });
    }
  } catch { return Response.json({ error: 'Unable to save graph.' }, { status: 503, headers }); }
}
