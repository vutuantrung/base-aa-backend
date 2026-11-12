import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true, apiKey: 'test' });
app.transformations.register({
  id: 'test-enrichment', from: 'pserver', to: 'eserver', payloadType: 'demo.enrich', priority: 10,
  transformer: { transform(message) { return {
    ...message.payload, data: { ...(message.payload.data as object), enrichedBy: 'aab' }
  }; } }
});
let base: string;
before(async () => { base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

async function connect(peerId: string): Promise<Socket> {
  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false,
    auth: { peerId, token: 'test' } });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test('AAB transforms then forwards PServer -> EServer preserving IDs', async () => {
  const pserver = await connect('pserver');
  const eserver = await connect('eserver');
  try {
    let received: any;
    eserver.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const response = await pserver.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'pserver', to: 'eserver',
      payload: { type: 'demo.enrich', data: { profileId: 'profile-001' } }
    }) as any;
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.equal(received.from, 'pserver');
    assert.equal(received.to, 'eserver');
    assert.equal(received.payload.data.enrichedBy, 'aab');
    assert.deepEqual(received.processing.processedBy, ['test-enrichment']);
  } finally { pserver.disconnect(); eserver.disconnect(); }
});

test('AAB rejects spoofed sender and offline recipient', async () => {
  const pserver = await connect('pserver');
  try {
    const forged = await pserver.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'sserver', to: 'eserver', payload: { type: 'test', data: {} }
    }) as any;
    assert.equal(forged.ok, false);
    assert.equal(forged.code, 'SENDER_MISMATCH');
    const offline = await pserver.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'pserver', to: 'eserver', payload: { type: 'test', data: {} }
    }) as any;
    assert.equal(offline.code, 'DESTINATION_OFFLINE');
  } finally { pserver.disconnect(); }
});
