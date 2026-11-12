import { z } from 'zod';
import type { Server, Socket } from 'socket.io';

export const TEST_PEER_IDS = ['pserver', 'eserver', 'sserver', 'aaui'] as const;
export type TestPeerId = typeof TEST_PEER_IDS[number];

const peerAuth = z.object({
  peerId: z.enum(TEST_PEER_IDS),
  token: z.string().optional()
});

/**
 * Opt-in test gateway only. No business routing or peer-to-peer forwarding.
 * One connection receives one targeted welcome event.
 */
export function attachPeerGateway(io: Server, apiKey?: string): void {
  const peers = io.of('/peers');
  peers.use((socket, next) => {
    const auth = peerAuth.safeParse(socket.handshake.auth);
    if (!auth.success) { next(new Error('invalid peer identity')); return; }
    if (apiKey && auth.data.token !== apiKey) { next(new Error('unauthorized')); return; }
    socket.data.peerId = auth.data.peerId;
    next();
  });
  peers.on('connection', (socket: Socket) => {
    const peerId = socket.data.peerId as TestPeerId;
    console.log(`[AAB] CONNECT peer=${peerId} socket=${socket.id}`);
    socket.emit('aab:welcome', { from: 'aab', to: peerId, message: 'connected', timestamp: Date.now() });
    socket.on('peer:ping', (payload: unknown, ack?: (data: { ok: boolean; from: string; timestamp: number }) => void) => {
      console.log(`[AAB] RECEIVE peer=${peerId} event=peer:ping payload=${JSON.stringify(payload)}`);
      ack?.({ ok: true, from: 'aab', timestamp: Date.now() });
    });
    socket.on('disconnect', reason => console.log(`[AAB] DISCONNECT peer=${peerId} reason=${reason}`));
  });
}
