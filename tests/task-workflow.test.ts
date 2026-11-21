import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonTaskFileStore, type StoredTask, type TaskFileStore } from '../src/modules/task-workflow/task-file-store.js';
import { TaskWorkflow, type TaskLifecycleNotification, type TaskWorkflowCapabilities } from '../src/modules/task-workflow/task-workflow.js';
import type { PeerMessage, PeerId } from '../src/modules/peer-messaging/contracts.js';

function task(id = 'task-workflow-1', status: StoredTask['status'] = 'inProgress'): StoredTask {
  return { id, status, config: 'task-config', createdTime: 100, updatedTime: 100 };
}

function taskRequest(value = task(), extras: object = {}) {
  return {
    version: '1.0', kind: 'request', from: 'pserver', to: 'eserver',
    payload: { type: 'demo.task.request', version: '1.0', data: value }, ...extras
  };
}

function taskResult(value = task('task-workflow-1', 'finished'), extras: object = {}) {
  return {
    version: '1.0', kind: 'response', from: 'eserver', to: 'pserver',
    payload: { type: 'demo.task.result', version: '1.0', data: value }, ...extras
  };
}

const processedMessage: PeerMessage = {
  version: '1.0', kind: 'event', from: 'pserver', to: 'aab', channel: 'worker', event: 'message',
  payload: { type: 'test.processed', version: '1.0', data: {} },
  id: '8a97dbe2-d7f9-4c9b-9dcb-5fd0a3798708', timestamp: 1
};

function harness(options: {
  store?: TaskFileStore;
  instances?: Array<{ instanceId?: string }>;
  eServerReady?: boolean;
  pServerReady?: boolean;
  processMessage?: TaskWorkflowCapabilities['processMessage'];
} = {}) {
  const deferred: Array<() => Promise<void>> = [];
  const taskEvents: TaskLifecycleNotification[] = [];
  const resultEvents: TaskLifecycleNotification[] = [];
  const processed: Array<{ value: unknown; from: PeerId; instanceId?: string }> = [];
  const store = options.store ?? {
    async save() {}, async read() { return undefined; }, async saveResult() {}, async listRecent() { return []; }
  };
  const capabilities: TaskWorkflowCapabilities = {
    store,
    listEServerInstances: () => options.instances ?? [],
    isEServerConnectionReady: () => options.eServerReady ?? true,
    isPServerConnected: () => options.pServerReady ?? true,
    async processMessage(value, from, instanceId) {
      processed.push({ value, from, instanceId });
      if (options.processMessage) return options.processMessage(value, from, instanceId);
      return processedMessage;
    },
    defer: work => { deferred.push(work); },
    publishTaskLifecycle: notification => { taskEvents.push(notification); },
    publishTaskResultLifecycle: notification => { resultEvents.push(notification); }
  };
  return { workflow: new TaskWorkflow(capabilities), deferred, taskEvents, resultEvents, processed };
}

