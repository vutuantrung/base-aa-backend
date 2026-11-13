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
  oldDirectory = process.env.AAB_TASK_STORE_DIR;
  process.env.AAB_TASK_STORE_DIR = directory;
  // Intentionally omit the PServer connector: AAB must still acknowledge a durable F09 receipt.
  app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => {
  if (app) await app.close();
  if (oldDirectory === undefined) delete process.env.AAB_TASK_STORE_DIR;
  else process.env.AAB_TASK_STORE_DIR = oldDirectory;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('F09 persists and ACKs EServer even when PServer is disconnected', async () => {
  const store = new JsonTaskFileStore(directory);
  const original = {
    id: 'task-' + randomUUID(), status: 'inProgress' as const,
    config: 'F09 offline case', createdTime: Date.now(), updatedTime: Date.now()
  };
  await store.save(original);
  const finished = { ...original, status: 'finished' as const, updatedTime: original.updatedTime + 100 };
  const ui = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false, auth: { peerId: 'aaui' }
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
    const failed = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('F09 failure event missing')), 3000);
      ui.on('task:result:lifecycle', event => {
        if (event.task?.id !== original.id) return;
        events.push(event);
        if (event.status === 'forwardFailed') {
          clearTimeout(timer);
          resolve(event);
        }
      });
    });

    const ack: any = await e.timeout(3000).emitWithAck('peer:message', {
      version: '1.0', kind: 'response', from: 'eserver', to: 'pserver',
      payload: { type: 'demo.task.result', version: '1.0', data: finished }
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.status, 'received');
    assert.deepEqual(await store.read(original.id), original);
    const snapshot = await store.listRecent();
    assert.deepEqual(snapshot, [finished]);
    const failedEvent = await failed;
    assert.equal(failedEvent.instanceId, 'e-f09-offline');
    assert.match(failedEvent.reason, /PServer is offline/);
    assert.deepEqual(events.map(event => event.status), ['received', 'forwardFailed']);
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
      kind: 'response', from: 'eserver', to: 'pserver',
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
