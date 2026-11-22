import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApplicationCoordinator, MonotonicDeadline } from '../src/app/application-coordinator.js';
import { MessageRouter } from '../src/modules/messaging/message-router.js';
import { RouteRegistry } from '../src/modules/messaging/route-registry.js';
import { processAdmittedPeerMessage } from '../src/infrastructure/socket/peer-gateway.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('admission cutoff rejects new roots while nested admitted calls may finish', async () => {
  const coordinator = new ApplicationCoordinator();
  const release = deferred();
  const releaseNested = deferred();
  const nestedStarted = deferred();
  let nested = false;
  const admitted = coordinator.run('http', async () => {
    const nestedWork = coordinator.run('generic', async () => {
      nestedStarted.resolve();
      await releaseNested.promise;
      nested = true;
    });
    await release.promise;
    await nestedWork;
  });
  await nestedStarted.promise;
  coordinator.beginDrain();
  await assert.rejects(coordinator.run('generic', () => undefined), /APPLICATION_DRAINING/);
  release.resolve();
  await Promise.resolve();
  assert.equal(coordinator.counts().generic, 1);
  releaseNested.resolve();
  await admitted;
  assert.equal(nested, true);
  assert.deepEqual(coordinator.counts(), { http: 0, socket: 0, peer: 0, generic: 0, snapshot: 0 });
});

test('expired async context cannot detach work past cutoff', async () => {
  const coordinator = new ApplicationCoordinator();
  let detached!: () => Promise<void>;
  await coordinator.run('socket', async () => {
    detached = () => coordinator.run('generic', () => undefined);
  });
  coordinator.beginDrain();
  await assert.rejects(detached(), /APPLICATION_DRAINING/);
});

test('detached nested admitted work remains part of coordinator idle tracking', async () => {
  const coordinator = new ApplicationCoordinator();
  const nestedStarted = deferred();
  const releaseNested = deferred();
  let nested!: Promise<void>;
  await coordinator.run('http', async () => {
    nested = coordinator.run('generic', async () => {
      nestedStarted.resolve();
      await releaseNested.promise;
    });
    await nestedStarted.promise;
  });
  const idle = coordinator.waitForIdle();
  let idleResolved = false;
  void idle.then(() => { idleResolved = true; });
  await Promise.resolve();
  assert.equal(idleResolved, false);
  releaseNested.resolve();
  await Promise.all([idle, nested]);
});

test('detached async descendants cannot use nested admission as a post-cutoff capability', async () => {
  const coordinator = new ApplicationCoordinator();
  let detached!: () => Promise<void>;
  await coordinator.run('http', async () => {
    detached = () => coordinator.runAdmitted('generic', () => undefined);
  });
  coordinator.beginDrain();
  await assert.rejects(detached(), /APPLICATION_DRAINING/);
});

test('M09 keeps fail-fast public rejection and tracks already-started sibling branches', async () => {
  const coordinator = new ApplicationCoordinator();
  const branchStarted = deferred();
  const releaseBranch = deferred();
  const router = new MessageRouter(new RouteRegistry([
    { id: 'routes', source: 'worker', event: '*', destinations: [{ transport: 'http', endpointId: 'a' }, { transport: 'socket', channel: 'worker' }] }
  ]), [
    { transport: 'http', async deliver() { throw new Error('first branch failed'); } },
    { transport: 'socket', async deliver() { branchStarted.resolve(); await releaseBranch.promise; } }
  ], coordinator);
  await assert.rejects(router.publish({ channel: 'worker', event: 'sample', payload: 1 }), /first branch failed/);
  await branchStarted.promise;
  assert.equal(coordinator.counts().generic, 1);
  const idle = coordinator.waitForIdle();
  releaseBranch.resolve();
  await idle;
  assert.equal(coordinator.counts().generic, 0);
});

test('monotonic deadline uses one captured start and injected clock', () => {
  let now = 100;
  const deadline = new MonotonicDeadline(150, () => now);
  now = 225;
  assert.equal(deadline.remainingMs(), 25);
  now = 500;
  assert.equal(deadline.remainingMs(), 0);
});

test('peer ACK callback remains inside admission tracking and cutoff uses existing DELIVERY_FAILED code', async () => {
  const coordinator = new ApplicationCoordinator();
  const operationStarted = deferred();
  const releaseOperation = deferred();
  let acknowledgements: unknown[] = [];
  let processingCalls = 0;
  const first = processAdmittedPeerMessage(coordinator, { id: 1 }, 'eserver', 'worker-one', async () => {
    processingCalls += 1;
    operationStarted.resolve();
    await releaseOperation.promise;
    return { ok: false, code: 'DELIVERY_FAILED', error: 'peer fake' };
  }, ack => { acknowledgements.push(ack); });
  await operationStarted.promise;
  coordinator.beginDrain();
  await processAdmittedPeerMessage(coordinator, { id: 2 }, 'eserver', 'worker-two', async () => {
    processingCalls += 1;
    return { ok: false, code: 'DELIVERY_FAILED', error: 'peer fake' };
  }, ack => { acknowledgements.push(ack); });
  assert.deepEqual(acknowledgements, [{ ok: false, code: 'DELIVERY_FAILED', error: 'APPLICATION_DRAINING' }]);
  assert.equal(coordinator.counts().peer, 1);
  releaseOperation.resolve();
  await first;
  assert.equal(acknowledgements.length, 2);
  assert.equal(processingCalls, 1);
  assert.equal(coordinator.counts().peer, 0);
});
