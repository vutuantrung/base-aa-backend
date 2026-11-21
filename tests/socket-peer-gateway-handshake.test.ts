import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'socket.io';
import { Server as SocketIoServer } from 'socket.io';
import { io as createSocketClient } from 'socket.io-client';
import { test } from 'node:test';
import { createSocketPeerGateway } from '../src/infrastructure/socket/socket-peer-gateway.js';
import { PeerDirectory } from '../src/modules/peer-messaging/peer-directory.js';

test('isolated middleware-gap simulation leaves the registered identity when connection callback never runs', () => {
  type FakeSocket = { id: string; handshake: { auth: unknown } };
  type Middleware = (socket: FakeSocket, next: (error?: Error) => void) => void;
  const middlewares: Middleware[] = [];
  const fakeNamespace = {
    sockets: new Map(),
    use(middleware: Middleware) { middlewares.push(middleware); },
    on() {}
  };
  const fakeIo = { of: () => fakeNamespace } as unknown as Server;
  const directory = new PeerDirectory();
  createSocketPeerGateway(fakeIo, 'local-key', directory);

  let middlewareError: Error | undefined;
  middlewares[0]?.({ id: 'fake-aaui-socket', handshake: { auth: { peerId: 'aaui', token: 'local-key' } } }, error => {
    middlewareError = error;
  });

  assert.equal(middlewareError, undefined);
  assert.equal(directory.lookup('aaui')?.connectionId, 'fake-aaui-socket');
  // Deliberately do not invoke the namespace connection handler. This models a sequence only;
  // it does not establish that Socket.IO can reach or retain this state on a real handshake.
});

test('downstream namespace middleware rejection exposes identity cleanup gap', async () => {
  const httpServer = createServer();
  const ioServer = new SocketIoServer(httpServer, { serveClient: false });
  const directory = new PeerDirectory();
  createSocketPeerGateway(ioServer, 'local-key', directory);

  // Socket.IO runs namespace middleware in registration order. This controlled later middleware
  // rejects after createSocketPeerGateway has registered M06 identity, before `connection` fires.
  ioServer.of('/peers').use((_socket, next) => next(new Error('controlled downstream rejection')));

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(0, '127.0.0.1', () => {
        httpServer.off('error', reject);
        resolve();
      });
    });
    const address = httpServer.address();
    assert.ok(address && typeof address === 'object');
    const client = createSocketClient(`http://127.0.0.1:${address.port}/peers`, {
      transports: ['websocket'], reconnection: false,
      auth: { peerId: 'aaui', token: 'local-key' }
    });
    try {
      const connectionError = await new Promise<Error>(resolve => client.once('connect_error', resolve));
      assert.equal(connectionError.message, 'controlled downstream rejection');
      const rejectedIdentity = directory.lookup('aaui');
      assert.ok(rejectedIdentity);
      assert.equal(rejectedIdentity.peerId, 'aaui');
      assert.throws(() => directory.register('aaui', 'retry-aaui-socket'), { message: 'peer already connected' });
      // Proposed cleanup invariant under review: current code retains the identity, so this assertion
      // intentionally fails as evidence. Do not repair it in this characterization task.
      assert.equal(directory.lookup('aaui'), undefined);
    } finally {
      client.disconnect();
    }
  } finally {
    await new Promise<void>(resolve => ioServer.close(() => resolve()));
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
});
