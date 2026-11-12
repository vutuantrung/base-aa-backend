import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { registerPServerToAauiDemo } from '../src/examples/pserver-to-aaui.js';
import { createMockPServer } from './support/mock-pserver.js';

let app: ReturnType<typeof createApplication>;
let pserver: Awaited<ReturnType<typeof createMockPServer>>;
let base: string;
before(async () => {
  pserver = await createMockPServer();
  app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true, pserver: { url: pserver.url, vmInfo: { udid: 'test-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] } } });
  registerPServerToAauiDemo(app.transformations);
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await pserver.arrival;
  for (let attempt = 0; attempt < 100 && !app.pserverConnector?.connected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!app.pserverConnector?.connected) throw new Error('PServer session not ready');
});
after(async () => { if (app) await app.close(); if (pserver) await pserver.close(); });

async function connect(peerId: string): Promise<Socket> {
  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false, auth: { peerId } });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test('PServer -> AAB -> AAUI receives modifiedParam over reversed connection', async () => {
  const aaui = await connect('aaui');
  try {
    let received: any;
    aaui.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const source = pserver.connected;
    assert.ok(source);
    const response: any = await source.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'pserver', to: 'aaui',
      payload: { type: 'demo.modified-param', data: { originalParam: 'hello' } }
    });
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.deepEqual(received.payload.data, {
      originalParam: 'hello', modifiedParam: 'AAB modified: hello'
    });
    assert.deepEqual(received.processing.processedBy, ['demo-pserver-to-aaui-modified-param']);
  } finally { aaui.disconnect(); }
});

test('other payload types pass through unchanged', async () => {
  const aaui = await connect('aaui');
  try {
    let received: any;
    aaui.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const source = pserver.connected;
    assert.ok(source);
    const response: any = await source.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'pserver', to: 'aaui',
      payload: { type: 'some.other-type', data: { originalParam: 'hello' } }
    });
    assert.equal(response.ok, true);
    assert.deepEqual(received.payload.data, { originalParam: 'hello' });
    assert.equal(received.processing.transformed, false);
  } finally { aaui.disconnect(); }
});
