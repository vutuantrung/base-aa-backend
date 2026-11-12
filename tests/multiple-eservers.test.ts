import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', apiKey: 'test', enableTestPeers: true });
let base: string;
before(async () => { base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

async function connect(peerId: string, instanceId?: string): Promise<Socket> {
  const socket = io(`${base}/peers`, { reconnection: false, transports: ['websocket'],
    auth: { peerId, instanceId, token: 'test' } });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 2000);
      socket.once('connect', () => { clearTimeout(timeout); resolve(); });
      socket.once('connect_error', error => { clearTimeout(timeout); reject(error); });
    });
    return socket;
  } catch (error) { socket.disconnect(); throw error; }
}
async function send(socket: Socket, message: object): Promise<any> {
  return socket.timeout(2000).emitWithAck('peer:message', message);
}
const msg = (from: string, to: string, extras: object = {}) => ({
  kind: 'event', from, to, payload: { type: 'demo.multi-eserver', data: { test: true } }, ...extras
});

test('multiple EServers connect and independently send to AAUI', async () => {
  const e1 = await connect('eserver', 'worker-1');
  const e2 = await connect('eserver', 'worker-2');
  const aaui = await connect('aaui');
  try {
    const received: any[] = [];
    aaui.on('peer:message', (message, ack) => { received.push(message); ack({ ok: true }); });
    const r1 = await send(e1, msg('eserver', 'aaui'));
    const r2 = await send(e2, msg('eserver', 'aaui'));
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.notEqual(r1.data.id, r2.data.id);
    assert.deepEqual(received.map(x => x.sourceInstanceId), ['worker-1', 'worker-2']);
    assert.deepEqual(received.map(x => x.from), ['eserver', 'eserver']);
  } finally { e1.disconnect(); e2.disconnect(); aaui.disconnect(); }
});

test('ambiguous EServer destination is rejected; targeted delivery works', async () => {
  const e1 = await connect('eserver', 'worker-1');
  const e2 = await connect('eserver', 'worker-2');
  const aaui = await connect('aaui');
  try {
    const receives: string[] = [];
    e1.on('peer:message', (_value, ack) => { receives.push('worker-1'); ack({ ok: true }); });
    e2.on('peer:message', (_value, ack) => { receives.push('worker-2'); ack({ ok: true }); });
    const ambiguous = await send(aaui, msg('aaui', 'eserver'));
    assert.equal(ambiguous.ok, false);
    assert.equal(ambiguous.code, 'AMBIGUOUS_DESTINATION');
    const response = await send(aaui, msg('aaui', 'eserver', { toInstanceId: 'worker-2' }));
    assert.equal(response.ok, true);
    assert.deepEqual(receives, ['worker-2']);
  } finally { e1.disconnect(); e2.disconnect(); aaui.disconnect(); }
});

test('duplicate instance IDs are rejected and other instances remain online', async () => {
  const e1 = await connect('eserver', 'same-worker');
  try {
    await assert.rejects(connect('eserver', 'same-worker'), /already connected/);
    assert.equal(e1.connected, true);
  } finally { e1.disconnect(); }
});

test('one EServer still supports legacy destination without toInstanceId', async () => {
  const e1 = await connect('eserver', 'single-worker');
  const aaui = await connect('aaui');
  try {
    let delivered = false;
    e1.on('peer:message', (_value, ack) => { delivered = true; ack({ ok: true }); });
    const response = await send(aaui, msg('aaui', 'eserver'));
    assert.equal(response.ok, true);
    assert.equal(delivered, true);
  } finally { e1.disconnect(); aaui.disconnect(); }
});
