import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { createMockPServer } from './support/mock-pserver.js';

let pserver: Awaited<ReturnType<typeof createMockPServer>>;
let app: ReturnType<typeof createApplication>;
let base: string;

before(async () => {
  pserver = await createMockPServer();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    pserver: { url: pserver.url, vmInfo: {
      udid: 'selection-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: []
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

test('AAUI selection routes via AAB to PServer with precisely three IDs and an ACK', async () => {
  const client = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false,
    auth: { peerId: 'aaui' }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', reject);
    });

    const expected = {
      browserProfileId: 'browser-profile-001',
      proxyId: 'proxy-002',
      accountId: 'account-tk-001'
    };

    const delivered = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PServer did not receive resource selection')), 3000);
      pserver.connected!.once('peer:message', (message, ack) => {
        clearTimeout(timer);
        ack?.({ ok: true });
        resolve(message);
      });
    });

    const response: any = await client.timeout(3000).emitWithAck('peer:message', {
      version: '1.0', kind: 'request', from: 'aaui', to: 'pserver',
      payload: { type: 'demo.resource-selection', version: '1.0', data: expected }
    });
    assert.equal(response.ok, true);

    const message = await delivered;
    assert.equal(message.from, 'aaui');
    assert.equal(message.to, 'pserver');
    assert.equal(message.payload.type, 'demo.resource-selection');
    assert.deepEqual(message.payload.data, expected);
    assert.deepEqual(Object.keys(message.payload.data).sort(),
      ['browserProfileId', 'proxyId', 'accountId'].sort());
  } finally { client.disconnect(); }
});
