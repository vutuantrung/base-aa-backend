import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResourceSelectionWorkflow, type ResourceSelectionWorkflowCapabilities } from '../src/modules/resource-selection/resource-selection-workflow.js';
import { JsonResourceSelectionStore, type ResourceSelection, type StoredSelection } from '../src/modules/resource-selection/resource-selection-store.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';
import type { PeerMessageAck } from '../src/modules/peer-messaging/contracts.js';
import type { SelectionOperationPayload } from '../src/modules/resource-selection/resource-selection-store.js';
import { MemoryReliableRecordStore } from './helpers/memory-reliable-store.js';

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
  outbox?: ResourceSelectionWorkflowCapabilities['outbox'];
} = {}) {
  const notifications: StoredSelection[] = [];
  const schedules: Array<() => Promise<void>> = [];
  const processCalls: Array<{ value: unknown; from: 'aaui' }> = [];
  const writes: Array<{ id: string; status: ForwardStatus; reason?: string }> = [];
  const order: string[] = [];
  const capabilities: ResourceSelectionWorkflowCapabilities = {
    outbox: options.outbox ?? new MemoryReliableRecordStore<SelectionOperationPayload, PeerMessageAck>(),
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
    async projectLegacyReceipt(saved) {
      order.push('save');
      await options.save?.(saved.selection);
    },
    async processMessage(value, from) {
      processCalls.push({ value, from });
      if (options.processMessage) return options.processMessage(value, from);
      return processedMessage;
    },
    isPServerConnected: () => true,
    defer(work) { order.push('defer'); schedules.push(work); },
    publishUpdated(updated) { order.push(`publish:${updated.deliveryStatus}`); notifications.push(updated); }
  };
  return {
    workflow: new ResourceSelectionWorkflow(capabilities), notifications, schedules, processCalls, writes, order, outbox: capabilities.outbox
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
  let markStarted!: () => void;
  const commitStarted = new Promise<void>(resolve => { markStarted = resolve; });
  const memory = new MemoryReliableRecordStore<SelectionOperationPayload, PeerMessageAck>();
  const outbox: ResourceSelectionWorkflowCapabilities['outbox'] = {
    initialize: () => memory.initialize(), get: key => memory.get(key), list: () => memory.list(),
    transition: (key, state, changes) => memory.transition(key, state, changes), close: () => memory.close(),
    create: operation => new Promise(resolve => {
      completeSave = () => { void memory.create(operation).then(resolve); };
      markStarted();
    })
  };
  const setup = harness({
    outbox
  });
  const pending = setup.workflow.receiveSelection(message(originalSelection, { id: peerMessageId }));
  await commitStarted;
  assert.equal(completeSave !== undefined, true);
  assert.deepEqual(setup.order, []);
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
  assert.equal(setup.processCalls[0]?.from, 'aaui');
  const outbound = setup.processCalls[0]?.value;
  assert.ok(outbound && typeof outbound === 'object');
  assert.equal(Reflect.get(outbound, 'id'), peerMessageId);
  assert.equal(typeof Reflect.get(outbound, 'timestamp'), 'number');
  assert.deepEqual(setup.writes, []);
  assert.equal(setup.notifications.at(1)?.deliveryStatus, 'forwarded');
});

test('persistence failure produces no pending notification or deferred work', async () => {
  const outbox: ResourceSelectionWorkflowCapabilities['outbox'] = {
    async initialize() {}, async get() { return undefined; }, async list() { return []; }, async close() {},
    async create() { throw new Error('disk full'); }, async transition() { throw new Error('not found'); }
  };
  const setup = harness({ outbox });
  assert.deepEqual(await setup.workflow.receiveSelection(message()), {
    ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist resource selection'
  });
  assert.equal(setup.notifications.length, 0);
  assert.equal(setup.schedules.length, 0);
});

test('canonical delivered state projects forwarded even when no legacy sidecar is written', async () => {
  const setup = harness({ updateDelivery: async () => { throw new Error('sidecar unavailable'); } });
  const receipt = await setup.workflow.receiveSelection(message());
  assert.equal(receipt.ok, true);
  await setup.schedules[0]?.();
  assert.equal(setup.writes.length, 0);
  assert.equal(setup.notifications.at(1)?.deliveryStatus, 'forwarded');
  assert.equal('deliveryError' in (setup.notifications.at(1) ?? {}), false);
});

