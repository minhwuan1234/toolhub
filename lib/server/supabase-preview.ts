import type {ConnectionPreview,PreviewColumn} from '../connection-preview';
export class PreviewError extends Error {constructor(message:string,public status=400){super(message);}}
export async function readLimitedJSON(source:Request|Response,limit:number):Promise<unknown>{
 const reader=source.body?.getReader();if(!reader)throw new PreviewError('Empty response.');
 let size=0;const chunks:Uint8Array[]=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new PreviewError('Data is too large to preview. Choose a smaller table.',413);}chunks.push(value);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new PreviewError('Invalid JSON response.',502);}
}
function object(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
export function parsePreviewRequest(raw:unknown){
 const body=object(raw);const {url,key,table}=body;const page=body.page??0;
 if(typeof url!=='string'||!/^https:\/\/[a-z0-9]{10,40}\.supabase\.co\/?$/.test(url))throw new PreviewError('Enter the HTTPS Project URL from Supabase.');
 if(typeof key!=='string'||key.length<20||key.length>4096||!/^[A-Za-z0-9_.=-]+$/.test(key))throw new PreviewError('Enter a valid Supabase API key.');
 if(typeof table!=='string'||!/^([A-Za-z_][A-Za-z0-9_]{0,62}\.)?[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(table))throw new PreviewError('Enter a table name, for example public.outreach_jobs.');
 if(typeof page!=='number'||!Number.isInteger(page)||page<0||page>1000)throw new PreviewError('Invalid page.');
 const [schema,name]=table.includes('.')?table.split('.'):['public',table];
 if(['auth','storage','vault','pg_catalog','information_schema'].includes(schema))throw new PreviewError('Select an application data schema.');
 return {url:url.replace(/\/$/,''),key,schema,name,page};
}
export async function previewSupabase(raw:unknown,fetcher:typeof fetch=fetch):Promise<ConnectionPreview>{
 const {url,key,schema,name,page}=parsePreviewRequest(raw);
 const headers:Record<string,string>={apikey:key,'Accept-Profile':schema,Accept:'application/json'};
 if(key.startsWith('eyJ'))headers.Authorization=`Bearer ${key}`;
 async function get(path:string,accept='application/json'){
  let response:Response;
  try{response=await fetcher(`${url}/rest/v1/${path}`,{method:'GET',headers:{...headers,Accept:accept},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});}catch{throw new PreviewError('Cannot reach Supabase. Check the Project URL and try again.',502);}
  if(!response.ok){await response.body?.cancel();if(response.status===401)throw new PreviewError('Supabase rejected the API key.',401);if(response.status===403)throw new PreviewError('This key cannot read the selected table. Check grants and RLS.',403);if([400,404,406].includes(response.status))throw new PreviewError('Table or schema is unavailable. Check its name, API exposure and read permissions.',400);if(response.status===429)throw new PreviewError('Supabase rate limit reached. Try again shortly.',429);throw new PreviewError('Supabase could not return the data. Try again.',502);}
  return readLimitedJSON(response,2*1024*1024);
 }
 let columns:PreviewColumn[]=[];
 // OpenAPI metadata may be disabled. Rows remain usable in that case.
 try{const spec=object(await get('','application/openapi+json'));const definition=object(object(spec.definitions)[name]);columns=Object.entries(object(definition.properties)).map(([field,value])=>{const property=object(value);return {name:field,type:typeof property.format==='string'?property.format:typeof property.type==='string'?property.type:'unknown',nullable:typeof property['x-nullable']==='boolean'?property['x-nullable']:typeof property.nullable==='boolean'?property.nullable:null};});}catch{ /* An unavailable schema must not masquerade as a database schema. */ }
 const ordered=columns.some(column=>column.name==='id');
 const query=new URLSearchParams({select:'*',limit:'26',offset:String(page*25)});if(ordered)query.set('order','id.asc');
 const result=await get(`${encodeURIComponent(name)}?${query}`);
 if(!Array.isArray(result)||result.some(row=>!row||typeof row!=='object'||Array.isArray(row)))throw new PreviewError('Supabase returned an unexpected data format.',502);
 const rows=result.slice(0,25) as Record<string,unknown>[];
 let schemaSource:ConnectionPreview['schemaSource']=columns.length?'database':'unavailable';
 if(!columns.length&&rows.length){schemaSource='rows';columns=[...new Set(rows.flatMap(row=>Object.keys(row)))].map(field=>{const values=rows.map(row=>row[field]).filter(value=>value!==null&&value!==undefined);const types=[...new Set(values.map(value=>Array.isArray(value)?'array':typeof value))];return {name:field,type:types.join(' | ')||'unknown',nullable:null};});}
 return {table:`${schema}.${name}`,rows,columns,schemaSource,page,hasNext:result.length>25,ordered};
}
