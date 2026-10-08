import { getAuth } from '@/lib/server/auth';
import { getAgentApiSpend } from '@/lib/server/agent-api-spend';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    if (!await getAuth().api.getSession({ headers: request.headers })) {
      return Response.json({ error: 'Sign in required.' }, { status: 401, headers });
    }
    return Response.json(await getAgentApiSpend(), { headers });
  } catch {
    return Response.json({ error: 'API spend is unavailable.' }, { status: 503, headers });
  }
}
