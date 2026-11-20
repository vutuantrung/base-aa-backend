import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { Server, type Socket } from 'socket.io';
import { HttpMessageClient, SocketMessageClient, type ConnectableMessageClient } from '../src/infrastructure/integration-clients/index.js';
import { HttpMessageClient as LegacyHttpMessageClient, SocketMessageClient as LegacySocketMessageClient } from '../src/shared/transport/connectable-client.js';
import type { ConnectableMessageClient as LegacyConnectableMessageClient } from '../src/shared/transport/connectable-client.js';
import type { MessageEnvelope } from '../src/shared/contracts/message.js';

const http = createServer();
const io = new Server(http);
let baseUrl: string;
let connectionCount = 0;
let receivedToken: unknown;
let currentSocket: Socket | undefined;

const canonicalClient: ConnectableMessageClient = new HttpMessageClient('http://example.test');
const legacyClient: LegacyConnectableMessageClient = canonicalClient;
const canonicalClientFromLegacy: ConnectableMessageClient = legacyClient;
const legacyInterfaceFromCanonical: LegacyConnectableMessageClient = canonicalClient;
void canonicalClientFromLegacy;
void legacyInterfaceFromCanonical;
io.of('/session').on('connection', socket => {
  connectionCount += 1;
  receivedToken = socket.handshake.auth.token;
  currentSocket = socket;
  socket.on('message', (value: { event: string; payload: unknown; correlationId?: string }, ack?: (result: unknown) => void) => {
    if (value.event === 'reject') { ack?.({ ok: false, error: 'rejected by test server' }); return; }
    const response: MessageEnvelope = {
      id: `message-${connectionCount}-${value.event}`,
      channel: 'session', event: value.event, payload: value.payload,
      timestamp: '2026-01-01T00:00:00.000Z', ...(value.correlationId ? { correlationId: value.correlationId } : {})
    };
    ack?.({ ok: true, data: response });
  });
});

before(async () => {
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing integration client test port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await new Promise<void>(resolve => io.close(() => resolve()));
  if (http.listening) await new Promise<void>(resolve => http.close(() => resolve()));
});

test('HTTP client sends through the app endpoint and preserves HTTP error behavior', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl: URL | undefined;
  let requestHeaders: Headers | undefined;
  let requestBody: string | undefined;
  globalThis.fetch = async (input, init) => {
    requestUrl = new URL(String(input));
    requestHeaders = new Headers(init?.headers);
    requestBody = String(init?.body);
    return new Response(JSON.stringify({ id: 'http-message', channel: 'worker', event: 'saved', payload: {}, timestamp: 'now' }), { status: 202 });
  };
  try {
    const client = new HttpMessageClient('http://example.test/base', 'secret');
    const message = await client.send({ channel: 'worker', event: 'save', payload: {} });
    await client.close();
    assert.equal(requestUrl?.pathname, '/api/messages');
    assert.equal(requestHeaders?.get('x-api-key'), 'secret');
    assert.equal(requestHeaders?.get('content-type'), 'application/json');
    assert.equal(requestBody, JSON.stringify({ channel: 'worker', event: 'save', payload: {} }));
    assert.equal(message.id, 'http-message');

    globalThis.fetch = async () => new Response('', { status: 502 });
    await assert.rejects(client.send({ channel: 'worker', event: 'fail', payload: {} }), { message: 'HTTP message request failed: 502' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy barrel preserves canonical client class identities', () => {
  assert.equal(LegacyHttpMessageClient, HttpMessageClient);
  assert.equal(LegacySocketMessageClient, SocketMessageClient);
});

test('Socket.IO client reuses a channel connection, preserves ACK errors and closes it', async () => {
  const initialConnections = connectionCount;
  const client = new SocketMessageClient(baseUrl, 'socket-token');
  const first = await client.send({ channel: 'session', event: 'first', payload: { n: 1 } });
  const second = await client.send({ channel: 'session', event: 'second', payload: { n: 2 }, correlationId: 'corr-2' });
  assert.equal(first.id, `message-${initialConnections + 1}-first`);
  assert.equal(second.correlationId, 'corr-2');
  assert.equal(connectionCount, initialConnections + 1);
  assert.equal(receivedToken, 'socket-token');
  await assert.rejects(client.send({ channel: 'session', event: 'reject', payload: {} }), { message: 'rejected by test server' });

  const disconnected = new Promise<void>(resolve => currentSocket?.once('disconnect', () => resolve()));
  await client.close();
  await disconnected;
});
