import { getAuth } from '@/lib/server/auth';
import { repositoryToolsForAgent } from '@/lib/server/repository-reader';

export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const agentId = new URL(request.url).searchParams.get('agentId') || '';
    return Response.json({ tools: await repositoryToolsForAgent(agentId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Could not load repository tools.' }, { status: 503 }); }
}
