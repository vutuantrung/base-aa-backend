import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { createMockCdc } from './support/mock-cdc.js';

let app: ReturnType<typeof createApplication>;
let cdc: Awaited<ReturnType<typeof createMockCdc>>;
let base: string;

before(async () => {
  cdc = await createMockCdc();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    apiKey: 'test', cdc: { url: cdc.url, vmInfo: { udid: 'test-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] } }
  });
  app.transformations.register({
    id: 'test-enrichment', from: 'cdc', to: 'eserver', payloadType: 'demo.enrich', priority: 10,
    transformer: { transform(message) {
      return { ...message.payload, data: { ...(message.payload.data as object), enrichedBy: 'as' } };
    } }
  });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await cdc.waitForArrival();
  for (let attempt = 0; attempt < 100 && !app.cdcConnector?.connected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!app.cdcConnector?.connected) throw new Error('Cdc session not ready');
});
after(async () => { if (app) await app.close(); if (cdc) await cdc.close(); });

async function connect(peerId: string): Promise<Socket> {
  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false,
    auth: { peerId, token: 'test' } });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test('AS connects outward to Cdc and forwards transformed Cdc -> EServer', async () => {
  const eserver = await connect('eserver');
  try {
    let received: any;
    eserver.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const source = cdc.connected;
    assert.ok(source?.connected);
    const response: any = await source.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'cdc', to: 'eserver',
      payload: { type: 'demo.enrich', data: { profileId: 'profile-001' } }
    });
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.equal(received.payload.data.enrichedBy, 'as');
    assert.deepEqual(received.processing.processedBy, ['test-enrichment']);
  } finally { eserver.disconnect(); }
});

test('Aa -> AS -> Cdc uses reverse direction on AS-established connection', async () => {
  const aa = await connect('aa');
  const source = cdc.connected;
  assert.ok(source);
  try {
    let received: any;
    source.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const response: any = await aa.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'aa', to: 'cdc',
      payload: { type: 'demo.reply', data: { ok: true } }
    });
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.equal(received.to, 'cdc');
  } finally { aa.disconnect(); }
});

test('AS rejects forged sender and offline destination', async () => {
  const source = cdc.connected;
  assert.ok(source);
  const forged: any = await source.timeout(3000).emitWithAck('peer:message', {
    kind: 'event', from: 'spa', to: 'eserver', payload: { type: 'test', data: {} }
  });
  assert.equal(forged.code, 'SENDER_MISMATCH');
  const offline: any = await source.timeout(3000).emitWithAck('peer:message', {
    kind: 'event', from: 'cdc', to: 'eserver', payload: { type: 'test', data: {} }
  });
  assert.equal(offline.code, 'DESTINATION_OFFLINE');
});
