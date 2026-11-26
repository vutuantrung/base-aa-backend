import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { createMockCdc } from './support/mock-cdc.js';

let app: ReturnType<typeof createApplication>;
let cdc: Awaited<ReturnType<typeof createMockCdc>>;
let base: string;
let storeDirectory: string;
let oldStoreDirectory: string | undefined;

function connect(peerId: string, instanceId?: string) {
  const socket = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false,
    auth: { peerId, ...(instanceId ? { instanceId } : {}) }
  });
  const ready = new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return { socket, ready };
}

before(async () => {
  storeDirectory = await mkdtemp(join(tmpdir(), 'as-task-roundtrip-'));
  oldStoreDirectory = process.env.AS_TASK_STORE_DIR;
  process.env.AS_TASK_STORE_DIR = storeDirectory;
  cdc = await createMockCdc();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    cdc: { url: cdc.url, vmInfo: {
      udid: 'test-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: []
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
  if (oldStoreDirectory === undefined) delete process.env.AS_TASK_STORE_DIR;
  else process.env.AS_TASK_STORE_DIR = oldStoreDirectory;
  if (storeDirectory) await rm(storeDirectory, { recursive: true, force: true });
});

test('F08/F09 task lifecycle: Cdc -> AS -> EServer, with Aa notifications', async () => {
  const e = connect('eserver', 'e-roundtrip');
  const ui = connect('aa');
  await Promise.all([e.ready, ui.ready]);
  const remote = cdc.connected;
  assert.ok(remote);

  const task = {
    id: `task-${randomUUID()}`, status: 'inProgress', config: 'mock-config',
    createdTime: Date.now(), updatedTime: Date.now()
  };
  try {
    const delivered = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('EServer did not receive F08 task')), 3000);
      e.socket.once('peer:message', (message, ack) => {
        clearTimeout(timeout);
        ack({ ok: true, status: 'received' });
        resolve(message);
      });
    });
    const taskLifecycle = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Aa did not receive F08 lifecycle event')), 3000);
      ui.socket.on('task:lifecycle', value => {
        if (value.task?.id !== task.id) return;
        clearTimeout(timeout);
        resolve(value);
      });
    });
    const receipt: any = await remote.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'cdc', to: 'eserver', toInstanceId: 'e-roundtrip',
      payload: { type: 'demo.task.request', data: task }
    });
    assert.equal(receipt.ok, true);
    assert.equal(receipt.status, 'received');
    assert.deepEqual((await delivered).payload.data, task);
    assert.deepEqual(JSON.parse(await readFile(join(storeDirectory, `${task.id}.json`), 'utf8')), task);
    const lifecycle = await taskLifecycle;
    assert.equal(lifecycle.status, 'received');
    assert.equal(lifecycle.instanceId, 'e-roundtrip');
    assert.deepEqual(lifecycle.task, task);

    const finished = { ...task, status: 'finished', updatedTime: task.updatedTime + 1000 };
    const returned = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Cdc did not receive F09 result')), 3000);
      remote.once('peer:message', (message, ack) => {
        clearTimeout(timeout);
        ack({ ok: true });
        resolve(message);
      });
    });
    const resultLifecycle = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Aa did not receive F09 lifecycle event')), 3000);
      ui.socket.on('task:result:lifecycle', value => {
        if (value.task?.id !== task.id || value.status !== 'forwarded') return;
        clearTimeout(timeout);
        resolve(value);
      });
    });
    const resultReceipt: any = await e.socket.timeout(3000).emitWithAck('peer:message', {
      kind: 'response', from: 'eserver', to: 'cdc',
      payload: { type: 'demo.task.result', data: finished }
    });
    assert.equal(resultReceipt.ok, true);
    assert.equal(resultReceipt.status, 'received');
    assert.deepEqual((await returned).payload.data, finished);
    assert.deepEqual(JSON.parse(await readFile(join(storeDirectory, `${task.id}.result.json`), 'utf8')), finished);
    const resultEvent = await resultLifecycle;
    assert.equal(resultEvent.status, 'forwarded');
    assert.equal(resultEvent.instanceId, 'e-roundtrip');
    assert.deepEqual(resultEvent.task, finished);
  } finally {
    e.socket.disconnect();
    ui.socket.disconnect();
  }
});
