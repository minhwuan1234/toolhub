import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getAuth } from '@/lib/server/auth';
import { uiScreenContextCatalog } from '@/lib/ui-screen-context-catalog';

export async function GET(request: Request) {
  if (!await getAuth().api.getSession({ headers: request.headers })) {
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  }

  try {
    const contexts = await Promise.all(uiScreenContextCatalog.map(async item => ({
      ...item,
      content: (await readFile(join(process.cwd(), 'contexts', 'ui-screen', `${item.id}.md`), 'utf8')).trim(),
    })));
    return Response.json({ contexts }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'UI screen contexts are unavailable.' }, { status: 503 });
  }
}
