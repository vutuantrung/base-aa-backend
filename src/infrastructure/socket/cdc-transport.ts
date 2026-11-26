import { io } from 'socket.io-client';
import type { CdcTransport, TransportEventHandler } from '../../modules/cdc/contracts.js';

export type { CdcTransport, TransportEventHandler } from '../../modules/cdc/contracts.js';

/** Socket.IO mechanics for the outbound Cdc connection. */
export function createCdcTransport(config: { url: string; path?: string; apiKey?: string }): CdcTransport {
  const client = io(config.url, {
    path: config.path ?? '/ws',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    auth: { peerId: 'as', ...(config.apiKey ? { token: config.apiKey } : {}) }
  });
  return {
    get connected() { return client.connected; },
    on: (event, handler) => {
      const listener = (...arguments_: unknown[]) => handler(...arguments_);
      client.on(event, listener);
      return () => client.off(event, listener);
    },
    emitWithAck: <T>(event: string, payload: unknown, timeoutMs: number) =>
      client.timeout(timeoutMs).emitWithAck(event, payload) as Promise<T>,
    connect: () => client.connect(),
    close: () => client.disconnect()
  };
}
