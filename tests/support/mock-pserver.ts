import { createServer, type Server as HttpServer } from 'node:http';
import { Server as SocketIoServer, type Socket } from 'socket.io';

export async function createMockPServer() {
  const http: HttpServer = createServer();
  const io = new SocketIoServer(http);
  const peers = io.of('/aab');
  let resolveConnection!: (socket: Socket) => void;
  let connected: Socket | undefined;
  const arrival = new Promise<Socket>(resolve => { resolveConnection = resolve; });
  peers.use((socket, next) => {
    if (socket.handshake.auth?.peerId !== 'aab') return next(new Error('invalid identity'));
    next();
  });
  peers.on('connection', socket => {
    connected = socket;
    resolveConnection(socket);
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing mock port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    get connected() { return connected; },
    arrival,
    close: async () => {
      await new Promise<void>(resolve => io.close(() => resolve()));
      if (http.listening) await new Promise<void>(resolve => http.close(() => resolve()));
    }
  };
}
