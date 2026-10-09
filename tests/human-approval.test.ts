import test from 'node:test';
import assert from 'node:assert/strict';
import { agentLinksStorageKey, agentOutputsStorageKey, handoffDeliveriesStorageKey, deliverApprovedDesignerHandoff, readHandoffDeliveries, syncDesignerHandoffDeliveries } from '../lib/agent-handoff';

void test('an approval gate holds designer output until Approve reaches its handoff', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const previousStorage = globalThis.localStorage;
  const previousWindow = globalThis.window;
  Object.assign(globalThis, { localStorage: storage, window: { dispatchEvent: () => true } });
  try {
    values.set('toolhub:designer-graph:v3', JSON.stringify({ nodes: [{ id: 'approval', kind: 'human-approval', active: true }, { id: 'send', kind: 'agent-handoff', handoffMode: 'send', active: true }], links: [{ source: 'approval', target: 'send', command: 'approve' }] }));
    values.set(agentLinksStorageKey, JSON.stringify([{ source: 'designer', target: 'developer' }]));
    values.set(agentOutputsStorageKey, JSON.stringify([{ agentId: 'designer', runId: 'model-run', content: 'first output', createdAt: '2026-01-01T00:00:00.000Z' }]));
    syncDesignerHandoffDeliveries();
    assert.deepEqual(readHandoffDeliveries(), []);
    deliverApprovedDesignerHandoff('send', 'approval-id', 'first output');
    syncDesignerHandoffDeliveries();
    assert.deepEqual(readHandoffDeliveries().map(item => [item.targetAgentId, item.content, item.runId]), [['developer', 'first output', 'approval:approval-id']]);
    values.set(agentOutputsStorageKey, JSON.stringify([{ agentId: 'designer', runId: 'later-run', content: 'unapproved output', createdAt: '2026-01-02T00:00:00.000Z' }]));
    syncDesignerHandoffDeliveries();
    assert.equal(readHandoffDeliveries()[0].content, 'first output');
    assert.ok(values.has(handoffDeliveriesStorageKey));
  } finally { Object.assign(globalThis, { localStorage: previousStorage, window: previousWindow }); }
});
