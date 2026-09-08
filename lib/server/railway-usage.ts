import {costRows,resourceRates,type UsageSnapshot} from '../usage';
// Read-only queries follow Railway's published CLI usage API. Never send tokens to the browser.
const endpoint='https://backboard.railway.com/graphql/v2';
export async function fetchRailwayUsage(token:string,workspaceId:string,transport:typeof fetch=fetch):Promise<UsageSnapshot> {
  async function query<T>(query:string,variables:Record<string,unknown>):Promise<T> {
    const response=await transport(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Railway request failed.');
    const result=await response.json() as {data?:T;errors?:unknown[]};
    if(!result.data || result.errors?.length)throw new Error('Railway usage is unavailable.');
    return result.data;
  }
  const context=await query<{workspace:{name:string;customer:{currentUsage:number|null;billingPeriod:{start:string;end:string};usageLimit:{softLimit:number|null;hardLimit:number|null}|null}}}>(`query($id:String!){workspace(workspaceId:$id){name customer{currentUsage billingPeriod{start end} usageLimit{softLimit hardLimit}}}}`,{id:workspaceId});
  const customer=context.workspace?.customer;
  if(!customer?.billingPeriod || !Number.isFinite(Date.parse(customer.billingPeriod.start)) || !Number.isFinite(Date.parse(customer.billingPeriod.end))) throw new Error('Invalid billing period.');
  const variables={id:workspaceId,metrics:resourceRates.map(r=>r.id),start:customer.billingPeriod.start,end:new Date(Math.min(Date.now(),Date.parse(customer.billingPeriod.end))).toISOString()};
  const actual=await query<{usage:{measurement:string;value:number}[]}>(`query($id:String!,$metrics:[MetricMeasurement!]!,$start:DateTime!,$end:DateTime!){usage(workspaceId:$id,measurements:$metrics,groupBy:[PROJECT_ID],startDate:$start,endDate:$end,includeDeleted:true){measurement value}}`,variables);
  if(!Array.isArray(actual.usage) || actual.usage.some(v=>!Number.isFinite(v.value)||v.value<0))throw new Error('Invalid resource data.');
  let forecast:number|null=null;
  try {
    const estimated=await query<{estimatedUsage:{measurement:string;estimatedValue:number}[]}>(`query($id:String!,$metrics:[MetricMeasurement!]!){estimatedUsage(workspaceId:$id,measurements:$metrics,includeDeleted:true){measurement estimatedValue}}`,{id:workspaceId,metrics:variables.metrics});
    if(estimated.estimatedUsage.length && estimated.estimatedUsage.every(v=>Number.isFinite(v.estimatedValue)&&v.estimatedValue>=0))forecast=costRows(estimated.estimatedUsage.map(v=>({measurement:v.measurement,value:v.estimatedValue}))).reduce((sum,r)=>sum+r.cost,0);
  } catch { /* Actual usage remains useful when forecasting is unavailable. */ }
  let agent:UsageSnapshot['agent']=null;
  try {
    const result=await query<{agentUsage:{totalUsedCents:number;hardLimitCents:number|null}}>(`query($id:String!){agentUsage(workspaceId:$id){totalUsedCents hardLimitCents}}`,{id:workspaceId});
    if(Number.isFinite(result.agentUsage.totalUsedCents)&&result.agentUsage.totalUsedCents>=0)agent={used:result.agentUsage.totalUsedCents/100,hardLimit:result.agentUsage.hardLimitCents===null?null:result.agentUsage.hardLimitCents/100};
  } catch { /* Optional meter; never turn missing agent usage into zero. */ }
  const resources=costRows(actual.usage);
  const metered=resources.reduce((sum,r)=>sum+r.cost,0);
  const current=typeof customer.currentUsage==='number' && Number.isFinite(customer.currentUsage) && customer.currentUsage>=0?customer.currentUsage:null;
  return {status:'connected',updatedAt:new Date().toISOString(),workspace:context.workspace.name,period:customer.billingPeriod,current,forecast:forecast===null?null:forecast+Math.max(0,(current??metered)-metered),softLimit:customer.usageLimit?.softLimit??null,hardLimit:customer.usageLimit?.hardLimit??null,resources,agent};
}
let cache:{expires:number;value:UsageSnapshot}|undefined;
let pending:Promise<UsageSnapshot>|undefined;
export async function getRailwayUsage():Promise<UsageSnapshot> {
  const empty={updatedAt:null,workspace:null,period:null,current:null,forecast:null,softLimit:null,hardLimit:null,resources:[]};
  const token=process.env.RAILWAY_API_TOKEN,workspace=process.env.RAILWAY_USAGE_WORKSPACE_ID;
  if(!token || !workspace)return {...empty,status:'not_connected',message:'Connect Railway to display actual usage.'};
  if(cache && cache.expires>Date.now())return cache.value;
  if(pending)return pending;
  pending=fetchRailwayUsage(token,workspace).catch(()=>({...empty,status:'unavailable' as const,message:'Railway could not be reached. Check the connection or try again later.'})).then(value=>{cache={expires:Date.now()+(value.status==='connected'?300000:30000),value};return value;}).finally(()=>{pending=undefined;});
  return pending;
}
