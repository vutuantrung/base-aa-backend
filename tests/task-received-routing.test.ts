import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { JsonTaskFileStore } from '../src/modules/peer-messaging/task-file-store.js';
import { createMockCdc } from './support/mock-cdc.js';

let directory: string;
let cdc: Awaited<ReturnType<typeof createMockCdc>>;
let app: ReturnType<typeof createApplication>;
let base: string;

function connection(peerId: string, instanceId?: string) {
  const client = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false,
    auth: { peerId, ...(instanceId ? { instanceId } : {}) }
  });
  const ready = new Promise<void>((resolve, reject) => {
    client.once('connect', () => resolve());
    client.once('connect_error', reject);
  });
  return { client, ready };
}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'as-task-tests-'));
  process.env.AS_TASK_STORE_DIR = directory;
  cdc = await createMockCdc();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    cdc: { url: cdc.url, vmInfo: {
      udid: 'task-test-vm', sdk: '', model: '', abi: '',
      forSearch: false, platforms: []
    } }
  });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await cdc.waitForArrival();
  for (let attempt = 0; attempt < 100 && !app.cdcConnector?.connected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(app.cdcConnector?.connected, true);
});
after(async () => {
  if (app) await app.close();
  if (cdc) await cdc.close();
  delete process.env.AS_TASK_STORE_DIR;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('Cdc -> AS: persisted, EServer delivery and received ACK; Aa notified', async () => {
  const e = connection('eserver', 'e-task-1');
  await e.ready;
  const ui = connection('aa');
  await ui.ready;
  try {
    const task = {
      id: 'task-' + randomUUID(),
      status: 'inProgress' as const,
      config: 'mock automation',
      createdTime: Date.now(), updatedTime: Date.now()
    };
    const delivered = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('EServer delivery missing')), 3000);
      e.client.once('peer:message', (message, ack) => {
        clearTimeout(timer);
        ack({ ok: true, status: 'received' });
        resolve(message);
      });
    });
    const lifecycle = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Aa lifecycle event missing')), 3000);
      ui.client.once('task:lifecycle', value => { clearTimeout(timer); resolve(value); });
    });
    const result: any = await cdc.connected!.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'cdc', to: 'eserver', toInstanceId: 'e-task-1',
      payload: { type: 'automation.task.request', data: task }
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'received');
    assert.deepEqual((await delivered).payload.data, task);
    const stored = JSON.parse(await readFile(join(directory, task.id + '.json'), 'utf8'));
    assert.deepEqual(stored, task);
    const event = await lifecycle;
    assert.equal(event.status, 'received');
    assert.equal(event.instanceId, 'e-task-1');
    assert.deepEqual(event.task, task);
    // The returned EServer task message is also saved to a distinct file,
    // forwarded to Cdc and observed by Aa after delivery.
    const finished = { ...task, status: 'finished', updatedTime: task.updatedTime + 5000 };
    const returned = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cdc did not receive result')), 3000);
      cdc.connected!.once('peer:message', (value, ack) => {
        clearTimeout(timer);
        ack?.({ ok: true });
        resolve(value);
      });
    });
    const events: any[] = [];
    const forwarded = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('F09 forwarding event missing')), 3000);
      ui.client.on('task:result:lifecycle', value => {
        if (value.task?.id !== task.id) return;
        events.push(value);
        if (value.status === 'forwarded') {
          clearTimeout(timer);
          resolve(value);
        }
      });
    });
    const finishAck: any = await e.client.timeout(3000).emitWithAck('peer:message', {
      kind: 'response', from: 'eserver', to: 'cdc',
      payload: { type: 'automation.task.result', data: finished }
    });
    assert.equal(finishAck.ok, true);
    assert.equal(finishAck.status, 'received');
    assert.deepEqual((await returned).payload.data, finished);
    assert.deepEqual(JSON.parse(await readFile(join(directory, task.id + '.result.json'), 'utf8')), finished);
    assert.equal((await forwarded).status, 'forwarded');
    assert.equal(events[0].status, 'received');
    assert.equal(events[0].instanceId, 'e-task-1');
    assert.equal(events[0].task.status, 'finished');
  } finally { ui.client.disconnect(); e.client.disconnect(); }
});

test('offline EServer still gets persisted/received ACK while delivery remains pending', async () => {
  const task = {
    id: 'task-' + randomUUID(), status: 'inProgress', config: 'offline',
    createdTime: Date.now(), updatedTime: Date.now()
  };
  const ui = connection('aa');
  await ui.ready;
  try {
    const events: any[] = [];
    ui.client.on('task:lifecycle', value => events.push(value));
    const result: any = await cdc.connected!.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'cdc', to: 'eserver', toInstanceId: 'not-online',
      payload: { type: 'automation.task.request', data: task }
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'received');
    assert.deepEqual(await new JsonTaskFileStore(directory).read(task.id), task);
    assert.equal(events[0].status, 'received');
    assert.equal(events.some(event => event.status === 'forwardFailed'), false);
    const store = new JsonTaskFileStore(directory);
    const operation = (await store.reliability.list()).find(record => record.payload.task.id === task.id);
    assert.ok(operation?.state === 'queued' || operation?.state === 'retryable');
    assert.equal(operation?.attempts, 0);
    await store.reliability.close();
  } finally { ui.client.disconnect(); }
});
