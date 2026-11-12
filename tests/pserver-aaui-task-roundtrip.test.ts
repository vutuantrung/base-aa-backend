import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../src/app/create-app.js';
import { createMockPServer } from './support/mock-pserver.js';

let app: ReturnType<typeof createApplication>;
let pserver: Awaited<ReturnType<typeof createMockPServer>>;
let base: string;

before(async () => {
  pserver = await createMockPServer();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    pserver: { url: pserver.url, vmInfo: {
      udid: 'test-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: []
    } }
  });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await pserver.arrival;
  for (let i = 0; i < 100 && !app.pserverConnector?.connected; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(app.pserverConnector?.connected, true);
});
after(async () => { if (app) await app.close(); if (pserver) await pserver.close(); });

test('PServer sends task through AAB; AAUI acknowledges and returns finished task', async () => {
  const aaui = io(`${base}/peers`, { transports: ['websocket'], reconnection: false,
    auth: { peerId: 'aaui' } });
  await new Promise<void>((resolve, reject) => {
    aaui.once('connect', resolve);
    aaui.once('connect_error', reject);
  });
  const remote = pserver.connected;
  assert.ok(remote);

  const task = {
    id: `task-${randomUUID()}`, status: 'inProgress', config: 'mock-config',
    createdTime: Date.now() - 200, updatedTime: Date.now() - 100
  };
  const resultPromise = new Promise<{ from: string; to: string; payload: { data: typeof task } }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('No task result arrived')), 3000);
    remote.once('peer:message', (message, ack) => {
      clearTimeout(timeout);
      ack({ ok: true });
      resolve(message);
    });
  });

  try {
    aaui.on('peer:message', (message, ack) => {
      ack({ ok: true });
      if (message.payload?.type !== 'demo.task.request') return;
      assert.deepEqual(message.payload.data, task);
      setTimeout(() => {
        void aaui.timeout(2000).emitWithAck('peer:message', {
          kind: 'response', from: 'aaui', to: 'pserver',
          payload: { type: 'demo.task.result', data: {
            ...task, status: 'finished', updatedTime: Date.now()
          } }
        });
      }, 35);
    });

    const response: any = await remote.timeout(2500).emitWithAck('peer:message', {
      kind: 'request', from: 'pserver', to: 'aaui',
      payload: { type: 'demo.task.request', data: task }
    });
    assert.equal(response.ok, true);
    const result = await resultPromise;
    assert.equal(result.from, 'aaui');
    assert.equal(result.to, 'pserver');
    assert.equal(result.payload.data.id, task.id);
    assert.equal(result.payload.data.status, 'finished');
    assert.equal(result.payload.data.config, task.config);
    assert.ok(result.payload.data.updatedTime >= task.updatedTime);
  } finally { aaui.disconnect(); }
});
