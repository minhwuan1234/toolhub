import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePreviewRequest,previewSupabase,readLimitedJSON} from '../lib/server/supabase-preview';
const request={url:'https://abcdefghijklmnopqrst.supabase.co',key:'sb_secret_example_for_tests_only',table:'public.outreach_jobs',page:0};
const urlText=(url:Parameters<typeof fetch>[0])=>typeof url==='string'?url:url instanceof URL?url.href:url.url;
const response=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
await test('rejects non-Supabase hosts, redirects in URL, RPC paths and invalid pages',()=>{
 for(const url of ['http://abcdefghijklmnopqrst.supabase.co','https://localhost','https://abcdefghijklmnopqrst.supabase.co.evil.test','https://abcdefghijklmnopqrst.supabase.co/rest/v1','https://abcdefghijklmnopqrst.supabase.co?key=secret'])assert.throws(()=>parsePreviewRequest({...request,url}));
 for(const table of ['rpc/send','auth.users','jobs?select=*','public.jobs;delete','vault.secrets'])assert.throws(()=>parsePreviewRequest({...request,table}));
 assert.throws(()=>parsePreviewRequest({...request,page:-1}));assert.throws(()=>parsePreviewRequest({...request,page:1.2}));
});
await test('uses only GET, header credentials, no redirects, and bounded pagination',async()=>{
 const calls:{url:string;init:RequestInit}[]=[];
 const fetcher=(async(url,init)=>{calls.push({url:urlText(url),init:init!});return urlText(url).endsWith('/rest/v1/')?response({definitions:{outreach_jobs:{properties:{id:{type:'string',format:'uuid'},status:{type:'string','x-nullable':false}}}}}):response(Array.from({length:26},(_,id)=>({id,status:'pending'})));}) as typeof fetch;
 const result=await previewSupabase({...request,page:2},fetcher);
 assert.equal(result.rows.length,25);assert.equal(result.hasNext,true);assert.equal(result.schemaSource,'database');assert.equal(result.columns[1].nullable,false);
 assert.match(calls[1].url,/offset=50/);assert.match(calls[1].url,/order=id.asc/);
 for(const call of calls){assert.equal(call.init.method,'GET');assert.equal(call.init.redirect,'error');assert.equal(call.init.cache,'no-store');assert.equal(call.init.body,undefined);assert.ok(!call.url.includes(request.key));assert.equal(new Headers(call.init.headers).get('apikey'),request.key);}
 assert.ok(!JSON.stringify(result).includes(request.key));
});
await test('reports observed schema when OpenAPI is unavailable',async()=>{
 const fetcher=(async(url)=>urlText(url).endsWith('/rest/v1/')?new Response(null,{status:404}):response([{id:1,name:'Example',tags:['a']}])) as typeof fetch;
 const result=await previewSupabase(request,fetcher);assert.equal(result.schemaSource,'rows');assert.equal(result.ordered,false);assert.equal(result.columns.find(column=>column.name==='tags')?.type,'array');
});
await test('empty results do not imply full visibility',async()=>{
 const result=await previewSupabase(request,(async(url)=>urlText(url).endsWith('/rest/v1/')?new Response(null,{status:404}):response([])) as typeof fetch);
 assert.equal(result.schemaSource,'unavailable');assert.equal(result.hasNext,false);assert.deepEqual(result.rows,[]);
});
await test('remote failures never echo provider errors or secrets',async()=>{
 for(const status of [401,403,404,429,500])await assert.rejects(()=>previewSupabase(request,(async()=>new Response(request.key,{status})) as typeof fetch),error=>error instanceof Error&&!error.message.includes(request.key));
});
await test('oversized responses and request bodies are rejected',async()=>{
 await assert.rejects(()=>readLimitedJSON(new Response('x'.repeat(100)),10));
 await assert.rejects(()=>readLimitedJSON(new Response('not json'),100));
});
