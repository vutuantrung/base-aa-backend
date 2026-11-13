import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { JsonTaskFileStore } from '../src/modules/peer-messaging/task-file-store.js';
import { createMockPServer } from './support/mock-pserver.js';

let directory: string;
let pserver: Awaited<ReturnType<typeof createMockPServer>>;
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
  directory = await mkdtemp(join(tmpdir(), 'aab-task-tests-'));
  process.env.AAB_TASK_STORE_DIR = directory;
  pserver = await createMockPServer();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    pserver: { url: pserver.url, vmInfo: {
      udid: 'task-test-vm', sdk: '', model: '', abi: '',
      forSearch: false, platforms: []
    } }
  });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await pserver.arrival;
  for (let attempt = 0; attempt < 100 && !app.pserverConnector?.connected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(app.pserverConnector?.connected, true);
});
after(async () => {
  if (app) await app.close();
  if (pserver) await pserver.close();
  delete process.env.AAB_TASK_STORE_DIR;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('PServer -> AAB: persisted, EServer delivery and received ACK; AAUI notified', async () => {
  const e = connection('eserver', 'e-task-1');
  await e.ready;
  const ui = connection('aaui');
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
      const timer = setTimeout(() => reject(new Error('AAUI lifecycle event missing')), 3000);
      ui.client.once('task:lifecycle', value => { clearTimeout(timer); resolve(value); });
    });
    const result: any = await pserver.connected!.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'pserver', to: 'eserver', toInstanceId: 'e-task-1',
      payload: { type: 'demo.task.request', data: task }
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
    // forwarded to PServer and observed by AAUI after delivery.
    const finished = { ...task, status: 'finished', updatedTime: task.updatedTime + 5000 };
    const returned = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PServer did not receive result')), 3000);
      pserver.connected!.once('peer:message', (value, ack) => {
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
      kind: 'response', from: 'eserver', to: 'pserver',
      payload: { type: 'demo.task.result', data: finished }
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

test('offline EServer still gets persisted/received ACK; forwarding failure is separately observed', async () => {
  const task = {
    id: 'task-' + randomUUID(), status: 'inProgress', config: 'offline',
    createdTime: Date.now(), updatedTime: Date.now()
  };
  const ui = connection('aaui');
  await ui.ready;
  try {
    const events: any[] = [];
    const failureEvent = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('No forwarding failure event')), 3000);
      ui.client.on('task:lifecycle', value => {
        events.push(value);
        if (value.event === 'task.forwardFailed') {
          clearTimeout(timer);
          resolve(value);
        }
      });
    });
    const result: any = await pserver.connected!.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'pserver', to: 'eserver', toInstanceId: 'not-online',
      payload: { type: 'demo.task.request', data: task }
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'received');
    assert.deepEqual(await new JsonTaskFileStore(directory).read(task.id), task);
    const failure = await failureEvent;
    assert.equal(failure.status, 'forwardFailed');
    assert.equal(failure.instanceId, 'not-online');
    assert.equal(events[0].status, 'received');
  } finally { ui.client.disconnect(); }
});
