import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouteRegistry, defaultRoutes } from '../src/modules/messaging/route-registry.js';
import { MessageRouter, type OutboundTransportAdapter } from '../src/modules/messaging/message-router.js';
import type { MessageEnvelope } from '../src/shared/contracts/message.js';

test('default channel routing is isolated', () => {
  const registry = new RouteRegistry(defaultRoutes());
  assert.deepEqual(registry.resolve('session', 'created'), [{ transport: 'socket', channel: 'session' }]);
  assert.deepEqual(registry.resolve('worker', 'created'), [{ transport: 'socket', channel: 'worker' }]);
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
  const result = await router.publish({ channel: 'worker', event: 'usage', payload: { cpu: 1 } });
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0]?.message.id, result.id);
  assert.equal(deliveries[1]?.message.id, result.id);
});

test('invalid or duplicate rules fail before delivery', async () => {
  const registry = new RouteRegistry(defaultRoutes());
  assert.throws(() => registry.register({ id: 'session-local', source: 'session', event: 'x', destinations: [{ transport: 'socket', channel: 'worker' }] }), /Duplicate/);
  const missing = new MessageRouter(new RouteRegistry([
    { id: 'webhook', source: 'session', event: '*', destinations: [{ transport: 'http', endpointId: 'x' }] }
  ]), []);
  await assert.rejects(missing.publish({ channel: 'session', event: 'x', payload: {} }), /Missing adapter/);
});
