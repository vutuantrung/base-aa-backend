import { Server, type Socket } from 'socket.io';
import { attachPeerGateway } from './peer-gateway.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';
import type { Server as HttpServer } from 'node:http';
import { z } from 'zod';
import { CHANNELS, type Channel, type MessageEnvelope } from '../../shared/contracts/message.js';
import type { SendMessage } from '../../modules/messaging/messaging.js';

const inboundMessage = z.object({ event: z.string().min(1).max(100), payload: z.unknown(), correlationId: z.string().max(200).optional() });
type Ack = (result: { ok: true; data: MessageEnvelope } | { ok: false; error: string }) => void;

export interface SocketMessageHub {
  broadcast(channel: Channel, message: MessageEnvelope): void;
}

/** Socket is an inbound adapter and broadcast-only outbound gateway. Never republish outbound events. */
export function attachSocketServer(http: HttpServer, deps: { sender: SendMessage; corsOrigin: string; apiKey?: string; enableTestPeers?: boolean; transformations?: TransformationRegistry }) {
  const io = new Server(http, { cors: { origin: deps.corsOrigin }, maxHttpBufferSize: 1_000_000 });
  if (deps.enableTestPeers) {
    if (!deps.transformations) throw new Error('Peer transformations registry is required');
    attachPeerGateway(io, deps.apiKey, deps.transformations);
  }
  for (const channel of CHANNELS) {
    const namespace = io.of(`/${channel}`);
    namespace.use((socket, next) => {
      if (deps.apiKey && socket.handshake.auth.token !== deps.apiKey) return next(new Error('unauthorized'));
      next();
    });
    namespace.on('connection', (socket: Socket) => {
      socket.on('message', async (value: unknown, ack?: Ack) => {
        const parsed = inboundMessage.safeParse(value);
        if (!parsed.success) { ack?.({ ok: false, error: 'invalid message' }); return; }
        try {
          const data = await deps.sender.execute({ channel, ...parsed.data });
          ack?.({ ok: true, data });
        } catch (error) {
          console.error('Socket message failure:', error);
          ack?.({ ok: false, error: 'internal server error' });
        }
      });
    });
  }
  return {
    io,
    broadcast(channel: Channel, message: MessageEnvelope) { io.of(`/${channel}`).emit('message', message); },
    close: async () => { await new Promise<void>(resolve => io.close(() => resolve())); }
  };
}
