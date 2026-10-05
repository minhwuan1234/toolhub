import { handleMcpRequest, isMcpAuthorized, type JsonRpcRequest } from '@/lib/mcp-server';

export async function GET(request: Request) {
  if (!isMcpAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ name: 'toolhub-mcp', version: '0.3.0', transport: 'streamable-http', endpoint: '/api/mcp' });
}

export async function POST(request: Request) {
  if (!isMcpAuthorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  let body: JsonRpcRequest | JsonRpcRequest[];
  try { body = await request.json() as JsonRpcRequest | JsonRpcRequest[]; } catch { return Response.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const requests = Array.isArray(body) ? body : [body];
  const results = (await Promise.all(requests.map(handleMcpRequest))).filter(Boolean);
  if (Array.isArray(body)) return Response.json(results);
  if (!results[0]) return new Response(null, { status: 202 });
  return Response.json(results[0]);
}
