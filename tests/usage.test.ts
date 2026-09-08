import {test} from 'node:test';
import assert from 'node:assert/strict';
import {costRows,usagePercent} from '../lib/usage';
import {fetchRailwayUsage} from '../lib/server/railway-usage';
void test('integrated resource units and egress are costed correctly',()=>{
 const rows=costRows([{measurement:'MEMORY_USAGE_GB',value:43200},{measurement:'CPU_USAGE',value:4320},{measurement:'NETWORK_TX_GB',value:100},{measurement:'NETWORK_TX_GB',value:200},{measurement:'BACKUP_USAGE_GB',value:86400}]);
 assert.deepEqual(rows.map(r=>Number(r.cost.toFixed(2))),[10,2,15,0,0.3]);
 assert.equal(usagePercent(null,5),null);assert.equal(usagePercent(0,5),0);assert.equal(usagePercent(20,5),100);assert.equal(usagePercent(4,5),80);
});
function transport(forecastFails=false,missingTotal=false):typeof fetch {
 return (async(_url,options)=>{
  assert.ok(options);
  assert.equal((options.headers as Record<string,string>).Authorization,'Bearer test-token');
  assert.equal(typeof options.body,'string');
  const body=JSON.parse(options.body as string);assert.ok(!body.query.includes('mutation'));
  if(body.query.includes('workspace(workspaceId'))return Response.json({data:{workspace:{name:'Test workspace',customer:{currentUsage:missingTotal?null:8,billingPeriod:{start:'2026-09-01T00:00:00Z',end:'2026-10-01T00:00:00Z'},usageLimit:{softLimit:10,hardLimit:20}}}}});
  if(body.query.includes('estimatedUsage'))return forecastFails?Response.json({errors:[{message:'provider-private-details'}]}):Response.json({data:{estimatedUsage:[{measurement:'NETWORK_TX_GB',estimatedValue:200}]}});
  if(body.query.includes('agentUsage'))return Response.json({data:{agentUsage:{totalUsedCents:125,hardLimitCents:500}}});
  return Response.json({data:{usage:[{measurement:'NETWORK_TX_GB',value:100}]}});
 }) as typeof fetch;
}
void test('provider total, forecasts, real limits and agent cents remain distinct',async()=>{
 const result=await fetchRailwayUsage('test-token','workspace-test',transport());
 assert.equal(result.current,8);assert.equal(result.forecast,13);assert.equal(result.hardLimit,20);assert.equal(result.agent?.used,1.25);assert.equal(result.agent?.hardLimit,5);
 assert.ok(!JSON.stringify(result).includes('test-token'));
});
void test('missing total and forecast stay unknown instead of becoming zero',async()=>{
 const result=await fetchRailwayUsage('test-token','workspace-test',transport(true,true));
 assert.equal(result.current,null);assert.equal(result.forecast,null);assert.equal(result.resources.find(r=>r.id==='NETWORK_TX_GB')?.cost,5);
});
void test('GraphQL authorization errors fail without leaking private provider details',async()=>{
 await assert.rejects(fetchRailwayUsage('test-token','workspace-test',(async()=>Response.json({errors:[{message:'private-token-detail'}]})) as typeof fetch),/Railway usage is unavailable/);
});