test('ambiguous delivery outcome remains pending and uncertain instead of unsafe retry', async () => {
  const setup = harness({
    processMessage: async () => { throw 'wire rejected'; },
    updateDelivery: async () => { throw new Error('sidecar unavailable'); }
  });
  const receipt = await setup.workflow.receiveSelection(message());
  assert.equal(receipt.ok, true);
  await setup.schedules[0]?.();
  const [operation] = await setup.outbox.list();
  assert.equal(operation?.state, 'uncertain');
  assert.deepEqual(setup.writes, []);
  assert.equal(setup.notifications.length, 1);
  assert.equal(setup.notifications[0]?.deliveryStatus, 'pending');
});

test('redelivery with a stable message ID replays the canonical ACK without duplicate receipt or send', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aab-selection-redelivery-'));
  const store = new JsonResourceSelectionStore(directory);
  try {
    const schedules: Array<() => Promise<void>> = [];
    const notifications: StoredSelection[] = [];
    const capabilities: ResourceSelectionWorkflowCapabilities = {
      store,
      outbox: store.reliability,
      projectLegacyReceipt: saved => store.projectLegacyReceipt(saved),
      async processMessage() { return processedMessage; },
      isPServerConnected: () => true,
      defer(work) { schedules.push(work); },
      publishUpdated(record) { notifications.push(record); }
    };
    const workflow = new ResourceSelectionWorkflow(capabilities);
    const redelivered = message(originalSelection, { id: peerMessageId });

    const first = await workflow.receiveSelection(redelivered);
    const second = await workflow.receiveSelection(redelivered);
    const [canonicalReceipt] = await store.reliability.list();
    assert.ok(canonicalReceipt);
    await writeFile(join(directory, `${canonicalReceipt.payload.record.id}.delivery.json`), '{corrupt legacy sidecar');
    const receipts = await store.listRecent(50);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.deepEqual(second, first);
    assert.equal(receipts.length, 1);
    assert.deepEqual(receipts.map(receipt => receipt.selection), [record.selection]);
    assert.deepEqual(receipts.map(receipt => receipt.deliveryStatus), ['pending']);
    assert.equal(schedules.length, 1);
    assert.deepEqual(notifications.map(notification => notification.deliveryStatus), ['pending']);
    await store.reliability.close();

    const reopenedStore = new JsonResourceSelectionStore(directory);
    try {
      const reopenedSchedules: Array<() => Promise<void>> = [];
      const reopened = new ResourceSelectionWorkflow({
        ...capabilities,
        store: reopenedStore,
        outbox: reopenedStore.reliability,
        projectLegacyReceipt: saved => reopenedStore.projectLegacyReceipt(saved),
        defer(work) { reopenedSchedules.push(work); }
      });
      assert.deepEqual(await reopened.receiveSelection(redelivered), first);
      assert.equal(reopenedSchedules.length, 0);
      assert.deepEqual(await reopened.receiveSelection(message({ ...originalSelection, accountId: 'other-account' }, { id: peerMessageId })), {
        ok: false, code: 'INVALID_MESSAGE', error: 'Conflicting duplicate resource selection submission'
      });
    } finally {
      await reopenedStore.reliability.close();
    }
  } finally {
    await store.reliability.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('selection submissions without a caller ID remain independently receipted', async () => {
  const setup = harness();
  const first = await setup.workflow.receiveSelection(message());
  const second = await setup.workflow.receiveSelection(message());
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.notDeepEqual(first, second);
  assert.equal((await setup.outbox.list()).length, 2);
  assert.equal(setup.schedules.length, 2);
});

test('ambiguous empty delivery failure reason remains private to canonical uncertain state', async () => {
  const setup = harness({ processMessage: async () => { throw new Error(''); } });
  const receipt = await setup.workflow.receiveSelection(message());
  assert.equal(receipt.ok, true);
  await setup.schedules[0]?.();
  const [operation] = await setup.outbox.list();
  assert.equal(operation?.state, 'uncertain');
  assert.equal(setup.writes.length, 0);
  assert.equal(setup.notifications.length, 1);
});

test('selection snapshot projection uses the 50-record limit and current timestamp', async () => {
  let requestedLimit = 0;
  const setup = harness({ listRecent: async limit => { requestedLimit = limit; return [record]; } });
  const snapshot = await setup.workflow.createSnapshot();
  assert.equal(requestedLimit, 50);
  assert.deepEqual(snapshot.records, [record]);
  assert.equal(typeof snapshot.timestamp, 'number');
});
