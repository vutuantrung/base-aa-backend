import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SocketPeerMessageDelivery } from '../src/infrastructure/socket/socket-peer-message-delivery.js';
import type { PeerSocketConnection } from '../src/infrastructure/socket/socket-peer-gateway.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';

test('socket peer delivery preserves event, 5-second timeout and ACK interpretation', async () => {
  const message: PeerMessage = {
    version: '1.0', kind: 'event', from: 'aa', to: 'eserver', channel: 'worker', event: 'message',
    payload: { type: 'test', version: '1.0', data: {} }, id: '867fa91d-4a18-4018-8f34-f3c626d07460', timestamp: 1
  };
  const emitted: Array<{ event: string; payload: unknown; timeoutMs: number }> = [];
  let response = { ok: true };
  const connection: PeerSocketConnection = {
    peerId: 'eserver', instanceId: 'worker-1', connectionId: 'socket-1', connected: true,
    emit() {},
    async emitWithAck<T>(event: string, payload: unknown, timeoutMs: number) {
      emitted.push({ event, payload, timeoutMs });
      return response as T;
    },
    on() {}, onDisconnect() {}, disconnect() {}
  };
  const delivery = new SocketPeerMessageDelivery({ getConnection: () => connection });
  await delivery.deliver('eserver', connection.connectionId, message);
  assert.deepEqual(emitted, [{ event: 'peer:message', payload: message, timeoutMs: 5000 }]);
  response = { ok: false };
  await assert.rejects(delivery.deliver('eserver', connection.connectionId, message), /Destination eserver rejected message/);
  await assert.rejects(new SocketPeerMessageDelivery({ getConnection: () => undefined }).deliver('eserver', 'missing', message), /Destination eserver is offline/);
});
