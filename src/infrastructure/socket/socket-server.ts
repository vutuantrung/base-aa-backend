import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { z } from 'zod';
import { CHANNELS, type Channel, type MessageEnvelope, type MessageConsumer } from '../../shared/contracts/message.js';
import type { SendMessage } from '../../modules/messaging/messaging.js';

const inboundMessage = z.object({ event: z.string().min(1).max(100), payload: z.unknown(), correlationId: z.string().max(200).optional() });
type Ack = (result: { ok: true; data: MessageEnvelope } | { ok: false; error: string }) => void;

/** Namespace per business channel. Client uses /session or /worker, emits 'message'. */
export function attachSocketServer(http: HttpServer, deps: { sender: SendMessage; bus: MessageConsumer; corsOrigin: string; apiKey?: string }) {
  const io = new Server(http, { cors: { origin: deps.corsOrigin }, maxHttpBufferSize: 1_000_000 });
  const unsubscribers: Array<() => void> = [];
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
    unsubscribers.push(deps.bus.subscribe(channel as Channel, (message) => { namespace.emit('message', message); }));
  }
  return { io, close: async () => { unsubscribers.forEach(fn => fn()); await new Promise<void>(resolve => io.close(() => resolve())); } };
}
