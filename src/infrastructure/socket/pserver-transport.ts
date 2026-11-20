import { io } from 'socket.io-client';

export type TransportEventHandler = (...arguments_: unknown[]) => void;

export interface PServerTransport {
  readonly connected: boolean;
  on(event: string, handler: TransportEventHandler): () => void;
  emitWithAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T>;
  connect(): void;
  close(): void;
}

/** Socket.IO mechanics for the outbound PServer connection. */
export function createPServerTransport(config: { url: string; path?: string; apiKey?: string }): PServerTransport {
  const client = io(config.url, {
    path: config.path ?? '/ws',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    auth: { peerId: 'aab', ...(config.apiKey ? { token: config.apiKey } : {}) }
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
