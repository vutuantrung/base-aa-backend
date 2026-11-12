import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import { clientPeerIds, type PeerId, type ClientPeerId, type PeerMessage, type PeerMessageAck } from '../../modules/peer-messaging/contracts.js';
import { PeerMessageService, PeerMessageError } from '../../modules/peer-messaging/peer-message-service.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';

const peerAuth = z.object({
  peerId: z.enum(clientPeerIds),
  token: z.string().optional()
});

export function attachPeerGateway(io: Server, apiKey: string | undefined, transformations: TransformationRegistry): void {
  const peers = io.of('/peers');
  const connected = new Map<ClientPeerId, Socket>();

  const service = new PeerMessageService(transformations, {
    isConnected(peer: PeerId) { return peer === 'aab' || connected.has(peer as ClientPeerId); },
    async deliver(message: PeerMessage): Promise<void> {
      const target = connected.get(message.to as ClientPeerId);
      if (!target) throw new Error(`Destination ${message.to} is offline`);
      // Destination explicitly acknowledges receipt; this does not imply business completion.
      const response: { ok?: boolean } = await target.timeout(5000).emitWithAck('peer:message', message);
      if (!response?.ok) throw new Error(`Destination ${message.to} rejected message`);
      console.log(`[AAB] FORWARD id=${message.id} from=${message.from} to=${message.to} type=${message.payload.type}`);
    }
  });

  peers.use((socket, next) => {
    const auth = peerAuth.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error('invalid peer identity'));
    if (apiKey && auth.data.token !== apiKey) return next(new Error('unauthorized'));
    if (connected.has(auth.data.peerId)) return next(new Error('peer already connected'));
    socket.data.peerId = auth.data.peerId;
    next();
  });

  peers.on('connection', (socket: Socket) => {
    const peerId = socket.data.peerId as ClientPeerId;
    // Reject concurrent duplicates even if handshake middleware raced.
    if (connected.has(peerId)) { socket.disconnect(true); return; }
    connected.set(peerId, socket);
    console.log(`[AAB] CONNECT peer=${peerId} socket=${socket.id}`);
    socket.emit('aab:welcome', { from: 'aab', to: peerId, message: 'connected', timestamp: Date.now() });

    socket.on('peer:ping', (payload: unknown, ack?: (data: { ok: boolean; from: string; timestamp: number }) => void) => {
      console.log(`[AAB] RECEIVE peer=${peerId} event=peer:ping payload=${JSON.stringify(payload)}`);
      ack?.({ ok: true, from: 'aab', timestamp: Date.now() });
    });
    socket.on('peer:message', async (value: unknown, ack?: (response: PeerMessageAck) => void) => {
      try {
        const message = await service.process(value, peerId);
        console.log(`[AAB] PROCESSED id=${message.id} from=${message.from} to=${message.to} type=${message.payload.type} transformers=${message.processing?.processedBy.join(',') || 'none'}`);
        ack?.({ ok: true, data: message });
      } catch (error) {
        const code = error instanceof PeerMessageError ? error.code : 'TRANSFORMATION_FAILED';
        console.error(`[AAB] MESSAGE ERROR from=${peerId} code=${code}`, error);
        ack?.({ ok: false, code, error: error instanceof Error ? error.message : 'Internal message error' });
      }
    });
    socket.on('disconnect', reason => {
      if (connected.get(peerId)?.id === socket.id) connected.delete(peerId);
      console.log(`[AAB] DISCONNECT peer=${peerId} reason=${reason}`);
    });
  });
}
