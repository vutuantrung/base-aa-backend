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
  middlewares[0]?.({ id: 'fake-aa-socket', handshake: { auth: { peerId: 'aa', token: 'local-key' } } }, error => {
    middlewareError = error;
  });

  assert.equal(middlewareError, undefined);
  assert.equal(directory.lookup('aa')?.connectionId, 'fake-aa-socket');
  // Deliberately do not invoke the namespace connection handler. This models a sequence only;
  // it does not establish that Socket.IO can reach or retain this state on a real handshake.
});

test('downstream namespace rejection retains identity and blocks retry', async () => {
  const httpServer = createServer();
  const ioServer = new SocketIoServer(httpServer, { serveClient: false });
  const directory = new PeerDirectory();
  createSocketPeerGateway(ioServer, 'local-key', directory);
  ioServer.of('/session').on('connection', () => {});

  // Socket.IO runs namespace middleware in registration order. This controlled later middleware
  // rejects after createSocketPeerGateway has registered M06 identity, before `connection` fires.
  let socketDisconnectFired = false;
  let transportCloseFired = false;
  ioServer.of('/peers').use((socket, next) => {
    socket.once('disconnect', () => { socketDisconnectFired = true; });
    socket.once('disconnecting', () => { socketDisconnectFired = true; });
    socket.client.conn.once('close', () => { transportCloseFired = true; });
    next(new Error('controlled downstream rejection'));
  });

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
    const sessionClient = createSocketClient(`http://127.0.0.1:${address.port}/session`, {
      transports: ['websocket'], reconnection: false
    });
    await new Promise<void>((resolve, reject) => {
      sessionClient.once('connect', resolve);
      sessionClient.once('connect_error', reject);
    });
    const client = createSocketClient(`http://127.0.0.1:${address.port}/peers`, {
      transports: ['websocket'], reconnection: false,
      auth: { peerId: 'aa', token: 'local-key' }
    });
    try {
      assert.equal(client.io, sessionClient.io);
      const connectionError = await new Promise<Error>(resolve => client.once('connect_error', resolve));
      assert.equal(connectionError.message, 'controlled downstream rejection');
      assert.equal(client.io.engine.readyState, 'open');
      assert.equal(sessionClient.connected, true);
      assert.equal(socketDisconnectFired, false);
      assert.equal(transportCloseFired, false);
      const rejectedIdentity = directory.lookup('aa');
      assert.ok(rejectedIdentity);
      assert.equal(rejectedIdentity.peerId, 'aa');
      assert.ok(rejectedIdentity.connectionId.length > 0);
      assert.notEqual(rejectedIdentity.connectionId, 'retry-aa-socket');
      assert.throws(() => directory.register('aa', 'retry-aa-socket'), { message: 'peer already connected' });
    } finally {
      client.disconnect();
      sessionClient.disconnect();
    }
  } finally {
    await new Promise<void>(resolve => ioServer.close(() => resolve()));
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
});