test('invalid F08/F09 envelopes and task payloads return exact ACKs without side effects', async () => {
  let saves = 0;
  const store: TaskFileStore = {
    async save() { saves += 1; }, async read() { return undefined; },
    async saveResult() { saves += 1; }, async listRecent() { return []; }
  };
  const setup = harness({ store });
  assert.deepEqual(await setup.workflow.receiveTask({ ...taskRequest(), from: 'eserver' }), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid PServer task envelope'
  });
  assert.deepEqual(await setup.workflow.receiveTask(taskRequest(task('task-invalid', 'finished'))), {
    ok: false, code: 'INVALID_MESSAGE', error: 'Invalid inProgress task payload'
  });
  assert.deepEqual(await setup.workflow.receiveTaskResult({ ...taskResult(), to: 'aaui' }, undefined), {
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

test('F08 waits for persistence, captures explicit target and ACKs before deferred delivery failure', async () => {
  let finishSave: (() => void) | undefined;
  const store: TaskFileStore = {
    save: () => new Promise<void>(resolve => { finishSave = resolve; }),
    async read() { return undefined; }, async saveResult() {}, async listRecent() { return []; }
  };
  let failDelivery: (() => void) | undefined;
  const options = {
    store,
    instances: [{ instanceId: 'single-instance' }],
    processMessage: async () => new Promise<PeerMessage>((_resolve, reject) => {
      failDelivery = () => reject(new Error('downstream ACK failed'));
    })
  };
  const setup = harness(options);
  const pendingReceipt = setup.workflow.receiveTask(taskRequest(task(), { toInstanceId: 'explicit-instance' }));
  await Promise.resolve();
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
  await Promise.resolve();
  assert.equal(failDelivery !== undefined, true);
  assert.equal(setup.taskEvents.length, 1);
  failDelivery?.();
  await deferredForward;
  assert.equal(setup.processed[0]?.from, 'pserver');
  assert.equal(setup.processed[0]?.instanceId, undefined);
  assert.deepEqual(setup.processed[0]?.value, {
    version: '1.0', kind: 'request', from: 'pserver', to: 'eserver', toInstanceId: 'explicit-instance',
    channel: 'worker', event: 'message',
    payload: { type: 'demo.task.request', version: '1.0', data: task() },
    id: receipt.data.id
  });
  assert.equal(setup.taskEvents.at(1)?.status, 'forwardFailed');
  assert.equal(setup.taskEvents.at(1)?.reason, 'downstream ACK failed');
});

test('F08 falls back to the sole registered EServer when no target is supplied', async () => {
  const setup = harness({ instances: [{ instanceId: 'sole-worker' }] });
  const receipt = await setup.workflow.receiveTask(taskRequest());
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.data.toInstanceId, 'sole-worker');
  await setup.deferred[0]?.();
  assert.deepEqual(setup.processed[0]?.value, {
    version: '1.0', kind: 'request', from: 'pserver', to: 'eserver', toInstanceId: 'sole-worker',
    channel: 'worker', event: 'message',
    payload: { type: 'demo.task.request', version: '1.0', data: task() },
    id: receipt.data.id
  });
  assert.equal(setup.taskEvents.at(1)?.status, 'forwarded');
});

test('F08 persists unresolved target receipts and reports captured resolution or physical readiness failures', async () => {
  const unresolved = harness({ instances: [{ instanceId: 'one' }, { instanceId: 'two' }] });
  const receipt = await unresolved.workflow.receiveTask(taskRequest());
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.status, 'received');
  assert.equal('toInstanceId' in receipt.data, false);
  assert.equal(unresolved.taskEvents.at(0)?.instanceId, null);
  await unresolved.deferred[0]?.();
  assert.equal(unresolved.processed.length, 0);
  assert.equal(unresolved.taskEvents[1]?.reason, 'No unique EServer destination; specify toInstanceId');

  const offline = harness({ instances: [{ instanceId: 'captured' }], eServerReady: false });
  const offlineReceipt = await offline.workflow.receiveTask(taskRequest());
  assert.equal(offlineReceipt.ok, true);
  await offline.deferred[0]?.();
  assert.equal(offline.processed.length, 0);
  assert.equal(offline.taskEvents.at(1)?.reason, 'EServer is offline');
});

test('F08 persistence rejection has no receipt notification or forwarding', async () => {
  const store: TaskFileStore = {
    async save() { throw new Error('disk full'); }, async read() { return undefined; },
    async saveResult() {}, async listRecent() { return []; }
  };
  const setup = harness({ store, instances: [{ instanceId: 'worker' }] });
  assert.deepEqual(await setup.workflow.receiveTask(taskRequest()), {
    ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task at AAB'
  });
  assert.equal(setup.taskEvents.length, 0);
  assert.equal(setup.deferred.length, 0);
});

test('F08 duplicate task ID rejects the second receipt without replacing or rescheduling the first', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aab-workflow-f08-duplicate-'));
  try {
    const store = new JsonTaskFileStore(directory);
    const original = task(`task-${randomUUID()}`);
    const setup = harness({ store });

    const firstReceipt = await setup.workflow.receiveTask(taskRequest(original));
    const duplicateReceipt = await setup.workflow.receiveTask(taskRequest({ ...original, config: 'changed retry' }));

    assert.equal(firstReceipt.ok, true);
    if (firstReceipt.ok) assert.equal(firstReceipt.status, 'received');
    assert.deepEqual(duplicateReceipt, {
      ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task at AAB'
    });
    assert.deepEqual(await store.read(original.id), original);
    assert.deepEqual(setup.taskEvents.map(event => event.status), ['received']);
    assert.equal(setup.deferred.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('F09 validates original correlation, writes compatible result file exclusively and propagates authenticated instance', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aab-workflow-f09-'));
  try {
    const store = new JsonTaskFileStore(directory);
    const original = task(`task-${randomUUID()}`);
    await store.save(original);
    const setup = harness({ store });
    const mismatched = { ...original, status: 'finished' as const, config: 'different', updatedTime: 200 };
    assert.deepEqual(await setup.workflow.receiveTaskResult(taskResult(mismatched), 'worker-1'), {
      ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task result at AAB'
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

    assert.deepEqual(await setup.workflow.receiveTaskResult(taskResult(finished), 'worker-1'), {
      ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task result at AAB'
    });
    assert.equal(setup.resultEvents.at(0)?.status, 'received');
    assert.equal(setup.resultEvents.length, 1);
    assert.equal(setup.deferred.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('F09 receipt succeeds while offline PServer failure is reported asynchronously', async () => {
  const setup = harness({ pServerReady: false });
  const receipt = await setup.workflow.receiveTaskResult(taskResult(), 'worker-9');
  assert.equal(receipt.ok, true);
  if (!receipt.ok) return;
  assert.equal(receipt.status, 'received');
  assert.deepEqual(setup.resultEvents.map(event => event.status), ['received']);
  await setup.deferred[0]?.();
  assert.deepEqual(setup.resultEvents.map(event => event.status), ['received', 'forwardFailed']);
  assert.equal(setup.resultEvents[1]?.reason, 'PServer is offline');
  assert.equal(setup.processed.length, 0);
});

test('F09 does not issue a receipt or schedule forwarding until result persistence resolves', async () => {
  let finishSave: (() => void) | undefined;
  const store: TaskFileStore = {
    async save() {}, async read() { return undefined; },
    saveResult: () => new Promise<void>(resolve => { finishSave = resolve; }),
    async listRecent() { return []; }
  };
  const setup = harness({ store });
  const pendingReceipt = setup.workflow.receiveTaskResult(taskResult(), 'worker-waiting');
  await Promise.resolve();
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
