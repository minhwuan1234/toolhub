import { getAuth } from '@/lib/server/auth';
import { decideGraphApproval, getPendingGraphApproval, getDesignerGraph, runStoredGraphAgent } from '@/lib/server/designer-graph';

const headers = { 'Cache-Control': 'no-store' };

async function admin(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

export async function GET(request: Request) {
  try {
    if (!await admin(request)) return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    return Response.json({ approval: await getPendingGraphApproval() }, { headers });
  } catch { return Response.json({ error: 'Unable to load approvals.' }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  try {
    const base = process.env.BETTER_AUTH_URL;
    if (!base || request.headers.get('origin') !== new URL(base).origin) return Response.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    if (!await admin(request)) return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON required.' }, { status: 415, headers });
    if (Number(request.headers.get('content-length') || 0) > 5000) return Response.json({ error: 'Request is too large.' }, { status: 413, headers });
    const raw = await request.text();
    if (raw.length > 5000) return Response.json({ error: 'Request is too large.' }, { status: 413, headers });
    const body = JSON.parse(raw) as { id?: unknown; decision?: unknown; feedback?: unknown };
    if (typeof body.id !== 'string' || (body.decision !== 'approved' && body.decision !== 'denied') || (body.feedback !== undefined && typeof body.feedback !== 'string')) return Response.json({ error: 'Invalid decision.' }, { status: 400, headers });
    const { targets, output } = await decideGraphApproval(body.id, body.decision, typeof body.feedback === 'string' ? body.feedback : '');
    if (body.decision === 'denied') return Response.json({ status: body.decision, targets }, { headers });
    const { document } = await getDesignerGraph();
    const runs: string[] = [];
    const handoffs: string[] = [];
    const errors: string[] = [];
    for (const target of targets) {
      const node = document?.nodes.find(item => item.id === target);
      if (!node?.active) { errors.push(`${node?.name || target} is inactive.`); continue; }
      if (node.kind === 'agent-handoff' && node.handoffMode === 'send') { handoffs.push(target); continue; }
      if (node.kind !== 'agent') { errors.push(`${node.name} has no execution logic yet.`); continue; }
      try { await runStoredGraphAgent(target, '', output); runs.push(target); }
      catch (error) { errors.push(`${node.name}: ${error instanceof Error ? error.message : 'Unable to run.'}`); }
    }
    return Response.json({ status: body.decision, targets, runs, handoffs, handoffOutput: handoffs.length ? output : undefined, errors }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save approval.';
    return Response.json({ error: message }, { status: message.includes('already been handled') ? 409 : 400, headers });
  }
}
