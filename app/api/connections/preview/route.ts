import {getAuth} from '@/lib/server/auth';
import {getDatabase} from '@/lib/server/database';
import {previewSupabase,PreviewError,readLimitedJSON} from '@/lib/server/supabase-preview';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function POST(request:Request){
 try{
  if(request.headers.get('origin')!==new URL(process.env.BETTER_AUTH_URL!).origin)return Response.json({message:'Invalid request origin.'},{status:403,headers});
  const session=await getAuth().api.getSession({headers:request.headers});
  if(!session)return Response.json({message:'Sign in to test a connection.'},{status:401,headers});
  const admin=(await getDatabase().query('SELECT id FROM users WHERE id=$1 AND role=$2 AND NOT COALESCE(banned,false)',[session.user.id,'admin'])).rows[0];
  if(!admin)return Response.json({message:'Only admins can test connections during setup.'},{status:403,headers});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({message:'JSON required.'},{status:415,headers});
  const body=await readLimitedJSON(request,16384);
  return Response.json(await previewSupabase(body),{headers});
 }catch(error){return Response.json({message:error instanceof PreviewError?error.message:'Unable to preview this connection.'},{status:error instanceof PreviewError?error.status:503,headers});}
}
