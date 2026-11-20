import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceSelectionWorkflow, type ResourceSelectionWorkflowCapabilities } from '../src/modules/resource-selection/resource-selection-workflow.js';
import type { ResourceSelection, StoredSelection } from '../src/modules/resource-selection/resource-selection-store.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';

const originalSelection = { browserProfileId: ' profile-1 ', proxyId: ' proxy-2 ', accountId: ' account-3 ' };
const peerMessageId = 'e38b8679-88e5-4657-b3c8-74368027f38e';
type ForwardStatus = 'forwarded' | 'forwardFailed';
const record: StoredSelection = {
  id: '4b9a5109-6d9c-42c8-aa64-c3bc20be73b2', createdTime: 123,
  selection: { browserProfileId: 'profile-1', proxyId: 'proxy-2', accountId: 'account-3' },
  deliveryStatus: 'pending'
};
const message = (data: unknown = originalSelection, extras: object = {}) => ({
  version: '1.0', kind: 'request', from: 'aaui', to: 'pserver', channel: 'worker', event: 'message',
  payload: { type: 'demo.resource-selection', version: '1.0', data }, ...extras
});
const processedMessage: PeerMessage = {
  version: '1.0', kind: 'request', from: 'aaui', to: 'pserver', channel: 'worker', event: 'message',
  payload: { type: 'demo.resource-selection', version: '1.0', data: record.selection },
  id: 'd2cbad1e-9c33-4000-8000-000000000001', timestamp: 1
};

function harness(options: {
  save?: (selection: ResourceSelection) => Promise<StoredSelection>;
  updateDelivery?: (id: string, status: ForwardStatus, reason?: string) => Promise<void>;
  listRecent?: (limit: number) => Promise<StoredSelection[]>;
  processMessage?: (value: unknown, from: 'aaui') => Promise<PeerMessage>;
} = {}) {
  const notifications: StoredSelection[] = [];
  const schedules: Array<() => Promise<void>> = [];
  const processCalls: Array<{ value: unknown; from: 'aaui' }> = [];
  const writes: Array<{ id: string; status: ForwardStatus; reason?: string }> = [];
  const order: string[] = [];
  const capabilities: ResourceSelectionWorkflowCapabilities = {
    store: {
      async save(selection) {
        order.push('save');
        if (options.save) return options.save(selection);
        return { ...record, selection };
      },
      async updateDelivery(id, status, reason) {
        if (status !== 'forwarded' && status !== 'forwardFailed') throw new Error(`Unexpected status ${status}`);
        writes.push({ id, status, ...(reason === undefined ? {} : { reason }) });
        if (options.updateDelivery) return options.updateDelivery(id, status, reason);
      },
      async listRecent(limit) {
        if (options.listRecent) return options.listRecent(limit ?? 50);
        return [];
      }
    },
    async processMessage(value, from) {
      processCalls.push({ value, from });
      if (options.processMessage) return options.processMessage(value, from);
      return processedMessage;
    },
    defer(work) { order.push('defer'); schedules.push(work); },
    publishUpdated(updated) { order.push(`publish:${updated.deliveryStatus}`); notifications.push(updated); }
  };
  return {
    workflow: new ResourceSelectionWorkflow(capabilities), notifications, schedules, processCalls, writes, order
  };
}

test('invalid resource-selection envelope and IDs return exact ACKs without side effects', async () => {
  let saves = 0;
  const setup = harness({ save: async selection => { saves += 1; return { ...record, selection }; } });
  assert.deepEqual(await setup.workflow.receiveSelection({ ...message(), from: 'eserver' }), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid resource selection envelope'
  });
  assert.deepEqual(await setup.workflow.receiveSelection(message({ ...originalSelection, accountId: ' ' })), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid resource selection IDs'
  });
  assert.deepEqual(await setup.workflow.receiveSelection(message({ ...originalSelection, extra: 'forbidden' })), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid resource selection IDs'
  });
  assert.equal(saves, 0);
  assert.equal(setup.notifications.length, 0);
  assert.equal(setup.schedules.length, 0);
});

