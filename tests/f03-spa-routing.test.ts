import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
let base: string;
before(async () => { base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

function connect(peerId: string, instanceId?: string): { socket: Socket; connected: Promise<void> } {
  const socket = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false,
    auth: { peerId, ...(instanceId ? { instanceId } : {}) }
  });
  const connected = new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return { socket, connected };
}

test('F03 Spa -> AS -> Aa while F04 remains EServer -> AS -> Aa', async () => {
  const ui = connect('aa');
  await ui.connected;
  const spa = connect('spa');
  await spa.connected;
  const eserver = connect('eserver', 'e-f04');
  await eserver.connected;
  try {
    const inbound: any[] = [];
    const received = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Missing both F03/F04 deliveries')), 3000);
      ui.socket.on('peer:message', (msg, ack) => {
        inbound.push(msg);
        ack({ ok: true });
        if (inbound.length === 2) { clearTimeout(timeout); resolve(); }
      });
    });
    const f03: any = await spa.socket.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'spa', to: 'aa',
      payload: { type: 'spa.scheduled-update', data: {
        instanceId: 'spa', sequence: 1, sentAt: new Date().toISOString(),
        message: 'Scheduled update from Spa'
      } }
    });
    assert.equal(f03.ok, true);
    const f04: any = await eserver.socket.timeout(3000).emitWithAck('peer:message', {
      kind: 'event', from: 'eserver', to: 'aa',
      payload: { type: 'eserver.vm-info', data: [{
        id: 'vm-1', browserId: 'browser-1', version: '1.0', supportingPlatforms: []
      }] }
    });
    assert.equal(f04.ok, true);
    await received;
    assert.equal(inbound[0].from, 'spa');
    assert.equal(inbound[0].payload.type, 'spa.scheduled-update');
    assert.equal(inbound[1].from, 'eserver');
    assert.equal(inbound[1].payload.type, 'eserver.vm-info');
    assert.equal(inbound[1].sourceInstanceId, 'e-f04');
  } finally {
    spa.socket.disconnect();
    eserver.socket.disconnect();
    ui.socket.disconnect();
  }
});
