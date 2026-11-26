import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { JsonTaskFileStore } from '../src/modules/peer-messaging/task-file-store.js';

let directory: string;
let app: ReturnType<typeof createApplication>;
let base: string;
let oldDirectory: string | undefined;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'f09-result-offline-'));
  oldDirectory = process.env.AS_TASK_STORE_DIR;
  process.env.AS_TASK_STORE_DIR = directory;
  // Intentionally omit the Cdc connector: AS must still acknowledge a durable F09 receipt.
  app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => {
  if (app) await app.close();
  if (oldDirectory === undefined) delete process.env.AS_TASK_STORE_DIR;
  else process.env.AS_TASK_STORE_DIR = oldDirectory;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('F09 persists and ACKs EServer while an offline Cdc delivery remains pending', async () => {
  const store = new JsonTaskFileStore(directory);
  const original = {
    id: 'task-' + randomUUID(), status: 'inProgress' as const,
    config: 'F09 offline case', createdTime: Date.now(), updatedTime: Date.now()
  };
  await store.save(original);
  const finished = { ...original, status: 'finished' as const, updatedTime: original.updatedTime + 100 };
  const ui = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false, auth: { peerId: 'aa' }
  });
  const e = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false,
    auth: { peerId: 'eserver', instanceId: 'e-f09-offline' }
  });
  const connected = (socket: typeof ui) => new Promise<void>((resolve, reject) => {
    if (socket.connected) { resolve(); return; }
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  try {
    await Promise.all([connected(ui), connected(e)]);
    const events: any[] = [];
    ui.on('task:result:lifecycle', event => {
      if (event.task?.id === original.id) events.push(event);
    });

    const ack: any = await e.timeout(3000).emitWithAck('peer:message', {
      version: '1.0', kind: 'response', from: 'eserver', to: 'cdc',
      payload: { type: 'demo.task.result', version: '1.0', data: finished }
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.status, 'received');
    assert.deepEqual(await store.read(original.id), original);
    const snapshot = await store.listRecent();
    assert.deepEqual(snapshot, [finished]);
    const operation = (await store.reliability.list()).find(record => record.payload.kind === 'F09');
    assert.ok(operation?.state === 'queued' || operation?.state === 'retryable');
    assert.equal(operation?.attempts, 0);
    assert.deepEqual(events.map(event => event.status), ['received']);
    await store.reliability.close();
  } finally {
    e.disconnect();
    ui.disconnect();
  }
});

test('F09 rejects invalid result without persisting it', async () => {
  const e = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false,
    auth: { peerId: 'eserver', instanceId: 'e-f09-validation' }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      e.once('connect', () => resolve());
      e.once('connect_error', reject);
    });
    const ack: any = await e.timeout(3000).emitWithAck('peer:message', {
      kind: 'response', from: 'eserver', to: 'cdc',
      payload: { type: 'demo.task.result', data: {
        id: 'task-' + randomUUID(), status: 'inProgress',
        config: 'invalid', createdTime: Date.now(), updatedTime: Date.now()
      } }
    });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'INVALID_MESSAGE');
  } finally {
    e.disconnect();
  }
});
