import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true, apiKey: 'dev-key' });
let base: string;
before(async () => { base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

test('EServer, SServer and AAUI connect inbound to AAB', async () => {
  for (const peerId of ['eserver', 'sserver', 'aaui']) {
    const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false,
      auth: { peerId, token: 'dev-key' } });
    try {
      const welcome = await new Promise<{ from: string; to: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('connect timeout')), 3000);
        socket.once('aab:welcome', message => { clearTimeout(timeout); resolve(message); });
        socket.once('connect_error', error => { clearTimeout(timeout); reject(error); });
      });
      assert.equal(welcome.to, peerId);
      assert.equal(welcome.from, 'aab');
      const ping = await socket.timeout(2000).emitWithAck('peer:ping', { from: peerId }) as { ok: boolean };
      assert.equal(ping.ok, true);
    } finally { socket.disconnect(); }
  }
});

test('PServer cannot connect inbound; AAB must initiate its connection', async () => {
  for (const auth of [
    { peerId: 'pserver', token: 'dev-key' },
    { peerId: 'unknown', token: 'dev-key' },
    { peerId: 'eserver', token: 'wrong' }
  ]) {
    const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false, auth });
    try {
      const error = await new Promise<Error>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Expected rejection')), 3000);
        socket.once('connect_error', error => { clearTimeout(timer); resolve(error); });
        socket.once('connect', () => { clearTimeout(timer); reject(new Error('Unexpected connection')); });
      });
      assert.ok(error.message.length > 0);
    } finally { socket.disconnect(); }
  }
});

test('peer message ingress without an ACK callback is skipped; ACK-bearing ingress is processed', async () => {
  const processed: string[] = [];
  const ruleId = 'r73-a-peer-ingress-ack-characterization';
  app.transformations.register({
    id: ruleId,
    from: 'aaui',
    to: 'aab',
    payloadType: 'r73.a.ingress',
    priority: 1,
    transformer: {
      transform(message) {
        processed.push(message.id ?? 'missing-id');
        return message.payload;
      }
    }
  });

  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false,
    auth: { peerId: 'aaui', token: 'dev-key' } });
  const noAckId = 'b733a000-0000-4000-8000-000000000001';
  const withAckId = 'b733a000-0000-4000-8000-000000000002';
  const incoming = (id: string) => ({
    version: '1.0', kind: 'event', from: 'aaui', to: 'aab', channel: 'worker', event: 'message',
    id, payload: { type: 'r73.a.ingress', version: '1.0', data: {} }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    socket.emit('peer:message', incoming(noAckId));
    await socket.timeout(2000).emitWithAck('peer:ping', { barrier: true });
    assert.deepEqual(processed, []);

    const acknowledgement = await socket.timeout(2000).emitWithAck('peer:message', incoming(withAckId)) as {
      ok: boolean; data?: { id?: string }
    };
    assert.equal(acknowledgement.ok, true);
    assert.equal(acknowledgement.data?.id, withAckId);
    assert.deepEqual(processed, [withAckId]);
  } finally {
    socket.disconnect();
    app.transformations.unregister(ruleId);
  }
});
