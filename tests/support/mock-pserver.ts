import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer, type Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';

export async function createMockPServer() {
  const http: HttpServer = createServer();
  const io = new SocketIoServer(http, { path: '/ws' });
  const peers = io.of('/');
  let resolveConnection!: (socket: Socket) => void;
  let connected: Socket | undefined;
  let sessionId: string | undefined;
  const arrival = new Promise<Socket>(resolve => { resolveConnection = resolve; });
  peers.use((socket, next) => {
    if (socket.handshake.auth?.peerId !== 'aab') return next(new Error('invalid identity'));
    next();
  });
  peers.on('connection', socket => {
    connected = socket;
    socket.on('automation_vm:session:connect', (value: unknown, ack?: (response: unknown) => void) => {
      const request = value as { session_id?: string; udid?: string };
      if (request.session_id && request.session_id !== sessionId) {
        ack?.({ ok: false, error: 'unknown session' });
        return;
      }
      if (!sessionId && !request.udid) { ack?.({ ok: false, error: 'missing udid' }); return; }
      sessionId ??= randomUUID();
      ack?.({ ok: true, session: { id: sessionId, vm_udid: request.udid ?? 'test-vm' } });
      resolveConnection(socket);
    });
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing mock port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    get connected() { return connected; },
    get sessionId() { return sessionId; },
    arrival,
    close: async () => {
      await new Promise<void>(resolve => io.close(() => resolve()));
      if (http.listening) await new Promise<void>(resolve => http.close(() => resolve()));
    }
  };
}
