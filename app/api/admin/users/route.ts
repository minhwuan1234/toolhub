import { getAuth } from '@/lib/server/auth';
import { getDatabase } from '@/lib/server/database';
import { AdminError, updateUser } from '@/lib/server/admin-users';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session) return Response.json({message:'Sign in required.'},{status:401,headers});
    const pool = getDatabase();
    const actor = (await pool.query('SELECT role, banned FROM users WHERE id=$1',[session.user.id])).rows[0];
    if (!actor || actor.role !== 'admin' || actor.banned) return Response.json({message:'Admin access required.'},{status:403,headers});
    const url=new URL(request.url);
    const search=(url.searchParams.get('search') || '').slice(0,100);
    const page=Math.max(0,Math.min(100000,Math.floor(Number(url.searchParams.get('page')) || 0)));
    const result=await pool.query('SELECT id,name,email,department,role,banned,created_at, count(*) OVER()::int AS total FROM users WHERE name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC,id LIMIT 25 OFFSET $2',[`%${search}%`,page*25]);
    return Response.json({users:result.rows,total:result.rows[0]?.total || 0,page},{headers});
  } catch { return Response.json({message:'Account service is temporarily unavailable.'},{status:503,headers}); }
}
export async function PATCH(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(process.env.BETTER_AUTH_URL!).origin) return Response.json({message:'Invalid request origin.'},{status:403,headers});
    if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({message:'JSON required.'},{status:415,headers});
    const session=await getAuth().api.getSession({headers:request.headers});
    if (!session) return Response.json({message:'Sign in required.'},{status:401,headers});
    let body; try { body=await request.json(); } catch { return Response.json({message:'Invalid JSON.'},{status:400,headers}); }
    return Response.json(await updateUser(getDatabase(),session.user.id,body),{headers});
  } catch(error) { return Response.json({message:error instanceof AdminError ? error.message : 'Account update failed.'},{status:error instanceof AdminError ? error.status : 503,headers}); }
}
