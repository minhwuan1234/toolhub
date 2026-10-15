import { getAuth } from '@/lib/server/auth';
import { getAgentCard } from '@/lib/server/agent-cards';
import { isToolImported } from '@/lib/server/imported-tools';
import { listScannerPath, readScannerFile } from '@/lib/server/linkedin-scanner';

export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (session?.user.role !== 'admin') return Response.json({ error: 'Admin access required.' }, { status: 403 });
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agentId') || '';
    const card = await getAgentCard(agentId);
    if (!card?.toolIds.includes('linkedin-scanner') || !await isToolImported('linkedin-scanner')) return Response.json({ error: 'Repository access is not enabled for this agent.' }, { status: 403 });
    const path = url.searchParams.get('path') || '';
    if (path.length > 500) return Response.json({ error: 'Path is too long.' }, { status: 400 });
    if (url.searchParams.get('mode') === 'read') {
      const file = await readScannerFile(path);
      if (file.content.length > 200000) return Response.json({ error: 'File exceeds the context limit.' }, { status: 413 });
      return Response.json({ repository: 'linkedin-scanner', ...file }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ repository: 'linkedin-scanner', path, files: await listScannerPath(path) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load repository file.' }, { status: 400 });
  }
}
