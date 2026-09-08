import {getAuth} from '@/lib/server/auth';
import {getDatabase} from '@/lib/server/database';
import {getRailwayUsage} from '@/lib/server/railway-usage';
import {externalCategories} from '@/lib/usage';
const headers={'Cache-Control':'no-store'};
async function actor(request:Request) {
  const session=await getAuth().api.getSession({headers:request.headers});
  if(!session)return null;
  const row=(await getDatabase().query('SELECT id FROM users WHERE id=$1 AND role=$2 AND NOT COALESCE(banned,false)',[session.user.id,'admin'])).rows[0];
  return row?.id as string|undefined;
}
function periodKey(start:string|null|undefined) {return start?`railway:${start}`:`calendar:${new Date().toISOString().slice(0,7)}`;}
export async function GET(request:Request) {
  try {
    if(!await actor(request))return Response.json({message:'Admin access required.'},{status:403,headers});
    const railway=await getRailwayUsage();
    const key=periodKey(railway.period?.start);
    const row=(await getDatabase().query('SELECT budget,external_costs FROM usage_tracking WHERE period_key=$1',[key])).rows[0];
    const previous=row?null:(await getDatabase().query('SELECT budget FROM usage_tracking ORDER BY updated_at DESC LIMIT 1')).rows[0];
    return Response.json({railway,periodKey:key,settings:{budget:row?Number(row.budget):previous?Number(previous.budget):5,external:row?.external_costs??{}}},{headers});
  }catch{return Response.json({message:'Usage tracking is temporarily unavailable.'},{status:503,headers});}
}
export async function PATCH(request:Request) {
  try {
    if(request.headers.get('origin')!==new URL(process.env.BETTER_AUTH_URL!).origin)return Response.json({message:'Invalid request origin.'},{status:403,headers});
    const id=await actor(request);
    if(!id)return Response.json({message:'Admin access required.'},{status:403,headers});
    if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({message:'JSON required.'},{status:415,headers});
    let body:{budget:unknown;external:unknown;periodKey:unknown};
    try{body=await request.json() as typeof body;}catch{return Response.json({message:'Invalid JSON.'},{status:400,headers});}
    if(!body)return Response.json({message:'Invalid settings.'},{status:400,headers});
    const external=body.external;
    if(typeof body.budget!=='number'||!Number.isFinite(body.budget)||body.budget<=0||body.budget>500000||!external||typeof external!=='object'||Array.isArray(external))return Response.json({message:'Enter a valid budget and costs.'},{status:400,headers});
    for(const [key,value] of Object.entries(external))if(!externalCategories.includes(key as never)||typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000000)return Response.json({message:'Invalid external cost.'},{status:400,headers});
    const railway=await getRailwayUsage();
    if(railway.status==='unavailable')return Response.json({message:'Restore the Railway connection before saving this billing period.'},{status:503,headers});
    const key=periodKey(railway.period?.start);
    if(body.periodKey!==key)return Response.json({message:'The billing period changed. Refresh before saving.'},{status:409,headers});
    await getDatabase().query('INSERT INTO usage_tracking(period_key,budget,external_costs,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(period_key) DO UPDATE SET budget=$2,external_costs=$3,updated_by=$4,updated_at=now()',[key,body.budget,JSON.stringify(external),id]);
    return Response.json({success:true},{headers});
  }catch{return Response.json({message:'Unable to save usage settings.'},{status:503,headers});}
}
