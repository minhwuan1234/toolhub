import {randomUUID} from 'node:crypto';
import {getAuth} from '@/lib/server/auth';
import {getDatabase} from '@/lib/server/database';
import {MAX_AVATAR_BYTES,normalizeAvatar} from '@/lib/server/avatar';
const headers={'Cache-Control':'no-store'};
async function actor(request:Request){
  const session=await getAuth().api.getSession({headers:request.headers});
  if(!session)return null;
  return (await getDatabase().query('SELECT id,role FROM users WHERE id=$1 AND NOT COALESCE(banned,false)',[session.user.id])).rows[0] as {id:string;role:string}|undefined;
}
export async function GET(request:Request){
  try{
    const user=await actor(request);if(!user)return new Response(null,{status:401,headers});
    const id=new URL(request.url).searchParams.get('user')??user.id;
    if(!/^[0-9a-f-]{36}$/i.test(id))return new Response(null,{status:400,headers});
    if(id!==user.id&&user.role!=='admin')return new Response(null,{status:403,headers});
    const row=(await getDatabase().query('SELECT image_data FROM user_avatars WHERE user_id=$1',[id])).rows[0];
    if(!row)return new Response(null,{status:404,headers});
    return new Response(new Uint8Array(row.image_data),{headers:{...headers,'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response(null,{status:503,headers});}
}
async function change(request:Request,remove:boolean){
  try{
    if(request.headers.get('origin')!==new URL(process.env.BETTER_AUTH_URL!).origin)return Response.json({message:'Invalid request origin.'},{status:403,headers});
    const user=await actor(request);if(!user)return Response.json({message:'Sign in required.'},{status:401,headers});
    let bytes:Buffer|null=null;
    if(!remove){
      if(!['image/jpeg','image/png','image/webp'].includes(request.headers.get('content-type')??''))return Response.json({message:'Choose a JPG, PNG or WebP image.'},{status:415,headers});
      if(Number(request.headers.get('content-length'))>MAX_AVATAR_BYTES)return Response.json({message:'Choose an image under 5 MB.'},{status:413,headers});
      const reader=request.body?.getReader();if(!reader)return Response.json({message:'Choose an image.'},{status:400,headers});
      const chunks:Uint8Array[]=[];let length=0;
      for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>MAX_AVATAR_BYTES){await reader.cancel();return Response.json({message:'Choose an image under 5 MB.'},{status:413,headers});}chunks.push(value);}
      try{bytes=await normalizeAvatar(Buffer.concat(chunks));}catch{return Response.json({message:'Unable to read this image. Use JPG, PNG or WebP under 5 MB and 16 megapixels.'},{status:400,headers});}
    }
    const client=await getDatabase().connect();
    const image=remove?null:`/api/avatar?user=${user.id}&v=${randomUUID()}`;
    try{
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
      if(remove)await client.query('DELETE FROM user_avatars WHERE user_id=$1',[user.id]);
      else await client.query('INSERT INTO user_avatars(user_id,image_data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET image_data=$2,updated_at=now()',[user.id,bytes]);
      await client.query('UPDATE users SET image=$2,updated_at=now() WHERE id=$1',[user.id,image]);
      await client.query('INSERT INTO auth_events(user_id,actor_id,event) VALUES($1,$1,$2)',[user.id,remove?'avatar_removed':'avatar_updated']);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    return Response.json({image},{headers});
  }catch{return Response.json({message:'Unable to update your avatar. Try again.'},{status:503,headers});}
}
export const PUT=(request:Request)=>change(request,false);
export const DELETE=(request:Request)=>change(request,true);
