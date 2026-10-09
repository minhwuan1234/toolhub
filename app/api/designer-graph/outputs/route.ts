import { getAuth } from '@/lib/server/auth';
import { getDesignerGraphOutputChanges, getDesignerGraphOutputs } from '@/lib/server/designer-graph';

export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const since = new URL(request.url).searchParams.get('since');
    if (since && !Number.isFinite(Date.parse(since))) return Response.json({ error: 'Invalid output cursor.' }, { status: 400 });
    return Response.json(since ? await getDesignerGraphOutputChanges(since) : { outputs: await getDesignerGraphOutputs() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to load graph outputs.' }, { status: 503 }); }
}