test('selection receipt waits for persistence, publishes normalized record, and ACKs original payload independently', async () => {
  let completeSave: (() => void) | undefined;
  const setup = harness({
    save: selection => new Promise(resolve => { completeSave = () => resolve({ ...record, selection }); })
  });
  const pending = setup.workflow.receiveSelection(message(originalSelection, { id: peerMessageId }));
  await Promise.resolve();
  assert.equal(completeSave !== undefined, true);
  assert.deepEqual(setup.order, ['save']);
  assert.equal(setup.notifications.length, 0);
  assert.equal(setup.schedules.length, 0);

  completeSave?.();
  const receipt = await pending;
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.status, 'received');
  assert.equal(receipt.data.id, peerMessageId);
  assert.notEqual(receipt.data.id, record.id);
  assert.deepEqual(receipt.data.payload.data, originalSelection);
  assert.deepEqual(setup.notifications[0]?.selection, record.selection);
  assert.deepEqual(setup.order, ['save', 'publish:pending', 'defer']);
  assert.equal(setup.schedules.length, 1);
  assert.equal(setup.processCalls.length, 0);

  await setup.schedules[0]?.();
  assert.deepEqual(setup.processCalls[0], {
    value: { ...message(), id: peerMessageId }, from: 'aaui'
  });
  assert.deepEqual(setup.writes, [{ id: record.id, status: 'forwarded' }]);
  assert.equal(setup.notifications.at(1)?.deliveryStatus, 'forwarded');
});

test('persistence failure produces no pending notification or deferred work', async () => {
  const setup = harness({ save: async () => { throw new Error('disk full'); } });
  assert.deepEqual(await setup.workflow.receiveSelection(message()), {
    ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist resource selection'
  });
  assert.equal(setup.notifications.length, 0);
  assert.equal(setup.schedules.length, 0);
});

test('forwarded delivery remains forwarded when status sidecar update fails', async () => {
  const setup = harness({ updateDelivery: async () => { throw new Error('sidecar unavailable'); } });
  const receipt = await setup.workflow.receiveSelection(message());
  assert.equal(receipt.ok, true);
  await setup.schedules[0]?.();
  assert.equal(setup.writes[0]?.status, 'forwarded');
  assert.equal(setup.notifications.at(1)?.deliveryStatus, 'forwarded');
  assert.equal('deliveryError' in (setup.notifications.at(1) ?? {}), false);
});

test('failed delivery remains forwardFailed when status sidecar update also fails', async () => {
  const setup = harness({
    processMessage: async () => { throw 'wire rejected'; },
    updateDelivery: async () => { throw new Error('sidecar unavailable'); }
  });
  const receipt = await setup.workflow.receiveSelection(message());
  assert.equal(receipt.ok, true);
  await setup.schedules[0]?.();
  assert.deepEqual(setup.writes[0], { id: record.id, status: 'forwardFailed', reason: 'wire rejected' });
  assert.equal(setup.notifications.at(1)?.deliveryStatus, 'forwardFailed');
  assert.equal(setup.notifications.at(1)?.deliveryError, 'wire rejected');
});

test('empty delivery failure reason is omitted from notification but passed to store fallback', async () => {
  const setup = harness({ processMessage: async () => { throw new Error(''); } });
  const receipt = await setup.workflow.receiveSelection(message());
  assert.equal(receipt.ok, true);
  await setup.schedules[0]?.();
  assert.deepEqual(setup.writes[0], { id: record.id, status: 'forwardFailed', reason: '' });
  assert.equal('deliveryError' in (setup.notifications.at(1) ?? {}), false);
});

test('selection snapshot projection uses the 50-record limit and current timestamp', async () => {
  let requestedLimit = 0;
  const setup = harness({ listRecent: async limit => { requestedLimit = limit; return [record]; } });
  const snapshot = await setup.workflow.createSnapshot();
  assert.equal(requestedLimit, 50);
  assert.deepEqual(snapshot.records, [record]);
  assert.equal(typeof snapshot.timestamp, 'number');
});
