import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { registerCdcToAaDemo } from '../src/examples/cdc-to-aa.js';
import { executeTransformations } from '../src/modules/peer-messaging/transformation-registry.js';
import { createMockCdc } from './support/mock-cdc.js';

let app: ReturnType<typeof createApplication>;
let cdc: Awaited<ReturnType<typeof createMockCdc>>;
let base: string;
before(async () => {
  cdc = await createMockCdc();
  app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true, cdc: { url: cdc.url, vmInfo: { udid: 'test-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] } } });
  registerCdcToAaDemo(app.transformations);
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await cdc.waitForArrival();
  for (let attempt = 0; attempt < 100 && !app.cdcConnector?.connected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!app.cdcConnector?.connected) throw new Error('Cdc session not ready');
});
after(async () => { if (app) await app.close(); if (cdc) await cdc.close(); });

async function connect(peerId: string): Promise<Socket> {
  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false, auth: { peerId } });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test('Cdc -> AS -> Aa receives modifiedParam over reversed connection', async () => {
  const aa = await connect('aa');
  try {
    let received: any;
    aa.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const source = cdc.connected;
    assert.ok(source);
    const response: any = await source.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'cdc', to: 'aa',
      payload: { type: 'demo.modified-param', data: { originalParam: 'hello' } }
    });
    assert.equal(response.ok, true);
    assert.equal(received.id, response.data.id);
    assert.deepEqual(received.payload.data, {
      originalParam: 'hello', modifiedParam: 'AS modified: hello'
    });
    assert.deepEqual(received.processing.processedBy, ['demo-cdc-to-aa-modified-param']);
  } finally { aa.disconnect(); }
});

test('other payload types pass through unchanged', async () => {
  const aa = await connect('aa');
  try {
    let received: any;
    aa.on('peer:message', (message, ack) => { received = message; ack({ ok: true }); });
    const source = cdc.connected;
    assert.ok(source);
    const response: any = await source.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'cdc', to: 'aa',
      payload: { type: 'some.other-type', data: { originalParam: 'hello' } }
    });
    assert.equal(response.ok, true);
    assert.deepEqual(received.payload.data, { originalParam: 'hello' });
    assert.equal(received.processing.transformed, false);
  } finally { aa.disconnect(); }
});

test('demo transform keeps its invalid originalParam failure', async () => {
  await assert.rejects(Promise.resolve(executeTransformations(app.transformations, {
    id: 'compatibility-invalid-input', version: '1.0', kind: 'event', from: 'cdc', to: 'aa',
    channel: 'worker', event: 'message', timestamp: 0,
    payload: { type: 'demo.modified-param', version: '1.0', data: { originalParam: 7 } }
  })), {
    name: 'TransformationExecutionError',
    message: 'Transformer demo-cdc-to-aa-modified-param failed: originalParam must be a string'
  });
});
