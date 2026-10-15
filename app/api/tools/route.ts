import { getAuth } from '@/lib/server/auth';
import { importTool, listImportedTools, removeImportedTool } from '@/lib/server/imported-tools';
import { toolCatalog } from '@/lib/tool-catalog';

const headers = { 'Cache-Control': 'no-store' };

async function isAdmin(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.role === 'admin';
}

function sameOrigin(request: Request) {
  const base = process.env.BETTER_AUTH_URL;
  return Boolean(base && request.headers.get('origin') === new URL(base).origin);
}

export async function GET(request: Request) {
  try {
    if (!await getAuth().api.getSession({ headers: request.headers })) return Response.json({ error: 'Sign in required.' }, { status: 401, headers });
    return Response.json({ catalog: toolCatalog, imported: await listImportedTools() }, { headers });
  } catch { return Response.json({ error: 'Unable to load tools.' }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request) || !await isAdmin(request)) return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    const body = await request.json() as { toolId?: unknown };
    if (typeof body.toolId !== 'string') return Response.json({ error: 'toolId must be a string.' }, { status: 400, headers });
    return Response.json({ tool: await importTool(body.toolId) }, { headers });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to import tool.' }, { status: 400, headers }); }
}

export async function DELETE(request: Request) {
  try {
    if (!sameOrigin(request) || !await isAdmin(request)) return Response.json({ error: 'Admin access required.' }, { status: 403, headers });
    const id = new URL(request.url).searchParams.get('id') || '';
    await removeImportedTool(id);
    return Response.json({ removed: id }, { headers });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to remove tool.' }, { status: 400, headers }); }
}
