import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { ApplicationCoordinator } from '../src/app/application-coordinator.js';
import { ApplicationShutdownTimeoutError } from '../src/app/create-app.js';
import { testRollbackAfterStartupFailure, testCloseFailedStartup, testStartApplicationResources } from '../src/app/lifecycle-test-seam.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 2000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

test('activation failure after HTTP bind retains resources until peer and admitted work settle', async () => {
  const coordinator = new ApplicationCoordinator();
  const httpServer = createServer();
  const admittedEntered = deferred();
  const releaseAdmitted = deferred();
  const peerDrainEntered = deferred();
  const releasePeerDrain = deferred();
  const originalStartupError = new Error('injected activation failure after bind');
  let peerDraining = false;
  let peerClosed = false;
  let httpClosed = false;
  const admitted = coordinator.run('http', async () => {
    admittedEntered.resolve();
    await releaseAdmitted.promise;
  });
  await withTimeout(admittedEntered.promise, 'admitted operation did not start before startup');
  const peer = {
    async start() {},
    async activate() {
      assert.equal(httpServer.listening, true, 'activation must fail only after HTTP bind');
      throw originalStartupError;
    },
    beginDrain() { peerDraining = true; },
    async waitForIdle() { peerDrainEntered.resolve(); await releasePeerDrain.promise; },
    workCounts() { return { task: { pending: 0, active: 1, executing: 1, slotWaiters: 0 }, selection: { pending: 0, active: 0, executing: 0, slotWaiters: 0 } }; },
    async close() { peerClosed = true; }
  };
  const cleanup = async () => {
    assert.equal(peerClosed, true, 'peer transport must close before HTTP resources');
    await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
    httpClosed = true;
  };
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const startup = testStartApplicationResources(0, httpServer, peer, undefined,
      () => true, () => coordinator.setReady(), () => undefined).catch(async error => {
      try { await testRollbackAfterStartupFailure(1000, coordinator, peer, cleanup); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'startup and rollback failed', { cause: error }); }
      throw error;
    });
    await withTimeout(peerDrainEntered.promise, 'startup rollback did not begin peer drain');
    assert.equal(peerDraining, true);
    assert.equal(httpServer.listening, true, 'HTTP listener remains bound during rollback settlement');
    await assert.rejects(coordinator.run('peer', () => undefined), /APPLICATION_DRAINING/);
    releasePeerDrain.resolve();
    await Promise.resolve();
    assert.equal(httpServer.listening, true, 'active admitted work retains HTTP resources');
    assert.equal(httpClosed, false);
    releaseAdmitted.resolve();
    await assert.rejects(startup, error => error === originalStartupError);
    await admitted;
    assert.equal(peerClosed, true);
    assert.equal(httpClosed, true);
  } finally {
    releasePeerDrain.resolve();
    releaseAdmitted.resolve();
    clearInterval(keepAlive);
    if (httpServer.listening) await new Promise<void>(resolve => httpServer.close(() => resolve()));
  }
});

test('post-bind startup rollback fences roots and waits for peer runner and admitted operation before cleanup', async () => {
  const coordinator = new ApplicationCoordinator();
  const admittedEntered = deferred();
  const releaseAdmitted = deferred();
  const peerEntered = deferred();
  const releasePeer = deferred();
  let peerDraining = false;
  let cleanupStarted = false;
  let httpBound = true;
  let socketClosed = false;
  let sqliteClosed = false;
  const originalStartupError = new Error('injected activation failure after HTTP bind');
  const startupOperation = coordinator.run('http', async () => {
    admittedEntered.resolve();
    await releaseAdmitted.promise;
  });
  await admittedEntered.promise;
  const peer = {
    beginDrain() { peerDraining = true; },
    async waitForIdle() { peerEntered.resolve(); await releasePeer.promise; },
    async close() { await releasePeer.promise; socketClosed = true; },
    workCounts() { return { task: { pending: 0, active: 1, executing: 1, slotWaiters: 0 }, selection: { pending: 0, active: 0, executing: 0, slotWaiters: 0 } }; }
  };
  const cleanup = async () => {
    cleanupStarted = true;
    assert.equal(peerDraining, true);
    assert.equal(httpBound, true);
    assert.equal(socketClosed, true, 'peer transport closes before dependent resources');
    assert.equal(sqliteClosed, false);
    httpBound = false;
    sqliteClosed = true;
  };
  const startupPromise = Promise.reject<number>(originalStartupError);
  const rollback = startupPromise.catch(async error => {
    try { await testRollbackAfterStartupFailure(1000, coordinator, peer, cleanup); }
    catch (cleanupError) { throw new AggregateError([error, cleanupError], 'startup and rollback failed', { cause: error }); }
    throw error;
  });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await peerEntered.promise;
    assert.equal(peerDraining, true);
    assert.equal(cleanupStarted, false);
    await assert.rejects(coordinator.run('peer', () => undefined), /APPLICATION_DRAINING/);
    releasePeer.resolve();
    await Promise.resolve();
    assert.equal(cleanupStarted, false, 'active admitted operation still retains resources');
    releaseAdmitted.resolve();
    await assert.rejects(rollback, error => error === originalStartupError);
    await startupOperation;
    assert.equal(cleanupStarted, true);
    assert.equal(socketClosed, true);
    assert.equal(httpBound, false);
    assert.equal(sqliteClosed, true);
  } finally {
    releasePeer.resolve();
    releaseAdmitted.resolve();
    clearInterval(keepAlive);
  }
});

test('rollback timeout rejects failed-state close until startup rollback promise settles', async () => {
  const coordinator = new ApplicationCoordinator();
  const active = deferred();
  const release = deferred();
  const entered = deferred();
  let cleanupStarted = false;
  let peerDraining = false;
  const admitted = coordinator.run('peer', async () => { entered.resolve(); await release.promise; active.resolve(); });
  await entered.promise;
  const peer = {
    beginDrain() { peerDraining = true; },
    async waitForIdle() {},
    async close() {},
    workCounts() { return { task: { pending: 0, active: 0, executing: 0, slotWaiters: 0 }, selection: { pending: 0, active: 0, executing: 0, slotWaiters: 0 } }; }
  };
  const startupFailure = new Error('activation failed');
  const startupPromise = Promise.reject<number>(startupFailure).catch(async error => {
    await testRollbackAfterStartupFailure(20, coordinator, peer, async () => { cleanupStarted = true; });
    throw error;
  });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    const rollbackError = await startupPromise.catch(error => error);
    assert.ok(rollbackError instanceof ApplicationShutdownTimeoutError);
    assert.equal(peerDraining, true);
    assert.equal(cleanupStarted, false);
    await assert.rejects(testCloseFailedStartup(startupPromise, undefined), error => error === rollbackError,
      'failed-state close must repeat rollback timeout instead of resolving successfully');
    release.resolve();
    await Promise.all([admitted, active.promise]);
    await withTimeout(startupPromise.then(() => undefined, () => undefined), 'startup rollback did not settle after active work released');
    assert.equal(cleanupStarted, true, 'rollback performs dependency cleanup after active work safely settles');
  } finally {
    release.resolve();
    clearInterval(keepAlive);
  }
});
