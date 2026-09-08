import { getAuth } from '@/lib/server/auth';

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return Response.json({ user: null }, { status: 401, headers });
    const { id, name, email, department, role, image, createdAt } = session.user;
    return Response.json({ user: { id, name, email, department, role, image, createdAt } }, { headers });
  } catch {
    return Response.json({ message: 'Account service is temporarily unavailable.' }, { status: 503, headers });
  }
}
