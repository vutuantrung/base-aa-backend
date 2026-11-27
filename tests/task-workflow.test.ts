import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonTaskFileStore, type StoredTask, type TaskFileStore } from '../src/modules/task-workflow/task-file-store.js';
import { TaskWorkflow, type TaskLifecycleNotification, type TaskWorkflowCapabilities } from '../src/modules/task-workflow/task-workflow.js';
import type { PeerMessage, PeerId } from '../src/modules/peer-messaging/contracts.js';
import type { PeerMessageAck } from '../src/modules/peer-messaging/contracts.js';
import type { TaskOperationPayload } from '../src/modules/task-workflow/task-file-store.js';
import { MemoryReliableRecordStore } from './helpers/memory-reliable-store.js';
import type { ReliableRecordStore } from '../src/shared/persistence/atomic-json-record-store.js';

function task(id = 'task-workflow-1', status: StoredTask['status'] = 'inProgress'): StoredTask {
  return { id, status, config: 'task-config', createdTime: 100, updatedTime: 100 };
}

function taskRequest(value = task(), extras: object = {}) {
  return {
    version: '1.0', kind: 'request', from: 'cdc', to: 'eserver',
    payload: { type: 'automation.task.request', version: '1.0', data: value }, ...extras
  };
}

function taskResult(value = task('task-workflow-1', 'finished'), extras: object = {}) {
  return {
    version: '1.0', kind: 'response', from: 'eserver', to: 'cdc',
    payload: { type: 'automation.task.result', version: '1.0', data: value }, ...extras
  };
}

const processedMessage: PeerMessage = {
  version: '1.0', kind: 'event', from: 'cdc', to: 'as', channel: 'worker', event: 'message',
  payload: { type: 'test.processed', version: '1.0', data: {} },
  id: '8a97dbe2-d7f9-4c9b-9dcb-5fd0a3798708', timestamp: 1
};

function harness(options: {
  store?: TaskFileStore;
  instances?: Array<{ instanceId?: string }>;
  eServerReady?: boolean;
  cdcReady?: boolean;
  processMessage?: TaskWorkflowCapabilities['processMessage'];
  prepareForDurableDelivery?: TaskWorkflowCapabilities['prepareForDurableDelivery'];
  deliverPreparedMessage?: TaskWorkflowCapabilities['deliverPreparedMessage'];
  outbox?: TaskWorkflowCapabilities['outbox'];
} = {}) {
  const deferred: Array<() => Promise<void>> = [];
  const taskEvents: TaskLifecycleNotification[] = [];
  const resultEvents: TaskLifecycleNotification[] = [];
  const processed: Array<{ value: unknown; from: PeerId; instanceId?: string }> = [];
  const store = options.store ?? {
    async save() {}, async read(taskId: string) { return task(taskId); }, async saveResult() {}, async listRecent() { return []; }
  };
  const outbox = options.outbox ?? (store instanceof JsonTaskFileStore
    ? store.reliability
    : new MemoryReliableRecordStore<TaskOperationPayload, PeerMessageAck>());
  const capabilities: TaskWorkflowCapabilities = {
    store,
    outbox,
    ...(store instanceof JsonTaskFileStore ? {
      hasLegacyOperation: (kind: 'F08' | 'F09', taskId: string) => store.hasLegacyOperation(kind, taskId),
      projectLegacyOperation: (payload: TaskOperationPayload) => store.projectLegacyOperation(payload)
    } : {}),
    listEServerInstances: () => options.instances ?? [],
    isEServerConnectionReady: () => options.eServerReady ?? true,
    isCdcConnected: () => options.cdcReady ?? true,
    async processMessage(value, from, instanceId) {
      processed.push({ value, from, instanceId });
      if (options.processMessage) return options.processMessage(value, from, instanceId);
      return processedMessage;
    },
    ...(options.prepareForDurableDelivery ? { prepareForDurableDelivery: options.prepareForDurableDelivery } : {}),
    ...(options.deliverPreparedMessage ? { deliverPreparedMessage: options.deliverPreparedMessage } : {}),
    defer: work => { deferred.push(work); },
    publishTaskLifecycle: notification => { taskEvents.push(notification); },
    publishTaskResultLifecycle: notification => { resultEvents.push(notification); }
  };
  return {
    workflow: new TaskWorkflow(capabilities), deferred, taskEvents, resultEvents, processed, outbox,
    setInstances(instances: Array<{ instanceId?: string }>) { options.instances = instances; }
  };
}

