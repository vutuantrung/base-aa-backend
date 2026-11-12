import { z } from 'zod';
import type { Server, Socket } from 'socket.io';
import { type PeerId, type ClientPeerId, type PeerMessage, type PeerMessageAck } from '../../modules/peer-messaging/contracts.js';
import { PeerMessageService, PeerMessageError } from '../../modules/peer-messaging/peer-message-service.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';

const inboundPeerIds = ['eserver', 'sserver', 'aaui'] as const;
const peerAuth = z.object({ peerId: z.enum(inboundPeerIds), token: z.string().optional() });

export interface ExternalPeerTransport {
  isConnected(): boolean;
  deliver(message: PeerMessage): Promise<void>;
}

/** Handles client-to-AAB peers and externally connected peers through one delivery registry. */
export function attachPeerGateway(io: Server, apiKey: string | undefined, transformations: TransformationRegistry) {
  const peers = io.of('/peers');
  const connected = new Map<Exclude<ClientPeerId, 'pserver'>, Socket>();
  let pserverTransport: ExternalPeerTransport | undefined;

  const service = new PeerMessageService(transformations, {
    isConnected(peer: PeerId) {
      return peer === 'aab' ||
        (peer === 'pserver' ? (pserverTransport?.isConnected() ?? false) : connected.has(peer as Exclude<ClientPeerId, 'pserver'>));
    },
    async deliver(message: PeerMessage): Promise<void> {
      if (message.to === 'pserver') {
        if (!pserverTransport?.isConnected()) throw new Error('PServer is offline');
        await pserverTransport.deliver(message);
      } else {
        const target = connected.get(message.to as Exclude<ClientPeerId, 'pserver'>);
        if (!target) throw new Error(`Destination ${message.to} is offline`);
        const response: { ok?: boolean } = await target.timeout(5000).emitWithAck('peer:message', message);
        if (!response?.ok) throw new Error(`Destination ${message.to} rejected message`);
      }
      console.log(`[AAB] FORWARD id=${message.id} from=${message.from} to=${message.to} type=${message.payload.type}`);
    }
  });

  async function handleMessage(value: unknown, authenticatedFrom: PeerId): Promise<PeerMessageAck> {
    try {
      const message = await service.process(value, authenticatedFrom);
      console.log(`[AAB] PROCESSED id=${message.id} from=${message.from} to=${message.to} type=${message.payload.type} transformers=${message.processing?.processedBy.join(',') || 'none'}`);
      return { ok: true, data: message };
    } catch (error) {
      const code = error instanceof PeerMessageError ? error.code : 'TRANSFORMATION_FAILED';
      console.error(`[AAB] MESSAGE ERROR from=${authenticatedFrom} code=${code}`, error);
      return { ok: false, code, error: error instanceof Error ? error.message : 'Internal message error' };
    }
  }

  peers.use((socket, next) => {
    const auth = peerAuth.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error('invalid peer identity'));
    if (apiKey && auth.data.token !== apiKey) return next(new Error('unauthorized'));
    if (connected.has(auth.data.peerId)) return next(new Error('peer already connected'));
    socket.data.peerId = auth.data.peerId;
    next();
  });

  peers.on('connection', (socket: Socket) => {
    const peerId = socket.data.peerId as Exclude<ClientPeerId, 'pserver'>;
    if (connected.has(peerId)) { socket.disconnect(true); return; }
    connected.set(peerId, socket);
    console.log(`[AAB] CONNECT peer=${peerId} socket=${socket.id}`);
    socket.emit('aab:welcome', { from: 'aab', to: peerId, message: 'connected', timestamp: Date.now() });
    socket.on('peer:ping', (payload: unknown, ack?: (data: { ok: boolean; from: string; timestamp: number }) => void) => {
      console.log(`[AAB] RECEIVE peer=${peerId} event=peer:ping payload=${JSON.stringify(payload)}`);
      ack?.({ ok: true, from: 'aab', timestamp: Date.now() });
    });
    socket.on('peer:message', async (value: unknown, ack?: (response: PeerMessageAck) => void) => {
      ack?.(await handleMessage(value, peerId));
    });
    socket.on('disconnect', reason => {
      if (connected.get(peerId)?.id === socket.id) connected.delete(peerId);
      console.log(`[AAB] DISCONNECT peer=${peerId} reason=${reason}`);
    });
  });

  return {
    registerPServerTransport(transport: ExternalPeerTransport): void { pserverTransport = transport; },
    receiveFromPServer(value: unknown): Promise<PeerMessageAck> { return handleMessage(value, 'pserver'); }
  };
}
