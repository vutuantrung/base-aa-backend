import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
let base: string;
before(async () => { base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

async function connect(peerId: string, instanceId?: string): Promise<Socket> {
  const socket = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false, auth: { peerId, instanceId }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

test('multiple EServer instances can forward VM info array to AAUI via AAB', async () => {
  const e1 = await connect('eserver', 'e-1');
  const e2 = await connect('eserver', 'e-2');
  const aaui = await connect('aaui');
  try {
    const received: any[] = [];
    aaui.on('peer:message', (message, ack) => {
      received.push(message);
      ack({ ok: true });
    });

    for (const [socket, instanceId] of [[e1, 'e-1'], [e2, 'e-2']] as const) {
      const vmInfo = [{
        id: `${instanceId}-vm-1`,
        browserId: `${instanceId}-browser-1`,
        version: '1.0.0',
        supportingPlatforms: [
          {
            platform: 'facebook',
            supportingFeatures: ['Automation 1', 'Parser'],
            parserInfo: { version: '1.0.0', type: ['Post', 'Comment'] }
          },
          {
            platform: 'youtube',
            supportingFeatures: ['Login Cookie', 'Other'],
            parserInfo: { version: '1.0.0', type: ['Profile'] }
          }
        ]
      }];

      const ack: any = await socket.timeout(3000).emitWithAck('peer:message', {
        kind: 'event', from: 'eserver', to: 'aaui',
        payload: { type: 'eserver.vm-info', version: '1.0', data: vmInfo }
      });
      assert.equal(ack.ok, true);
      assert.equal(ack.data.sourceInstanceId, instanceId);
      assert.deepEqual(ack.data.payload.data, vmInfo);
    }

    assert.deepEqual(received.map(item => item.sourceInstanceId), ['e-1', 'e-2']);
    assert.ok(received.every(item => Array.isArray(item.payload.data)));
    assert.ok(received.every(item => item.payload.type === 'eserver.vm-info'));
  } finally {
    e1.disconnect();
    e2.disconnect();
    aaui.disconnect();
  }
});
