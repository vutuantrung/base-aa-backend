import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { registerPServerToAauiDemo } from '../src/examples/pserver-to-aaui.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
registerPServerToAauiDemo(app.transformations);
let base: string;
before(async () => { base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

async function connect(peerId: string): Promise<Socket> {
  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false, auth: { peerId } });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test('PServer -> AAB modifies payload.data.modifiedParam -> AAUI', async () => {
  const pserver = await connect('pserver');
  const aaui = await connect('aaui');
  try {
    let received: any;
    aaui.on('peer:message', (message, ack) => {
      received = message;
      ack({ ok: true });
    });
    const response: any = await pserver.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'pserver', to: 'aaui',
      payload: { type: 'demo.modified-param', data: { originalParam: 'hello' } }
    });
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.equal(received.from, 'pserver');
    assert.equal(received.to, 'aaui');
    assert.deepEqual(received.payload.data, { originalParam: 'hello', modifiedParam: 'AAB modified: hello' });
    assert.deepEqual(received.processing.processedBy, ['demo-pserver-to-aaui-modified-param']);
  } finally {
    pserver.disconnect();
    aaui.disconnect();
  }
});

test('demo transformer ignores other payload types', async () => {
  const pserver = await connect('pserver');
  const aaui = await connect('aaui');
  try {
    let received: any;
    aaui.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const response: any = await pserver.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'pserver', to: 'aaui',
      payload: { type: 'some.other-type', data: { originalParam: 'hello' } }
    });
    assert.equal(response.ok, true);
    assert.deepEqual(received.payload.data, { originalParam: 'hello' });
    assert.equal(received.processing.transformed, false);
  } finally {
    pserver.disconnect();
    aaui.disconnect();
  }
});
