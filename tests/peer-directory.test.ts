import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DuplicatePeerIdentityError, PeerDirectory } from '../src/modules/peer-messaging/peer-directory.js';

test('directory registers multiple EServer instances and keeps the default identity', () => {
  const directory = new PeerDirectory();
  const defaultInstance = directory.register('eserver', 'socket-default');
  const secondInstance = directory.register('eserver', 'socket-two', 'worker-two');
  assert.equal(defaultInstance.instanceId, 'default');
  assert.equal(directory.lookup('eserver', 'default')?.connectionId, 'socket-default');
  assert.equal(directory.lookup('eserver', 'worker-two'), secondInstance);
  assert.equal(directory.lookup('eserver'), undefined);
  assert.equal(directory.listInstances('eserver').length, 2);
});

test('directory rejects duplicate EServer instances and duplicate SServer/AAUI identities', () => {
  const directory = new PeerDirectory();
  directory.register('eserver', 'first', 'same');
  directory.register('sserver', 'status-one');
  directory.register('aaui', 'ui-one');
  assert.throws(() => directory.register('eserver', 'second', 'same'), DuplicatePeerIdentityError);
  assert.throws(() => directory.register('sserver', 'status-two'), { message: 'peer already connected' });
  assert.throws(() => directory.register('aaui', 'ui-two'), { message: 'peer already connected' });
});

test('directory lookup, presence and removal follow the current connection identity', () => {
  const directory = new PeerDirectory();
  const first = directory.register('eserver', 'socket-1', 'worker-1');
  directory.register('eserver', 'socket-2', 'worker-2');
  assert.equal(directory.lookupConnection('socket-1'), first);
  assert.equal(directory.has('eserver'), true);
  assert.equal(directory.has('eserver', 'missing'), false);
  const snapshot = directory.presenceSnapshot();
  assert.deepEqual(snapshot.instances.map(instance => [instance.instanceId, instance.socketId, instance.status]), [
    ['worker-1', 'socket-1', 'online'], ['worker-2', 'socket-2', 'online']
  ]);

  assert.equal(directory.remove({ ...first, connectionId: 'replaced-socket' }), false);
  assert.equal(directory.lookup('eserver', 'worker-1')?.connectionId, 'socket-1');
  assert.equal(directory.remove(first), true);
  assert.equal(directory.lookup('eserver', 'worker-1'), undefined);
});

test('directory enforces single-peer registration and removal without Socket.IO state', () => {
  const first = new PeerDirectory();
  const second = new PeerDirectory();
  const identity = first.register('aaui', 'ui-connection');
  first.register('sserver', 'status-connection');
  assert.equal(first.lookup('aaui'), identity);
  assert.equal(first.lookup('sserver')?.connectionId, 'status-connection');
  assert.equal(second.lookup('aaui'), undefined);
  assert.equal(second.lookup('sserver'), undefined);
  assert.equal(first.remove(identity), true);
  assert.equal(first.lookup('aaui'), undefined);
});
