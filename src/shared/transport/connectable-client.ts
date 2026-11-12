import { io, type Socket } from 'socket.io-client';
import type { Channel, MessageEnvelope, NewMessage } from '../contracts/message.js';

/** Same outbound contract for calling this app through HTTP or Socket.IO. */
export interface ConnectableMessageClient {
  send(message: NewMessage): Promise<MessageEnvelope>;
  close(): Promise<void>;
}

export class HttpMessageClient implements ConnectableMessageClient {
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}
  async send(message: NewMessage): Promise<MessageEnvelope> {
    const response = await fetch(new URL('/api/messages', this.baseUrl), {
      method: 'POST', headers: { 'content-type': 'application/json', ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}) }, body: JSON.stringify(message)
    });
    if (!response.ok) throw new Error(`HTTP message request failed: ${response.status}`);
    return await response.json() as MessageEnvelope;
  }
  async close(): Promise<void> {}
}

export class SocketMessageClient implements ConnectableMessageClient {
  private readonly sockets = new Map<Channel, Socket>();
  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}
  async send(message: NewMessage): Promise<MessageEnvelope> {
    const socket = this.getSocket(message.channel);
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('Socket connect timeout')); }, 5000);
        const cleanup = () => { clearTimeout(timer); socket.off('connect', connected); socket.off('connect_error', failed); };
        const connected = () => { cleanup(); resolve(); };
        const failed = (error: Error) => { cleanup(); reject(error); };
        socket.once('connect', connected); socket.once('connect_error', failed);
        socket.connect();
      });
    }
    const result = await socket.timeout(5000).emitWithAck('message', { event: message.event, payload: message.payload, correlationId: message.correlationId }) as
      { ok: true; data: MessageEnvelope } | { ok: false; error: string };
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
  private getSocket(channel: Channel): Socket {
    let socket = this.sockets.get(channel);
    if (!socket) {
      socket = io(`${this.baseUrl.replace(/\/$/, '')}/${channel}`, { autoConnect: false, auth: this.apiKey ? { token: this.apiKey } : {} });
      this.sockets.set(channel, socket);
    }
    return socket;
  }
  async close(): Promise<void> { for (const socket of this.sockets.values()) socket.disconnect(); this.sockets.clear(); }
}
