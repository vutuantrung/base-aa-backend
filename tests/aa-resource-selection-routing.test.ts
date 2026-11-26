import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonResourceSelectionStore } from '../src/modules/peer-messaging/resource-selection-store.js';
import { createApplication } from '../src/app/create-app.js';
import { createMockCdc } from './support/mock-cdc.js';

let cdc: Awaited<ReturnType<typeof createMockCdc>>;
let app: ReturnType<typeof createApplication>;
let base: string;
let directory: string;
let oldDirectory: string | undefined;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'as-selection-routing-'));
  oldDirectory = process.env.AS_SELECTION_STORE_DIR;
  process.env.AS_SELECTION_STORE_DIR = directory;
  cdc = await createMockCdc();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    cdc: { url: cdc.url, vmInfo: {
      udid: 'selection-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: []
    } }
  });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await cdc.waitForArrival();
  for (let i = 0; i < 100 && !app.cdcConnector?.connected; i++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(app.cdcConnector?.connected, true);
});
after(async () => {
  if (app) await app.close();
  if (cdc) await cdc.close();
  if (oldDirectory === undefined) delete process.env.AS_SELECTION_STORE_DIR;
  else process.env.AS_SELECTION_STORE_DIR = oldDirectory;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('Aa selection routes via AS to Cdc with precisely three IDs and an ACK', async () => {
  const client = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false,
    auth: { peerId: 'aa' }
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

    const forwardedEvent = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing forwarded selection event')), 3000);
      client.on('resource-selection:updated', record => {
        if (record.deliveryStatus === 'forwarded') {
          clearTimeout(timer);
          resolve(record);
        }
      });
    });
    const delivered = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cdc did not receive resource selection')), 3000);
      cdc.connected!.once('peer:message', (message, ack) => {
        clearTimeout(timer);
        ack?.({ ok: true });
        resolve(message);
      });
    });

    const response: any = await client.timeout(3000).emitWithAck('peer:message', {
      version: '1.0', kind: 'request', from: 'aa', to: 'cdc',
      payload: { type: 'demo.resource-selection', version: '1.0', data: expected }
    });
    assert.equal(response.ok, true);
    assert.equal(response.status, 'received');

    const message = await delivered;
    assert.equal(message.from, 'aa');
    assert.equal(message.to, 'cdc');
    assert.equal(message.payload.type, 'demo.resource-selection');
    assert.deepEqual(message.payload.data, expected);
    assert.deepEqual(Object.keys(message.payload.data).sort(),
      ['browserProfileId', 'proxyId', 'accountId'].sort());
    const event = await forwardedEvent;
    assert.equal(event.deliveryStatus, 'forwarded');
    assert.deepEqual(event.selection, expected);
    const stored = await new JsonResourceSelectionStore(directory).listRecent();
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, event.id);
    assert.equal(stored[0]?.deliveryStatus, 'forwarded');
    assert.deepEqual(stored[0]?.selection, expected);
  } finally { client.disconnect(); }
});