test('invalid F08/F09 envelopes and task payloads return exact ACKs without side effects', async () => {
  let saves = 0;
  const store: TaskFileStore = {
    async save() { saves += 1; }, async read() { return undefined; },
    async saveResult() { saves += 1; }, async listRecent() { return []; }
  };
  const setup = harness({ store });
  assert.deepEqual(await setup.workflow.receiveTask({ ...taskRequest(), from: 'eserver' }), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid Cdc task envelope'
  });
  assert.deepEqual(await setup.workflow.receiveTask(taskRequest(task('task-invalid', 'finished'))), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid inProgress task payload'
  });
  assert.deepEqual(await setup.workflow.receiveTaskResult({ ...taskResult(), to: 'aa' }, undefined), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid EServer task result envelope'
  });
  assert.deepEqual(await setup.workflow.receiveTaskResult(taskResult(task('task-invalid', 'inProgress')), undefined), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid finished task result payload'
  });
  assert.equal(saves, 0);
  assert.equal(setup.deferred.length, 0);
  assert.equal(setup.taskEvents.length, 0);
  assert.equal(setup.resultEvents.length, 0);
});

test('F08 waits for persistence, captures explicit target and retains ambiguous delivery outcome', async () => {
  let finishSave: (() => void) | undefined;
  let started!: () => void;
  const commitStarted = new Promise<void>(resolve => { started = resolve; });
  const memory = new MemoryReliableRecordStore<TaskOperationPayload, PeerMessageAck>();
  const outbox: ReliableRecordStore<TaskOperationPayload, PeerMessageAck> = {
    initialize: () => memory.initialize(), get: key => memory.get(key), list: () => memory.list(),
    transition: (key, state, changes) => memory.transition(key, state, changes), close: () => memory.close(),
    create: record => new Promise(resolve => {
      finishSave = () => { void memory.create(record).then(resolve); };
      started();
    })
  };
  let failDelivery: (() => void) | undefined;
  let markDeliveryStarted!: () => void;
  const deliveryStarted = new Promise<void>(resolve => { markDeliveryStarted = resolve; });
  const options = {
    instances: [{ instanceId: 'single-instance' }],
    processMessage: async () => new Promise<PeerMessage>((_resolve, reject) => {
      markDeliveryStarted();
      failDelivery = () => reject(new Error('downstream ACK failed'));
    })
  };
  const setup = harness({ ...options, outbox });
  const pendingReceipt = setup.workflow.receiveTask(taskRequest(task(), { toInstanceId: 'explicit-instance' }));
  await commitStarted;
  assert.equal(finishSave !== undefined, true);
  assert.equal(setup.taskEvents.length, 0);
  assert.equal(setup.deferred.length, 0);
  options.instances = [];
  finishSave?.();
  const receipt = await pendingReceipt;
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.status, 'received');
  assert.equal(receipt.data.toInstanceId, 'explicit-instance');
  assert.equal(setup.taskEvents.at(0)?.status, 'received');
  assert.equal(setup.taskEvents.at(0)?.instanceId, 'explicit-instance');
  assert.equal(setup.deferred.length, 1);

  const deferredForward = setup.deferred[0]?.();
  await deliveryStarted;
  assert.equal(failDelivery !== undefined, true);
  assert.equal(setup.taskEvents.length, 1);
  failDelivery?.();
  await deferredForward;
  assert.equal(setup.processed[0]?.from, 'cdc');
  assert.equal(setup.processed[0]?.instanceId, undefined);
  const outbound = setup.processed[0]?.value;
  assert.ok(outbound && typeof outbound === 'object');
  assert.equal(Reflect.get(outbound, 'toInstanceId'), 'explicit-instance');
  assert.equal(Reflect.get(outbound, 'id'), receipt.data.id);
  assert.equal(typeof Reflect.get(outbound, 'timestamp'), 'number');
  assert.deepEqual(setup.taskEvents.map(event => event.status), ['received']);
  const [operation] = await setup.outbox.list();
  assert.equal(operation?.state, 'uncertain');
});

