import { getAuth } from '@/lib/server/auth';
import { getDesignerGraphOutputChanges, getDesignerGraphOutputs } from '@/lib/server/designer-graph';
import { getAgentCard } from '@/lib/server/agent-cards';

export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const agentId = params.get('agentId') || 'designer';
    if (!await getAgentCard(agentId)) return Response.json({ error: 'Agent card not found.' }, { status: 404 });
    const since = params.get('since');
    if (since && !Number.isFinite(Date.parse(since))) return Response.json({ error: 'Invalid output cursor.' }, { status: 400 });
    return Response.json(since ? await getDesignerGraphOutputChanges(since, agentId) : { outputs: await getDesignerGraphOutputs(agentId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to load graph outputs.' }, { status: 503 }); }
}
