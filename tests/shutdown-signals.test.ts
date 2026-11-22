import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { installShutdownSignalHandlers } from '../src/app/shutdown-signals.js';
import type { ApplicationInstance } from '../src/app/create-app.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('first startup-time signal closes the created app and second signal requests nonzero entrypoint exit', async () => {
  const signals = new EventEmitter();
  const releaseClose = deferred();
  const exitCodes: number[] = [];
  let closeCalls = 0;
  const app = { close: async () => { closeCalls += 1; await releaseClose.promise; } } as ApplicationInstance;
  const diagnostics = { info() {}, error() {} };
  const controller = installShutdownSignalHandlers(signals, value => value.close(), code => exitCodes.push(code), diagnostics);
  signals.emit('SIGTERM');
  assert.equal(controller.isStopping(), true);
  controller.setApplication(app);
  signals.emit('SIGINT');
  assert.deepEqual(exitCodes, [1]);
  assert.equal(closeCalls, 1);
  releaseClose.resolve();
  await controller.waitForShutdown();
  assert.deepEqual(exitCodes, [1, 0]);
  controller.dispose();
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.equal(signals.listenerCount('SIGTERM'), 0);
});

test('running signal closes once; shutdown failure selects exit code one and logs safely', async () => {
  const signals = new EventEmitter();
  const exitCodes: number[] = [];
  const logged: unknown[] = [];
  const app = { close: async () => { throw new Error('bounded close failed'); } } as unknown as ApplicationInstance;
  const controller = installShutdownSignalHandlers(signals, value => value.close(), code => exitCodes.push(code), {
    info() {}, error: (_message, error) => logged.push(error)
  });
  controller.setApplication(app);
  signals.emit('SIGINT');
  await assert.rejects(controller.waitForShutdown(), /bounded close failed/);
  assert.deepEqual(exitCodes, [1]);
  assert.equal(logged.length, 1);
  controller.dispose();
});