test('F08 falls back to the sole registered EServer when no target is supplied', async () => {
  const setup = harness({ instances: [{ instanceId: 'sole-worker' }] });
  const receipt = await setup.workflow.receiveTask(taskRequest());
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.data.toInstanceId, 'sole-worker');
  await setup.deferred[0]?.();
  assert.equal(setup.processed[0]?.from, 'cdc');
  const delivered = setup.processed[0]?.value;
  assert.ok(delivered && typeof delivered === 'object');
  assert.equal(Reflect.get(delivered, 'toInstanceId'), 'sole-worker');
  assert.equal(Reflect.get(delivered, 'id'), receipt.data.id);
  const deliveredPayload = Reflect.get(delivered, 'payload');
  assert.ok(deliveredPayload && typeof deliveredPayload === 'object');
  assert.deepEqual(Reflect.get(deliveredPayload, 'data'), task());
  assert.equal(setup.taskEvents.at(1)?.status, 'forwarded');
});

test('F08 captured sole-instance identity remains in the exact duplicate ACK after topology changes', async () => {
  const setup = harness({ instances: [{ instanceId: 'captured-worker' }] });
  const original = task('task-captured-target');
  const first = await setup.workflow.receiveTask(taskRequest(original));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  setup.setInstances([{ instanceId: 'different-worker' }]);
  const duplicate = await setup.workflow.receiveTask(taskRequest(original));
  assert.deepEqual(duplicate, first);
  if (duplicate.ok) assert.equal(duplicate.data.toInstanceId, 'captured-worker');
  assert.equal(setup.deferred.length, 1);
});

test('F08 persists unresolved target receipts as terminal failure and queues captured offline targets', async () => {
  const unresolved = harness({ instances: [{ instanceId: 'one' }, { instanceId: 'two' }] });
  const receipt = await unresolved.workflow.receiveTask(taskRequest());
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.status, 'received');
  assert.equal('toInstanceId' in receipt.data, false);
  assert.equal(unresolved.taskEvents.at(0)?.instanceId, null);
  assert.equal(unresolved.processed.length, 0);
  assert.deepEqual(unresolved.taskEvents.map(event => event.status), ['received', 'forwardFailed']);
  assert.match(unresolved.taskEvents[1]?.reason ?? '', /Multiple EServer/);

  const offline = harness({ instances: [{ instanceId: 'captured' }], eServerReady: false });
  const offlineReceipt = await offline.workflow.receiveTask(taskRequest());
  assert.equal(offlineReceipt.ok, true);
  await offline.deferred[0]?.();
  assert.equal(offline.processed.length, 0);
  assert.equal(offline.taskEvents.length, 1);
});

test('F08 capacity rejection has no receipt notification or forwarding', async () => {
  const memory = new MemoryReliableRecordStore<TaskOperationPayload, PeerMessageAck>();
  const outbox: ReliableRecordStore<TaskOperationPayload, PeerMessageAck> = {
    initialize: () => memory.initialize(), get: key => memory.get(key), list: () => memory.list(),
    transition: (key, state, changes) => memory.transition(key, state, changes), close: () => memory.close(),
    async create() { throw new Error('Reliability queue capacity is full'); }
  };
  const setup = harness({ outbox, instances: [{ instanceId: 'worker' }] });
  assert.deepEqual(await setup.workflow.receiveTask(taskRequest()), {
    ok: false, code: 'DELIVERY_FAILED', error: 'Reliability queue capacity is full'
  });
  assert.equal(setup.taskEvents.length, 0);
  assert.equal(setup.deferred.length, 0);
});

