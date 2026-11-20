import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendResourceSelectionSnapshot, type ResourceSelectionSnapshotConnection } from '../src/infrastructure/socket/resource-selection-snapshot.js';
import type { ResourceSelectionSnapshot } from '../src/modules/resource-selection/resource-selection-workflow.js';

function connection() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const target: ResourceSelectionSnapshotConnection = {
    connected: true,
    emit(event, payload) { emitted.push({ event, payload }); }
  };
  return { target, emitted };
}

const snapshot: ResourceSelectionSnapshot = { records: [], timestamp: 100 };

test('selection snapshot checks identity before querying and emits M13 projection unchanged', async () => {
  const { target, emitted } = connection();
  let current = false;
  let queries = 0;
  await sendResourceSelectionSnapshot(target, () => current, {
    async createSnapshot() { queries += 1; return snapshot; }
  });
  assert.equal(queries, 0);

  current = true;
  await sendResourceSelectionSnapshot(target, () => current, {
    async createSnapshot() { queries += 1; return snapshot; }
  });
  assert.equal(queries, 1);
  assert.deepEqual(emitted, [{ event: 'resource-selection:snapshot', payload: snapshot }]);
});

test('selection snapshot success is suppressed for disconnected or replaced requesting AAUI', async () => {
  for (const disconnected of [false, true]) {
    const { target, emitted } = connection();
    let current = true;
    let release: ((value: ResourceSelectionSnapshot) => void) | undefined;
    const pending = sendResourceSelectionSnapshot(target, () => current, {
      createSnapshot: () => new Promise(resolve => { release = resolve; })
    });
    current = false;
    if (disconnected) Object.defineProperty(target, 'connected', { value: false });
    release?.(snapshot);
    await pending;
    assert.deepEqual(emitted, []);
  }
});

test('selection snapshot failure fallback is exact and stale requests receive no fallback', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const stale = connection();
    let current = true;
    let fail: ((error: Error) => void) | undefined;
    const pending = sendResourceSelectionSnapshot(stale.target, () => current, {
      createSnapshot: () => new Promise((_resolve, reject) => { fail = reject; })
    });
    current = false;
    fail?.(new Error('read failed'));
    await pending;
    assert.deepEqual(stale.emitted, []);

    const active = connection();
    await sendResourceSelectionSnapshot(active.target, () => true, {
      async createSnapshot() { throw new Error('read failed'); }
    });
    assert.equal(active.emitted[0]?.event, 'resource-selection:snapshot');
    const payload = active.emitted[0]?.payload;
    assert.ok(payload && typeof payload === 'object');
    assert.deepEqual(Reflect.get(payload, 'records'), []);
    assert.equal(Reflect.get(payload, 'error'), 'Could not load saved selections');
    assert.equal(typeof Reflect.get(payload, 'timestamp'), 'number');
  } finally {
    console.error = originalError;
  }
});
