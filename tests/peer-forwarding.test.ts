import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { createMockPServer } from './support/mock-pserver.js';

let app: ReturnType<typeof createApplication>;
let pserver: Awaited<ReturnType<typeof createMockPServer>>;
let base: string;

before(async () => {
  pserver = await createMockPServer();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    apiKey: 'test', pserverUrl: pserver.url
  });
  app.transformations.register({
    id: 'test-enrichment', from: 'pserver', to: 'eserver', payloadType: 'demo.enrich', priority: 10,
    transformer: { transform(message) {
      return { ...message.payload, data: { ...(message.payload.data as object), enrichedBy: 'aab' } };
    } }
  });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await pserver.arrival;
});
after(async () => { if (app) await app.close(); if (pserver) await pserver.close(); });

async function connect(peerId: string): Promise<Socket> {
  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false,
    auth: { peerId, token: 'test' } });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test('AAB connects outward to PServer and forwards transformed PServer -> EServer', async () => {
  const eserver = await connect('eserver');
  try {
    let received: any;
    eserver.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const source = pserver.connected;
    assert.ok(source?.connected);
    const response: any = await source.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'pserver', to: 'eserver',
      payload: { type: 'demo.enrich', data: { profileId: 'profile-001' } }
    });
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.equal(received.payload.data.enrichedBy, 'aab');
    assert.deepEqual(received.processing.processedBy, ['test-enrichment']);
  } finally { eserver.disconnect(); }
});

test('AAUI -> AAB -> PServer uses reverse direction on AAB-established connection', async () => {
  const aaui = await connect('aaui');
  const source = pserver.connected;
  assert.ok(source);
  try {
    let received: any;
    source.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const response: any = await aaui.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'aaui', to: 'pserver',
      payload: { type: 'demo.reply', data: { ok: true } }
    });
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.equal(received.to, 'pserver');
  } finally { aaui.disconnect(); }
});

test('AAB rejects forged sender and offline destination', async () => {
  const source = pserver.connected;
  assert.ok(source);
  const forged: any = await source.timeout(3000).emitWithAck('peer:message', {
    kind: 'event', from: 'sserver', to: 'eserver', payload: { type: 'test', data: {} }
  });
  assert.equal(forged.code, 'SENDER_MISMATCH');
  const offline: any = await source.timeout(3000).emitWithAck('peer:message', {
    kind: 'event', from: 'pserver', to: 'eserver', payload: { type: 'test', data: {} }
  });
  assert.equal(offline.code, 'DESTINATION_OFFLINE');
});