test('F08 duplicate task ID replays the exact receipt ACK without replacing or rescheduling the first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'as-workflow-f08-duplicate-'));
  const store = new JsonTaskFileStore(directory);
  try {
    const original = task(`task-${randomUUID()}`);
    const setup = harness({ store, instances: [{ instanceId: 'worker' }] });

    const firstReceipt = await setup.workflow.receiveTask(taskRequest(original));
    const duplicateReceipt = await setup.workflow.receiveTask(taskRequest(original));

    assert.equal(firstReceipt.ok, true);
    if (firstReceipt.ok) assert.equal(firstReceipt.status, 'received');
    assert.deepEqual(duplicateReceipt, firstReceipt);
    if (firstReceipt.ok && 'data' in firstReceipt) assert.equal(firstReceipt.data.toInstanceId, 'worker');
    assert.deepEqual(await store.read(original.id), original);
    assert.deepEqual(setup.taskEvents.map(event => event.status), ['received']);
    assert.equal(setup.deferred.length, 1);
    const [operation] = await store.reliability.list();
    assert.equal(operation?.state, 'queued');
    assert.equal(operation?.payload.targetId, 'worker');
    const conflicting = await setup.workflow.receiveTask(taskRequest({ ...original, config: 'changed' }));
    assert.deepEqual(conflicting, {
      ok: false, code: 'INVALID_MESSAGE', error: 'Conflicting duplicate task operation'
    });

    await store.reliability.close();
    const reopenedStore = new JsonTaskFileStore(directory);
    try {
      const reopened = harness({ store: reopenedStore, instances: [] });
      assert.deepEqual(await reopened.workflow.receiveTask(taskRequest(original)), firstReceipt);
      assert.equal(reopened.deferred.length, 0);
      await reopenedStore.reliability.close();
    } finally {
      await reopenedStore.reliability.close();
    }
  } finally {
    await store.reliability.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('concurrent same-key F08 arrivals may both transform before commit but only one receipt and send are published', async () => {
  let transformCount = 0;
  let enteredResolve!: () => void;
  const bothEntered = new Promise<void>(resolve => { enteredResolve = resolve; });
  let releaseResolve!: () => void;
  const release = new Promise<void>(resolve => { releaseResolve = resolve; });
  const setup = harness({
    instances: [{ instanceId: 'worker' }],
    async prepareForDurableDelivery() {
      transformCount += 1;
      if (transformCount === 2) enteredResolve();
      await release;
      return processedMessage;
    }
  });
  const original = task('task-concurrent-prepare');
  const first = setup.workflow.receiveTask(taskRequest(original));
  const second = setup.workflow.receiveTask(taskRequest(original));
  await bothEntered;
  releaseResolve();
  const receipts = await Promise.all([first, second]);

  assert.equal(transformCount, 2);
  assert.deepEqual(receipts[0], receipts[1]);
  assert.equal(setup.taskEvents.filter(event => event.status === 'received').length, 1);
  assert.equal(setup.deferred.length, 1);
  await setup.deferred[0]?.();
  assert.equal(setup.processed.length, 1);
  assert.equal((await setup.outbox.list()).length, 1);
});

test('F09 validates original correlation, writes compatible result file exclusively and propagates authenticated instance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'as-workflow-f09-'));
  try {
    const store = new JsonTaskFileStore(directory);
    const original = task(`task-${randomUUID()}`);
    await store.save(original);
    const setup = harness({ store });
    const mismatched = { ...original, status: 'finished' as const, config: 'different', updatedTime: 200 };
    assert.deepEqual(await setup.workflow.receiveTaskResult(taskResult(mismatched), 'worker-1'), {
      ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task result at AS'
    });
    assert.equal(setup.resultEvents.length, 0);
    assert.equal(setup.deferred.length, 0);

    const finished = { ...original, status: 'finished' as const, updatedTime: 200 };
    const receipt = await setup.workflow.receiveTaskResult(taskResult(finished), 'worker-1');
    assert.equal(receipt.ok, true);
    if (!receipt.ok) return;
    assert.equal(receipt.status, 'received');
    assert.equal(receipt.data.sourceInstanceId, 'worker-1');
    assert.deepEqual(JSON.parse(await readFile(join(directory, `${original.id}.result.json`), 'utf8')), finished);
    assert.equal((await readFile(join(directory, `${original.id}.result.json`), 'utf8')).endsWith('\n'), true);
    assert.equal((await stat(join(directory, `${original.id}.result.json`))).mode & 0o777, 0o600);

    assert.deepEqual(await setup.workflow.receiveTaskResult(taskResult(finished), 'worker-1'), receipt);
    assert.equal(setup.resultEvents.at(0)?.status, 'received');
    assert.equal(setup.resultEvents.length, 1);
    assert.equal(setup.deferred.length, 1);
    const conflict = await setup.workflow.receiveTaskResult(taskResult(finished), 'worker-2');
    assert.deepEqual(conflict, {
      ok: false, code: 'INVALID_MESSAGE', error: 'Conflicting duplicate task operation'
    });
    assert.deepEqual((await store.reliability.list()).map(item => item.key), [`F09:${original.id}`]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('F08 request and F09 result for the same task ID occupy distinct idempotency keys', async () => {
  const setup = harness({ instances: [{ instanceId: 'worker-1' }] });
  const original = task(`task-${randomUUID()}`);
  const request = await setup.workflow.receiveTask(taskRequest(original));
  const result = await setup.workflow.receiveTaskResult(taskResult({
    ...original, status: 'finished', updatedTime: original.updatedTime + 1
  }), 'worker-1');
  assert.equal(request.ok, true);
  assert.equal(result.ok, true);
  assert.deepEqual((await setup.outbox.list()).map(item => item.key).sort(),
    [`F08:${original.id}`, `F09:${original.id}`].sort());
});

test('F09 receipt succeeds while offline Cdc delivery remains retryable and unreported as failure', async () => {
  const setup = harness({ cdcReady: false });
  const receipt = await setup.workflow.receiveTaskResult(taskResult(), 'worker-9');
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.status, 'received');
  assert.deepEqual(setup.resultEvents.map(event => event.status), ['received']);
  await setup.deferred[0]?.();
  assert.deepEqual(setup.resultEvents.map(event => event.status), ['received']);
  assert.equal(setup.processed.length, 0);
  assert.equal((await setup.outbox.list())[0]?.state, 'retryable');
});

test('F09 does not issue a receipt or schedule forwarding until result persistence resolves', async () => {
  let finishSave: (() => void) | undefined;
  let started!: () => void;
  const commitStarted = new Promise<void>(resolve => { started = resolve; });
  const memory = new MemoryReliableRecordStore<TaskOperationPayload, PeerMessageAck>();
  const outbox: ReliableRecordStore<TaskOperationPayload, PeerMessageAck> = {
    initialize: () => memory.initialize(), get: key => memory.get(key), list: () => memory.list(),
    transition: (key, state, changes) => memory.transition(key, state, changes), close: () => memory.close(),
    create: record => new Promise(resolve => {
      finishSave = () => { void memory.create(record).then(resolve); };
      started();
    })
  };
  const store: TaskFileStore = {
    async save() {}, async read(taskId) { return task(taskId); }, async saveResult() {},
    async listRecent() { return []; }
  };
  const setup = harness({ store, outbox });
  const pendingReceipt = setup.workflow.receiveTaskResult(taskResult(), 'worker-waiting');
  await commitStarted;
  assert.equal(finishSave !== undefined, true);
  assert.equal(setup.resultEvents.length, 0);
  assert.equal(setup.deferred.length, 0);
  finishSave?.();
  const receipt = await pendingReceipt;
  assert.equal(receipt.ok, true);
  assert.equal(setup.resultEvents.at(0)?.status, 'received');
  assert.equal(setup.deferred.length, 1);
});

test('F09 successful deferred forwarding publishes a separate forwarded lifecycle event', async () => {
  const setup = harness({ processMessage: async () => processedMessage });
  const receipt = await setup.workflow.receiveTaskResult(taskResult(), 'worker-2');
  assert.equal(receipt.ok, true);
  assert.equal(setup.resultEvents[0]?.event, 'task.result.received');
  await setup.deferred[0]?.();
  assert.deepEqual(setup.resultEvents.map(event => event.event), ['task.result.received', 'task.result.forwarded']);
  assert.equal(setup.processed[0]?.from, 'eserver');
  assert.equal(setup.processed[0]?.instanceId, 'worker-2');
});

test('history projection caps at 50 and maps finished results separately from received tasks', async () => {
  let requestedLimit: number | undefined;
  const store: TaskFileStore = {
    async save() {}, async read() { return undefined; }, async saveResult() {},
    async listRecent(limit) {
      requestedLimit = limit;
      return [task('task-in-progress'), task('task-finished', 'finished')];
    }
  };
  const snapshot = await harness({ store }).workflow.createHistorySnapshot();
  assert.equal(requestedLimit, 50);
  assert.deepEqual(snapshot.tasks.map(entry => ({ id: entry.task.id, status: entry.status, event: entry.event })), [
    { id: 'task-in-progress', status: 'received', event: 'task.snapshot' },
    { id: 'task-finished', status: 'finished', event: 'task.snapshot' }
  ]);
  assert.equal(typeof snapshot.timestamp, 'number');
});
