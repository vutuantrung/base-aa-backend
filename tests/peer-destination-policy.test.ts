import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PeerDestinationPolicy } from '../src/modules/peer-messaging/peer-destination-policy.js';
import { PeerMessageService, PeerMessageError, processPeerMessageForAck } from '../src/modules/peer-messaging/peer-message-service.js';
import { TransformationRegistry } from '../src/modules/peer-messaging/transformation-registry.js';
import type { PeerDirectoryCapabilities } from '../src/modules/peer-messaging/peer-destination-policy.js';
import { PeerDirectory, type PeerIdentity } from '../src/modules/peer-messaging/peer-directory.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';

const message = (to: 'eserver' | 'spa' | 'aa' | 'cdc' | 'as', extras: object = {}) => ({
  version: '1.0', kind: 'event', from: 'aa', to,
  payload: { type: 'test.message', version: '1.0', data: { value: true } }, ...extras
});

function setup(instances: PeerIdentity[] = []) {
  const peers = new Map<string, PeerIdentity>();
  for (const identity of instances) peers.set(identity.instanceId ?? identity.peerId, identity);
  const directory: PeerDirectoryCapabilities = {
    has(peerId, instanceId) {
      if (peerId === 'eserver') return instanceId ? peers.has(instanceId) : [...peers.values()].some(peer => peer.peerId === 'eserver');
      return peers.has(peerId);
    },
    lookup(peerId, instanceId) {
      if (peerId === 'eserver') return instanceId ? peers.get(instanceId) : [...peers.values()].find(peer => peer.peerId === 'eserver');
      return peers.get(peerId);
    },
    listInstances() { return [...peers.values()].filter(peer => peer.peerId === 'eserver'); }
  };
  const delivered: Array<{ peerId: string; connectionId: string; message: PeerMessage }> = [];
  const policy = new PeerDestinationPolicy(directory, {
    async deliver(peerId, connectionId, outbound) { delivered.push({ peerId, connectionId, message: outbound }); }
  });
  return { policy, delivered };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function createHeldTransformScenario(directory = new PeerDirectory()) {
  const delivered: Array<{ peerId: string; connectionId: string; message: PeerMessage }> = [];
  const policy = new PeerDestinationPolicy(directory, {
    async deliver(peerId, connectionId, outbound) { delivered.push({ peerId, connectionId, message: outbound }); }
  });
  const transformationResult = deferred<PeerMessage['payload']>();
  const transformStarted = deferred<void>();
  let transformCalled = false;
  const registry = new TransformationRegistry();
  registry.register({ id: 'hold-transform', from: '*', to: 'eserver', payloadType: '*', priority: 1,
    transformer: { async transform(message) {
      transformCalled = true;
      transformStarted.resolve(undefined);
      return transformationResult.promise;
    } } });
  return {
    service: new PeerMessageService(registry, policy),
    delivered,
    transformStarted: transformStarted.promise,
    releaseTransform: transformationResult.resolve,
    get transformCalled() { return transformCalled; }
  };
}

const transformedPayload = { type: 'test.transformed', version: '1.0', data: { value: 'transformed' } };

test('explicit EServer target and single-instance fallback use M06 identity capabilities', async () => {
  const first: PeerIdentity = { peerId: 'eserver', instanceId: 'worker-1', connectionId: 'socket-1' };
  const second: PeerIdentity = { peerId: 'eserver', instanceId: 'worker-2', connectionId: 'socket-2' };
  const multi = setup([first, second]);
  const service = new PeerMessageService(new TransformationRegistry(), multi.policy);
  await service.process(message('eserver', { toInstanceId: 'worker-2' }), 'aa');
  assert.deepEqual(multi.delivered.map(item => item.connectionId), ['socket-2']);

  const single = setup([first]);
  await new PeerMessageService(new TransformationRegistry(), single.policy).process(message('eserver'), 'aa');
  assert.deepEqual(single.delivered.map(item => item.connectionId), ['socket-1']);
});

test('ambiguous and missing EServer destinations preserve their error codes', async () => {
  const instances: PeerIdentity[] = [
    { peerId: 'eserver', instanceId: 'one', connectionId: 'socket-1' },
    { peerId: 'eserver', instanceId: 'two', connectionId: 'socket-2' }
  ];
  const ambiguous = new PeerMessageService(new TransformationRegistry(), setup(instances).policy);
  await assert.rejects(ambiguous.process(message('eserver'), 'aa'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'AMBIGUOUS_DESTINATION');
  const missing = new PeerMessageService(new TransformationRegistry(), setup().policy);
  await assert.rejects(missing.process(message('eserver', { toInstanceId: 'gone' }), 'aa'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
});

test('Cdc transport readiness and local AS delivery behavior are preserved', async () => {
  const { policy, delivered } = setup();
  const service = new PeerMessageService(new TransformationRegistry(), policy);
  await assert.rejects(service.process(message('cdc'), 'aa'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
  let ready = false;
  let cdcDeliveries = 0;
  policy.registerCdcTransport({ isConnected: () => ready, async deliver() { cdcDeliveries += 1; } });
  await assert.rejects(service.process(message('cdc'), 'aa'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
  ready = true;
  await service.process(message('cdc'), 'aa');
  const local = await service.process(message('as'), 'aa');
  assert.equal(local.to, 'as');
  assert.equal(cdcDeliveries, 1);
  assert.deepEqual(delivered, []);
});

test('generic processing maps to peer ACKs and preserves delivery failure classification', async () => {
  const rejecting = new PeerDestinationPolicy({
    has: () => true,
    lookup: () => ({ peerId: 'aa', connectionId: 'aa-1' }),
    listInstances: () => []
  }, { async deliver() { throw new Error('Destination aa rejected message'); } });
  const service = new PeerMessageService(new TransformationRegistry(), rejecting);
  const ack = await processPeerMessageForAck(service, message('aa'), 'aa');
  assert.deepEqual(ack, { ok: false, code: 'DELIVERY_FAILED', error: 'Destination aa rejected message' });

  const local = await processPeerMessageForAck(new PeerMessageService(new TransformationRegistry(), setup().policy), message('as'), 'aa');
  assert.equal(local.ok, true);
  if (local.ok) assert.equal('status' in local, false);
});

test('source instance passed by the authenticated connection is attached to the envelope', async () => {
  const { policy } = setup();
  const service = new PeerMessageService(new TransformationRegistry(), policy);
  const result = await service.process(message('as', { from: 'eserver' }), 'eserver', 'worker-authenticated');
  assert.equal(result.sourceInstanceId, 'worker-authenticated');
});

test('stable explicit EServer target delivers once with preserved outbound metadata', async () => {
  const directory = new PeerDirectory();
  directory.register('eserver', 'socket-old', 'worker-1');
  const scenario = createHeldTransformScenario(directory);
  const operation = processPeerMessageForAck(scenario.service, message('eserver', {
    id: '11111111-1111-4111-8111-111111111111', toInstanceId: 'worker-1'
  }), 'aa');
  await scenario.transformStarted;
  scenario.releaseTransform(transformedPayload);
  const acknowledgement = await operation;

  assert.equal(acknowledgement.ok, true);
  if (acknowledgement.ok) {
    assert.equal(acknowledgement.data.id, '11111111-1111-4111-8111-111111111111');
    assert.equal(acknowledgement.data.to, 'eserver');
    assert.equal(acknowledgement.data.toInstanceId, 'worker-1');
    assert.deepEqual(acknowledgement.data.payload, transformedPayload);
    assert.deepEqual(acknowledgement.data.processing?.processedBy, ['hold-transform']);
  }
  assert.equal(scenario.delivered.length, 1);
  assert.equal(scenario.delivered[0]?.connectionId, 'socket-old');
  assert.equal(scenario.delivered[0]?.message.toInstanceId, 'worker-1');
});

test('disconnect during held transform maps to DESTINATION_OFFLINE and sends nothing', async () => {
  const directory = new PeerDirectory();
  const original = directory.register('eserver', 'socket-old', 'worker-1');
  const scenario = createHeldTransformScenario(directory);
  const operation = processPeerMessageForAck(scenario.service, message('eserver', { toInstanceId: 'worker-1' }), 'aa');
  await scenario.transformStarted;
  assert.equal(directory.remove(original), true);
  scenario.releaseTransform(transformedPayload);
  const acknowledgement = await operation;

  assert.deepEqual(acknowledgement, {
    ok: false, code: 'DESTINATION_OFFLINE', error: 'Destination eserver is offline'
  });
  assert.deepEqual(scenario.delivered, []);
});

test('same logical EServer replacement is resolved to the latest physical connection', async () => {
  const directory = new PeerDirectory();
  const original = directory.register('eserver', 'socket-old', 'worker-1');
  const scenario = createHeldTransformScenario(directory);
  const operation = processPeerMessageForAck(scenario.service, message('eserver', {
    id: '22222222-2222-4222-8222-222222222222', toInstanceId: 'worker-1'
  }), 'aa');
  await scenario.transformStarted;
  assert.equal(directory.remove(original), true);
  directory.register('eserver', 'socket-new', 'worker-1');
  scenario.releaseTransform(transformedPayload);
  const acknowledgement = await operation;

  assert.equal(acknowledgement.ok, true);
  if (acknowledgement.ok) {
    assert.equal(acknowledgement.data.id, '22222222-2222-4222-8222-222222222222');
    assert.equal(acknowledgement.data.toInstanceId, 'worker-1');
  }
  assert.equal(scenario.delivered.length, 1);
  assert.equal(scenario.delivered[0]?.connectionId, 'socket-new');
  assert.equal(scenario.delivered[0]?.message.toInstanceId, 'worker-1');
});

test('untargeted EServer remains bound to its initial sole instance when topology becomes ambiguous', async () => {
  const directory = new PeerDirectory();
  directory.register('eserver', 'socket-one', 'worker-1');
  const scenario = createHeldTransformScenario(directory);
  const operation = processPeerMessageForAck(scenario.service, message('eserver'), 'aa');
  await scenario.transformStarted;
  directory.register('eserver', 'socket-two', 'worker-2');
  scenario.releaseTransform(transformedPayload);
  const acknowledgement = await operation;

  assert.equal(acknowledgement.ok, true);
  assert.equal(scenario.delivered.length, 1);
  assert.equal(scenario.delivered[0]?.connectionId, 'socket-one');
  assert.equal('toInstanceId' in (scenario.delivered[0]?.message ?? {}), false);
  if (acknowledgement.ok) assert.equal('toInstanceId' in acknowledgement.data, false);
});

test('untargeted message does not retarget when its bound instance is replaced by another sole instance', async () => {
  const directory = new PeerDirectory();
  const original = directory.register('eserver', 'socket-old', 'worker-1');
  const scenario = createHeldTransformScenario(directory);
  const originalError = console.error;
  console.error = () => {};
  try {
    const operation = processPeerMessageForAck(scenario.service, message('eserver'), 'aa');
    await scenario.transformStarted;
    assert.equal(directory.remove(original), true);
    directory.register('eserver', 'socket-new', 'worker-2');
    scenario.releaseTransform(transformedPayload);
    const acknowledgement = await operation;

    assert.deepEqual(acknowledgement, {
      ok: false, code: 'DESTINATION_OFFLINE', error: 'Destination eserver is offline'
    });
    assert.deepEqual(scenario.delivered, []);
  } finally {
    console.error = originalError;
  }
});

test('process reports a bound instance replacement as DESTINATION_OFFLINE', async () => {
  const directory = new PeerDirectory();
  const original = directory.register('eserver', 'socket-old', 'worker-1');
  const scenario = createHeldTransformScenario(directory);
  const operation = scenario.service.process(message('eserver'), 'aa');
  await scenario.transformStarted;
  assert.equal(directory.remove(original), true);
  directory.register('eserver', 'socket-new', 'worker-2');
  scenario.releaseTransform(transformedPayload);

  await assert.rejects(operation, (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
  assert.deepEqual(scenario.delivered, []);
});

test('untargeted message keeps the original envelope when its bound instance reconnects on a new socket', async () => {
  const directory = new PeerDirectory();
  const original = directory.register('eserver', 'socket-old', 'worker-1');
  const scenario = createHeldTransformScenario(directory);
  const operation = processPeerMessageForAck(scenario.service, message('eserver', {
    id: '33333333-3333-4333-8333-333333333333'
  }), 'aa');
  await scenario.transformStarted;
  assert.equal(directory.remove(original), true);
  directory.register('eserver', 'socket-new', 'worker-1');
  scenario.releaseTransform(transformedPayload);
  const acknowledgement = await operation;

  assert.equal(acknowledgement.ok, true);
  assert.equal(scenario.delivered.length, 1);
  assert.equal(scenario.delivered[0]?.connectionId, 'socket-new');
  assert.equal(scenario.delivered[0]?.message.id, '33333333-3333-4333-8333-333333333333');
  assert.equal('toInstanceId' in (scenario.delivered[0]?.message ?? {}), false);
  if (acknowledgement.ok) {
    assert.equal(acknowledgement.data.id, '33333333-3333-4333-8333-333333333333');
    assert.equal('toInstanceId' in acknowledgement.data, false);
  }
});

test('ambiguous or offline untargeted destination fails before transformation', async () => {
  const alreadyAmbiguous = new PeerDirectory();
  alreadyAmbiguous.register('eserver', 'socket-one', 'worker-1');
  alreadyAmbiguous.register('eserver', 'socket-two', 'worker-2');
  const beforeTransform = createHeldTransformScenario(alreadyAmbiguous);
  let acknowledgement: Awaited<ReturnType<typeof processPeerMessageForAck>> | undefined;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    acknowledgement = await processPeerMessageForAck(beforeTransform.service, message('eserver'), 'aa');
  } finally {
    console.error = originalConsoleError;
  }
  assert.deepEqual(acknowledgement, {
    ok: false,
    code: 'AMBIGUOUS_DESTINATION',
    error: 'Multiple EServer instances connected; toInstanceId is required'
  });
  assert.equal(beforeTransform.transformCalled, false);
  assert.deepEqual(beforeTransform.delivered, []);

  const offline = createHeldTransformScenario(new PeerDirectory());
  const originalError = console.error;
  console.error = () => {};
  try {
    const offlineAck = await processPeerMessageForAck(offline.service, message('eserver'), 'aa');
    assert.deepEqual(offlineAck, {
      ok: false, code: 'DESTINATION_OFFLINE', error: 'Destination eserver is offline'
    });
    assert.equal(offline.transformCalled, false);
    assert.deepEqual(offline.delivered, []);
  } finally {
    console.error = originalError;
  }
});

test('actual socket delivery rejection remains DELIVERY_FAILED', async () => {
  const directory = new PeerDirectory();
  directory.register('eserver', 'socket-one', 'worker-1');
  const policy = new PeerDestinationPolicy(directory, {
    async deliver() { throw new Error('socket write failed'); }
  });
  const service = new PeerMessageService(new TransformationRegistry(), policy);
  const originalError = console.error;
  console.error = () => {};
  try {
    const acknowledgement = await processPeerMessageForAck(service, message('eserver', {
      toInstanceId: 'worker-1'
    }), 'aa');
    assert.deepEqual(acknowledgement, {
      ok: false, code: 'DELIVERY_FAILED', error: 'socket write failed'
    });
  } finally {
    console.error = originalError;
  }
});

test('check-to-send socket failure remains DELIVERY_FAILED if identity disappears after lookup', async () => {
  const directory = new PeerDirectory();
  const original = directory.register('eserver', 'socket-one', 'worker-1');
  const policy = new PeerDestinationPolicy(directory, {
    async deliver(_peerId, _connectionId, outbound) {
      assert.equal(outbound.toInstanceId, 'worker-1');
      assert.equal(directory.remove(original), true);
      throw new Error('socket disconnected during send');
    }
  });
  const service = new PeerMessageService(new TransformationRegistry(), policy);
  const originalError = console.error;
  console.error = () => {};
  try {
    const acknowledgement = await processPeerMessageForAck(service, message('eserver', {
      toInstanceId: 'worker-1'
    }), 'aa');
    assert.deepEqual(acknowledgement, {
      ok: false, code: 'DELIVERY_FAILED', error: 'socket disconnected during send'
    });
  } finally {
    console.error = originalError;
  }
});
