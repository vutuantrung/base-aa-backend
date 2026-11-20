import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PeerDestinationPolicy } from '../src/modules/peer-messaging/peer-destination-policy.js';
import { PeerMessageService, PeerMessageError, processPeerMessageForAck } from '../src/modules/peer-messaging/peer-message-service.js';
import { TransformationRegistry } from '../src/modules/peer-messaging/transformation-registry.js';
import type { PeerDirectoryCapabilities } from '../src/modules/peer-messaging/peer-destination-policy.js';
import type { PeerIdentity } from '../src/modules/peer-messaging/peer-directory.js';
import type { PeerMessage } from '../src/modules/peer-messaging/contracts.js';

const message = (to: 'eserver' | 'sserver' | 'aaui' | 'pserver' | 'aab', extras: object = {}) => ({
  version: '1.0', kind: 'event', from: 'aaui', to,
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

test('explicit EServer target and single-instance fallback use M06 identity capabilities', async () => {
  const first: PeerIdentity = { peerId: 'eserver', instanceId: 'worker-1', connectionId: 'socket-1' };
  const second: PeerIdentity = { peerId: 'eserver', instanceId: 'worker-2', connectionId: 'socket-2' };
  const multi = setup([first, second]);
  const service = new PeerMessageService(new TransformationRegistry(), multi.policy);
  await service.process(message('eserver', { toInstanceId: 'worker-2' }), 'aaui');
  assert.deepEqual(multi.delivered.map(item => item.connectionId), ['socket-2']);

  const single = setup([first]);
  await new PeerMessageService(new TransformationRegistry(), single.policy).process(message('eserver'), 'aaui');
  assert.deepEqual(single.delivered.map(item => item.connectionId), ['socket-1']);
});

test('ambiguous and missing EServer destinations preserve their error codes', async () => {
  const instances: PeerIdentity[] = [
    { peerId: 'eserver', instanceId: 'one', connectionId: 'socket-1' },
    { peerId: 'eserver', instanceId: 'two', connectionId: 'socket-2' }
  ];
  const ambiguous = new PeerMessageService(new TransformationRegistry(), setup(instances).policy);
  await assert.rejects(ambiguous.process(message('eserver'), 'aaui'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'AMBIGUOUS_DESTINATION');
  const missing = new PeerMessageService(new TransformationRegistry(), setup().policy);
  await assert.rejects(missing.process(message('eserver', { toInstanceId: 'gone' }), 'aaui'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
});

test('PServer transport readiness and local AAB delivery behavior are preserved', async () => {
  const { policy, delivered } = setup();
  const service = new PeerMessageService(new TransformationRegistry(), policy);
  await assert.rejects(service.process(message('pserver'), 'aaui'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
  let ready = false;
  let pserverDeliveries = 0;
  policy.registerPServerTransport({ isConnected: () => ready, async deliver() { pserverDeliveries += 1; } });
  await assert.rejects(service.process(message('pserver'), 'aaui'), (error: unknown) =>
    error instanceof PeerMessageError && error.code === 'DESTINATION_OFFLINE');
  ready = true;
  await service.process(message('pserver'), 'aaui');
  const local = await service.process(message('aab'), 'aaui');
  assert.equal(local.to, 'aab');
  assert.equal(pserverDeliveries, 1);
  assert.deepEqual(delivered, []);
});

test('generic processing maps to peer ACKs and preserves delivery failure classification', async () => {
  const rejecting = new PeerDestinationPolicy({
    has: () => true,
    lookup: () => ({ peerId: 'aaui', connectionId: 'aaui-1' }),
    listInstances: () => []
  }, { async deliver() { throw new Error('Destination aaui rejected message'); } });
  const service = new PeerMessageService(new TransformationRegistry(), rejecting);
  const ack = await processPeerMessageForAck(service, message('aaui'), 'aaui');
  assert.deepEqual(ack, { ok: false, code: 'DELIVERY_FAILED', error: 'Destination aaui rejected message' });

  const local = await processPeerMessageForAck(new PeerMessageService(new TransformationRegistry(), setup().policy), message('aab'), 'aaui');
  assert.equal(local.ok, true);
  if (local.ok) assert.equal('status' in local, false);
});

test('source instance passed by the authenticated connection is attached to the envelope', async () => {
  const { policy } = setup();
  const service = new PeerMessageService(new TransformationRegistry(), policy);
  const result = await service.process(message('aab', { from: 'eserver' }), 'eserver', 'worker-authenticated');
  assert.equal(result.sourceInstanceId, 'worker-authenticated');
});
