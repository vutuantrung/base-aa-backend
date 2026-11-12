import { io } from 'socket.io-client';
import type { PeerMessage } from '../../modules/peer-messaging/contracts.js';
import type { attachPeerGateway } from './peer-gateway.js';

/**
 * AAB is the Socket.IO client; PServer is the Socket.IO server.
 * The /aab namespace on PServer is isolated from its local diagnostic socket server.
 */
export function connectToPServer(
  url: string,
  apiKey: string | undefined,
  gateway: ReturnType<typeof attachPeerGateway>
) {
  const client = io(`${url.replace(/\/$/, '')}/aab`, {
    autoConnect: false,
    reconnection: true,
    transports: ['websocket'],
    auth: { peerId: 'aab', ...(apiKey ? { token: apiKey } : {}) }
  });

  gateway.registerPServerTransport({
    isConnected: () => client.connected,
    async deliver(message: PeerMessage): Promise<void> {
      const result: { ok?: boolean } = await client.timeout(5000).emitWithAck('peer:message', message);
      if (!result?.ok) throw new Error('PServer rejected message');
    }
  });

  client.on('connect', () => {
    console.log(`[AAB] CONNECT to PServer url=${url} socket=${client.id}`);
    client.timeout(5000).emit('peer:ping', { from: 'aab' }, (error: Error | null, response: unknown) => {
      if (error) console.error('[AAB] PServer ping failed:', error.message);
      else console.log('[AAB] RECEIVE PServer ping ACK', response);
    });
  });
  client.on('peer:message', async (value: unknown, ack?: (result: Awaited<ReturnType<typeof gateway.receiveFromPServer>>) => void) => {
    console.log('[AAB] RECEIVE PServer peer:message');
    ack?.(await gateway.receiveFromPServer(value));
  });
  client.on('connect_error', error => console.error('[AAB] PServer connection error:', error.message));
  client.on('disconnect', reason => console.log(`[AAB] DISCONNECT from PServer reason=${reason}`));

  return {
    connect: () => client.connect(),
    close: () => client.disconnect(),
    get connected() { return client.connected; }
  };
}
