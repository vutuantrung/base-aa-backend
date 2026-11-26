import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { PeerDirectory, type PeerIdentity } from '../../modules/peer-messaging/peer-directory.js';

const peerAuth = z.object({
  peerId: z.enum(['eserver', 'spa', 'aa']),
  instanceId: z.string().trim().min(1).max(100).optional(),
  token: z.string().optional()
});

export interface PeerSocketConnection extends PeerIdentity {
  readonly connected: boolean;
  emit(event: string, payload: unknown): void;
  emitWithAck<T>(event: string, payload: unknown, timeoutMs: number): Promise<T>;
  on(event: string, handler: (...arguments_: unknown[]) => void): void;
  onDisconnect(handler: (reason: string, removedCurrentIdentity: boolean) => void): void;
  disconnect(): void;
}

/** Socket.IO namespace and physical connection capabilities for the peer gateway. */
export function createSocketPeerGateway(io: Server, apiKey: string | undefined, directory: PeerDirectory,
  isAccepting: () => boolean = () => true) {
  const peers = io.of('/peers');
  let connectionHandler: ((connection: PeerSocketConnection) => void) | undefined;

  peers.use((socket, next) => {
    const auth = peerAuth.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error('invalid peer identity'));
    if (apiKey && auth.data.token !== apiKey) return next(new Error('unauthorized'));
    if (!isAccepting()) return next(new Error('APPLICATION_DRAINING'));
    try {
      directory.register(auth.data.peerId, socket.id, auth.data.instanceId);
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error('peer already connected'));
    }
  });

  peers.on('connection', (socket: Socket) => {
    const identity = directory.lookupConnection(socket.id);
    if (!identity) { socket.disconnect(true); return; }
    connectionHandler?.(wrapConnection(socket, identity, directory));
  });

  return {
    onConnection(handler: (connection: PeerSocketConnection) => void): void { connectionHandler = handler; },
    getConnection(connectionId: string): PeerSocketConnection | undefined {
      const socket = peers.sockets.get(connectionId);
      const identity = directory.lookupConnection(connectionId);
      return socket && identity ? wrapConnection(socket, identity, directory) : undefined;
    }
  };
}

function wrapConnection(socket: Socket, identity: PeerIdentity, directory: PeerDirectory): PeerSocketConnection {
  return {
    ...identity,
    get connected() { return socket.connected; },
    emit: (event, payload) => { socket.emit(event, payload); },
    emitWithAck: <T>(event: string, payload: unknown, timeoutMs: number) => socket.timeout(timeoutMs).emitWithAck(event, payload) as Promise<T>,
    on: (event, handler) => { socket.on(event, (...arguments_: unknown[]) => handler(...arguments_)); },
    onDisconnect: handler => { socket.on('disconnect', reason => handler(reason, directory.remove(identity))); },
    disconnect: () => { socket.disconnect(true); }
  };
}
