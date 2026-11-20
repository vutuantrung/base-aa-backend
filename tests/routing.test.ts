import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouteRegistry, defaultRoutes } from '../src/modules/messaging/route-registry.js';
import { MessageRouter, type OutboundTransportAdapter } from '../src/modules/messaging/message-router.js';
import { SendMessage } from '../src/modules/messaging/messaging.js';
import type { MessageEnvelope, NewMessage } from '../src/shared/contracts/message.js';

test('SendMessage publishes through a transport-independent publisher capability', async () => {
  let received: NewMessage | undefined;
  const sender = new SendMessage({
    async publish(message) {
      received = message;
      return { ...message, id: 'message-1', timestamp: '2026-01-01T00:00:00.000Z' };
    }
  });
  const result = await sender.execute({ channel: 'session', event: 'created', payload: { id: 1 }, correlationId: 'corr-1' });
  assert.deepEqual(received, { channel: 'session', event: 'created', payload: { id: 1 }, correlationId: 'corr-1' });
  assert.equal(result.correlationId, 'corr-1');
});

test('default channel routing is isolated', () => {
  const registry = new RouteRegistry(defaultRoutes());
  assert.deepEqual(registry.resolve('session', 'created'), [{ transport: 'socket', channel: 'session' }]);
  assert.deepEqual(registry.resolve('worker', 'created'), [{ transport: 'socket', channel: 'worker' }]);
});

test('matching exact and wildcard routes retain registration order and deduplicate destinations', () => {
  const registry = new RouteRegistry([
    { id: 'exact', source: 'worker', event: 'done', destinations: [{ transport: 'http', endpointId: 'first' }, { transport: 'socket', channel: 'session' }] },
    { id: 'wildcard', source: 'worker', event: '*', destinations: [{ transport: 'http', endpointId: 'first' }, { transport: 'http', endpointId: 'second' }] }
  ]);
  assert.deepEqual(registry.resolve('worker', 'done'), [
    { transport: 'http', endpointId: 'first' }, { transport: 'socket', channel: 'session' }, { transport: 'http', endpointId: 'second' }
  ]);
  assert.deepEqual(registry.resolve('worker', 'other'), [{ transport: 'http', endpointId: 'first' }, { transport: 'http', endpointId: 'second' }]);
});

test('route state belongs to each registry instance', () => {
  const first = new RouteRegistry(defaultRoutes());
  const second = new RouteRegistry();
  first.unregister('session-local');
  assert.deepEqual(first.resolve('session', 'created'), []);
  assert.deepEqual(second.resolve('session', 'created'), []);
  second.register({ id: 'only-second', source: 'session', event: '*', destinations: [{ transport: 'socket', channel: 'session' }] });
  assert.deepEqual(second.resolve('session', 'created'), [{ transport: 'socket', channel: 'session' }]);
  assert.deepEqual(first.resolve('session', 'created'), []);
});

test('route registry supports explicit cross-channel forwards, deduplicates and can unregister', () => {
  const registry = new RouteRegistry(defaultRoutes());
  registry.register({ id: 'bridge', source: 'worker', event: 'started', destinations: [{ transport: 'socket', channel: 'session' }, { transport: 'socket', channel: 'worker' }] });
  assert.deepEqual(registry.resolve('worker', 'started'), [
    { transport: 'socket', channel: 'worker' }, { transport: 'socket', channel: 'session' }
  ]);
  assert.equal(registry.unregister('bridge'), true);
  assert.deepEqual(registry.resolve('worker', 'started'), [{ transport: 'socket', channel: 'worker' }]);
});

test('router sends one envelope to every destination without republishing', async () => {
  const deliveries: Array<{ message: MessageEnvelope; destination: string }> = [];
  const socket: OutboundTransportAdapter = {
    transport: 'socket',
    async deliver(message, destination) { deliveries.push({ message, destination: JSON.stringify(destination) }); }
  };
  const webhook: OutboundTransportAdapter = {
    transport: 'http',
    async deliver(message, destination) { deliveries.push({ message, destination: JSON.stringify(destination) }); }
  };
  const registry = new RouteRegistry([
    { id: 'fwd', source: 'worker', event: 'usage', destinations: [{ transport: 'socket', channel: 'session' }, { transport: 'http', endpointId: 'collector' }] }
  ]);
  const router = new MessageRouter(registry, [socket, webhook]);
  const result = await router.publish({ channel: 'worker', event: 'usage', payload: { cpu: 1 }, correlationId: 'trace-1' });
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0]?.message.id, result.id);
  assert.equal(deliveries[1]?.message.id, result.id);
  assert.deepEqual(result, {
    id: result.id, channel: 'worker', event: 'usage', payload: { cpu: 1 }, timestamp: result.timestamp, correlationId: 'trace-1'
  });
  assert.ok(Number.isFinite(Date.parse(result.timestamp)));
});

test('invalid or duplicate rules fail before delivery', async () => {
  const registry = new RouteRegistry(defaultRoutes());
  assert.throws(() => registry.register({ id: 'session-local', source: 'session', event: 'x', destinations: [{ transport: 'socket', channel: 'worker' }] }), /Duplicate/);
  let deliveries = 0;
  const missing = new MessageRouter(new RouteRegistry([
    { id: 'webhook', source: 'session', event: '*', destinations: [{ transport: 'socket', channel: 'session' }, { transport: 'http', endpointId: 'x' }] }
  ]), [{ transport: 'socket', async deliver() { deliveries += 1; } }]);
  await assert.rejects(missing.publish({ channel: 'session', event: 'x', payload: {} }), /Missing adapter/);
  assert.equal(deliveries, 0);
});

test('router rejects duplicate adapter transports and publishes with zero destinations', async () => {
  const adapter: OutboundTransportAdapter = { transport: 'socket', async deliver() {} };
  assert.throws(() => new MessageRouter(new RouteRegistry(), [adapter, adapter]), /Duplicate transport: socket/);
  const router = new MessageRouter(new RouteRegistry(), []);
  const envelope = await router.publish({ channel: 'session', event: 'unrouted', payload: { ok: true } });
  assert.equal(envelope.channel, 'session');
  assert.equal(envelope.event, 'unrouted');
});

test('delivery errors reject publish after concurrent delivery starts', async () => {
  const started: string[] = [];
  const failing: OutboundTransportAdapter = {
    transport: 'http', async deliver() { started.push('http'); throw new Error('delivery failed'); }
  };
  const successful: OutboundTransportAdapter = {
    transport: 'socket', async deliver() { started.push('socket'); }
  };
  const router = new MessageRouter(new RouteRegistry([
    { id: 'both', source: 'session', event: 'x', destinations: [{ transport: 'http', endpointId: 'a' }, { transport: 'socket', channel: 'session' }] }
  ]), [failing, successful]);
  await assert.rejects(router.publish({ channel: 'session', event: 'x', payload: {} }), /delivery failed/);
  assert.deepEqual(started, ['http', 'socket']);
});
