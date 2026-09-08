import { getAuth } from '@/lib/server/auth';

const allowed = new Set(['sign-up/email', 'sign-in/email', 'sign-out', 'get-session']);
async function handle(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth\//, '');
  if (!allowed.has(path)) return Response.json({ message: 'This action is not available.' }, { status: 404 });
  try {
    const response = await getAuth().handler(request);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    console.error('[auth] Request failed. Check database and auth configuration.');
    return Response.json({ message: 'Account service is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const GET = handle;
export const POST = handle;
