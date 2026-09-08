import { getDatabase } from '@/lib/server/database';
export async function GET() {
  try {
    await getDatabase().query('SELECT id FROM users LIMIT 0');
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
