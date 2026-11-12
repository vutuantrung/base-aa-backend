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
    const received: unknown[] = [];
    e.client.on('peer:message', (message, ack) => {
      received.push(message);
      ack({ ok: true, status: 'received' });
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
    assert.equal(received.length, 1);
    assert.deepEqual((received[0] as any).payload.data, task);
    const stored = JSON.parse(await readFile(join(directory, task.id + '.json'), 'utf8'));
    assert.deepEqual(stored, task);
    const event = await lifecycle;
    assert.equal(event.status, 'received');
    assert.equal(event.instanceId, 'e-task-1');
    assert.deepEqual(event.task, task);
  } finally { ui.client.disconnect(); e.client.disconnect(); }
});

test('offline EServer does not produce success ACK or task file', async () => {
  const task = {
    id: 'task-' + randomUUID(), status: 'inProgress', config: 'offline',
    createdTime: Date.now(), updatedTime: Date.now()
  };
  const result: any = await pserver.connected!.timeout(3000).emitWithAck('peer:message', {
    kind: 'request', from: 'pserver', to: 'eserver', toInstanceId: 'not-online',
    payload: { type: 'demo.task.request', data: task }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'DESTINATION_OFFLINE');
  assert.equal(await new JsonTaskFileStore(directory).read(task.id), undefined);
});
