import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveriesForDesigner, handoffContextForAgent, receiveHandoffContent, routesForAgent, type AgentLink, type AgentOutputSnapshot } from '../lib/agent-handoff';

const links: AgentLink[] = [
  { source: 'ba', target: 'designer' },
  { source: 'designer', target: 'developer' },
  { source: 'ba', target: 'designer' },
];

void test('handoff routes respect Toolhub edge direction and deduplicate agents', () => {
  assert.deepEqual(routesForAgent(links, 'designer'), { incoming: ['ba'], outgoing: ['developer'] });
  assert.deepEqual(routesForAgent(links, 'ba'), { incoming: [], outgoing: ['designer'] });
});

void test('receive handoff uses the sample brief only when no live output is available', () => {
  assert.equal(receiveHandoffContent('Live BA brief', 'Sample screen brief', true), 'Live BA brief');
  assert.equal(receiveHandoffContent('', 'Sample screen brief', true), 'Sample screen brief');
  assert.equal(receiveHandoffContent('', 'Sample screen brief', false), '');
});

void test('send mode delivers the current UI/UX result only to connected destinations', () => {
  const outputs: AgentOutputSnapshot[] = [
    { agentId: 'ba', runId: 'ba-run', content: 'Brief', createdAt: '2026-10-08T00:00:00Z' },
    { agentId: 'designer', runId: 'designer-run', content: 'Screen design', createdAt: '2026-10-08T00:01:00Z' },
  ];
  assert.deepEqual(deliveriesForDesigner(links, outputs, ['handoff-1']), [{
    sourceAgentId: 'designer', targetAgentId: 'developer', handoffNodeId: 'handoff-1',
    runId: 'designer-run', content: 'Screen design', createdAt: '2026-10-08T00:01:00Z',
  }]);
  assert.deepEqual(deliveriesForDesigner(links, outputs, []), []);
  assert.deepEqual(deliveriesForDesigner(links, outputs.filter(output => output.agentId !== 'designer'), ['handoff-1']), []);
  const deliveries = deliveriesForDesigner(links, outputs, ['handoff-1']);
  assert.match(handoffContextForAgent('designer', links, outputs, deliveries, ['receive']), /Brief/);
  assert.equal(handoffContextForAgent('designer', links, outputs, deliveries, ['send']), '');
  assert.match(handoffContextForAgent('developer', links, outputs, deliveries, ['send']), /Screen design/);
  assert.equal(handoffContextForAgent('ba', links, outputs, deliveries, ['send']), '');
});
