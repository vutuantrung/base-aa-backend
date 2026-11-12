import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PeerMessageService, PeerMessageError } from '../src/modules/peer-messaging/peer-message-service.js';
import { TransformationRegistry } from '../src/modules/peer-messaging/transformation-registry.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';

const input = { version: '1.0', kind: 'request', from: 'pserver', to: 'eserver',
  channel: 'worker', event: 'message',
  payload: { type: 'demo.enrich', version: '1.0', data: { value: 1 } }
};

test('multiple transformations execute in priority order and preserve routing metadata', async () => {
  const deliveries: PeerMessage[] = [];
  const registry = new TransformationRegistry();
  registry.register({ id: 'last', from: '*', to: 'eserver', payloadType: 'demo.enrich', priority: 20,
    transformer: { transform(message) {
      const data = message.payload.data as { value: number; first: boolean };
      return { ...message.payload, data: { ...data, second: true } };
    } } });
  registry.register({ id: 'first', from: 'pserver', to: 'eserver', payloadType: 'demo.enrich', priority: 10,
    transformer: { transform(message) { return { ...message.payload, data: { ...(message.payload.data as object), first: true } }; } } });
  const service = new PeerMessageService(registry, { isConnected: () => true, async deliver(message) { deliveries.push(message); } });
  const result = await service.process(input, 'pserver');
  assert.deepEqual(result.payload.data, { value: 1, first: true, second: true });
  assert.deepEqual(result.processing?.processedBy, ['first', 'last']);
  assert.equal(result.from, 'pserver');
  assert.equal(result.to, 'eserver');
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.id, result.id);
  assert.deepEqual(input.payload.data, { value: 1 });
});

test('unmatched types forward without modification', async () => {
  let received: PeerMessage | undefined;
  const service = new PeerMessageService(new TransformationRegistry(),
    { isConnected: () => true, async deliver(message) { received = message; } });
  const result = await service.process(input, 'pserver');
  assert.equal(result.processing?.transformed, false);
  assert.deepEqual(result.payload, input.payload);
  assert.equal(received?.id, result.id);
});

test('forged FROM is rejected before delivery', async () => {
  const service = new PeerMessageService(new TransformationRegistry(),
    { isConnected: () => true, async deliver() { assert.fail('Should not deliver'); } });
  await assert.rejects(service.process(input, 'sserver'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'SENDER_MISMATCH');
});

test('failed transformation rejects and prevents forwarding', async () => {
  const registry = new TransformationRegistry();
  registry.register({ id: 'fail', from: '*', to: '*', payloadType: '*', priority: 1,
    transformer: { transform() { throw new Error('bad payload'); } } });
  const service = new PeerMessageService(registry,
    { isConnected: () => true, async deliver() { assert.fail('Should not deliver'); } });
  await assert.rejects(service.process(input, 'pserver'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'TRANSFORMATION_FAILED');
});

test('offline destination rejects before transformation', async () => {
  let transformed = false;
  const registry = new TransformationRegistry();
  registry.register({ id: 'noop', from: '*', to: '*', payloadType: '*', priority: 1,
    transformer: { transform(message) { transformed = true; return message.payload; } } });
  const service = new PeerMessageService(registry,
    { isConnected: () => false, async deliver() { assert.fail('Should not deliver'); } });
  await assert.rejects(service.process(input, 'pserver'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
  assert.equal(transformed, false);
});
