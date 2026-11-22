import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PeerMessageService, PeerMessageError } from '../src/modules/peer-messaging/peer-message-service.js';
import { TransformationRegistry } from '../src/modules/peer-messaging/transformation-registry.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';
import { AtomicJsonRecordStore, createReliableRecord } from '../src/shared/persistence/atomic-json-record-store.js';

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

test('prepared delivery preserves R7.3 transformer output rules for generic and durable paths', async () => {
  const received: PeerMessage[] = [];
  const registry = new TransformationRegistry();
  registry.register({ id: 'legacy-output', from: '*', to: '*', payloadType: '*', priority: 1,
    transformer: { transform(message) {
      return Object.assign({}, message.payload, { version: '', data: null, extension: 'preserved' });
    } } });
  const service = new PeerMessageService(registry, {
    isConnected: () => true,
    async deliver(message) { received.push(message); }
  });

  const directory = await mkdtemp(join(tmpdir(), 'prepared-peer-message-'));
  let store = new AtomicJsonRecordStore<{ outbound: PeerMessage }, { ok: true }>(directory,
    (value): value is { outbound: PeerMessage } => Boolean(value && typeof value === 'object' && 'outbound' in value),
    (value): value is { ok: true } => Boolean(value && typeof value === 'object' && Reflect.get(value, 'ok') === true));
  try {
    const generic = await service.process(input, 'pserver');
    const prepared = await service.prepareForDurableDelivery(input, 'pserver');
    await store.create(createReliableRecord({ key: 'M13:persisted-transform-output', fingerprint: 'stable',
      createdAt: Date.now(), updatedAt: Date.now(), state: 'queued', attempts: 0,
      payload: { outbound: prepared }, ack: { ok: true } }));
    await store.close();
    store = new AtomicJsonRecordStore(directory,
      (value): value is { outbound: PeerMessage } => Boolean(value && typeof value === 'object' && 'outbound' in value),
      (value): value is { ok: true } => Boolean(value && typeof value === 'object' && Reflect.get(value, 'ok') === true));
    const persisted = await store.get('M13:persisted-transform-output');
    assert.ok(persisted);
    await service.deliverPreparedMessage(persisted.payload.outbound);

    assert.equal(generic.payload.version, '');
    assert.equal(generic.payload.data, null);
    assert.equal(Reflect.get(generic.payload, 'extension'), 'preserved');
    assert.equal(received.length, 2);
    assert.deepEqual(received.map(message => message.payload), [generic.payload, prepared.payload]);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
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

test('destination is rechecked after an asynchronous transformation', async () => {
  let connected = true;
  let delivered = false;
  const registry = new TransformationRegistry();
  registry.register({ id: 'async', from: '*', to: '*', payloadType: '*', priority: 1,
    transformer: { async transform(message) {
      await Promise.resolve();
      connected = false;
      return message.payload;
    } } });
  const service = new PeerMessageService(registry, {
    isConnected: () => connected,
    async deliver() { delivered = true; }
  });
  await assert.rejects(service.process(input, 'pserver'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
  assert.equal(delivered, false);
});

test('authenticated EServer instance is copied to source metadata', async () => {
  const service = new PeerMessageService(new TransformationRegistry(), {
    isConnected: () => true, async deliver() {}
  });
  const result = await service.process({ ...input, from: 'eserver', to: 'aab' }, 'eserver', 'instance-auth');
  assert.equal(result.sourceInstanceId, 'instance-auth');
});

test('local AAB messages still transform and receive processing metadata without delivery', async () => {
  const registry = new TransformationRegistry();
  registry.register({ id: 'local-transform', from: '*', to: 'aab', payloadType: '*', priority: 1,
    transformer: { transform(message) { return { ...message.payload, type: 'local.transformed' }; } } });
  let delivered = false;
  const service = new PeerMessageService(registry, {
    isConnected() { assert.fail('AAB is local and does not require destination availability'); },
    async deliver() { delivered = true; }
  });
  const result = await service.process({ ...input, to: 'aab' }, 'pserver');
  assert.equal(result.payload.type, 'local.transformed');
  assert.deepEqual(result.processing?.processedBy, ['local-transform']);
  assert.equal(result.processing?.transformed, true);
  assert.equal(typeof result.processing?.timestamp, 'number');
  assert.equal(delivered, false);
});

test('beforeDeliver runs after transformations and its errors retain delivery classification', async () => {
  const sequence: string[] = [];
  const registry = new TransformationRegistry();
  registry.register({ id: 'hook-order', from: '*', to: '*', payloadType: '*', priority: 1,
    transformer: { transform(message) { sequence.push('transform'); return message.payload; } } });
  const service = new PeerMessageService(registry, {
    isConnected: () => true,
    async beforeDeliver(message) {
      sequence.push(`before:${message.processing?.processedBy.join(',')}`);
      throw new Error('hook failed');
    },
    async deliver() { sequence.push('deliver'); }
  });
  await assert.rejects(service.process(input, 'pserver'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DELIVERY_FAILED' && error.message === 'hook failed');
  assert.deepEqual(sequence, ['transform', 'before:hook-order']);
});

test('transformer envelope mutations do not replace M10-owned message metadata', async () => {
  const registry = new TransformationRegistry();
  registry.register({ id: 'mutates-clone', from: '*', to: '*', payloadType: '*', priority: 1,
    transformer: { transform(message) {
      Object.assign(message, {
        id: '00000000-0000-4000-8000-000000000000', version: '9.0', kind: 'response',
        from: 'pserver', to: 'sserver', channel: 'changed', event: 'changed', timestamp: -1,
        sourceInstanceId: 'spoofed', correlationId: 'changed', causationId: 'changed'
      });
      return message.payload;
    } } });
  const service = new PeerMessageService(registry, {
    isConnected() { assert.fail('AAB is local'); }, async deliver() { assert.fail('AAB does not deliver'); }
  });
  const result = await service.process({
    ...input, id: '62e3e41d-438d-4a15-95b7-d63832f005f4', from: 'eserver', to: 'aab',
    correlationId: 'corr-original', causationId: 'cause-original', channel: 'worker', event: 'message'
  }, 'eserver', 'authenticated-instance');
  assert.equal(result.id, '62e3e41d-438d-4a15-95b7-d63832f005f4');
  assert.equal(result.version, '1.0');
  assert.equal(result.kind, 'request');
  assert.equal(result.from, 'eserver');
  assert.equal(result.to, 'aab');
  assert.equal(result.channel, 'worker');
  assert.equal(result.event, 'message');
  assert.equal(result.sourceInstanceId, 'authenticated-instance');
  assert.equal(result.correlationId, 'corr-original');
  assert.equal(result.causationId, 'cause-original');
  assert.ok(result.timestamp > 0);
});
