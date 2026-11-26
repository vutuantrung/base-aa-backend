import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendTaskHistorySnapshot, type TaskHistoryConnection } from '../src/infrastructure/socket/task-history-snapshot.js';
import type { TaskHistorySnapshot } from '../src/modules/task-workflow/task-workflow.js';

function connection() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const target: TaskHistoryConnection = {
    connected: true,
    emit(event, payload) { emitted.push({ event, payload }); }
  };
  return { target, emitted };
}

const snapshot: TaskHistorySnapshot = { timestamp: 10, tasks: [] };

test('snapshot adapter guards before lookup and delivers successful projection to the original current connection', async () => {
  const { target, emitted } = connection();
  let current = false;
  let queried = false;
  await sendTaskHistorySnapshot(target, () => current, {
    async createHistorySnapshot() { queried = true; return snapshot; }
  });
  assert.equal(queried, false);
  assert.deepEqual(emitted, []);

  current = true;
  await sendTaskHistorySnapshot(target, () => current, {
    async createHistorySnapshot() { return snapshot; }
  });
  assert.deepEqual(emitted, [{ event: 'task:lifecycle:snapshot', payload: snapshot }]);
});

test('snapshot success is not delivered to a disconnected or replaced Aa after async history read', async () => {
  for (const replacement of ['disconnected', 'replaced']) {
    const { target, emitted } = connection();
    let current = true;
    let release: ((value: TaskHistorySnapshot) => void) | undefined;
    const pending = sendTaskHistorySnapshot(target, () => current, {
      createHistorySnapshot: () => new Promise(resolve => { release = resolve; })
    });
    current = false;
    if (replacement === 'disconnected') Object.defineProperty(target, 'connected', { value: false });
    release?.(snapshot);
    await pending;
    assert.deepEqual(emitted, []);
  }
});

test('snapshot failure fallback is delivered only while the requesting Aa remains current', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const stale = connection();
    let current = true;
    let fail: ((error: Error) => void) | undefined;
    const pending = sendTaskHistorySnapshot(stale.target, () => current, {
      createHistorySnapshot: () => new Promise((_resolve, reject) => { fail = reject; })
    });
    current = false;
    fail?.(new Error('read failed'));
    await pending;
    assert.deepEqual(stale.emitted, []);

    const active = connection();
    await sendTaskHistorySnapshot(active.target, () => true, {
      async createHistorySnapshot() { throw new Error('read failed'); }
    });
    assert.equal(active.emitted[0]?.event, 'task:lifecycle:snapshot');
    const fallback = active.emitted[0]?.payload;
    assert.ok(fallback && typeof fallback === 'object');
    assert.deepEqual(Reflect.get(fallback, 'tasks'), []);
    assert.equal(Reflect.get(fallback, 'error'), 'Unable to load persisted task history');
    assert.equal(typeof Reflect.get(fallback, 'timestamp'), 'number');
  } finally {
    console.error = originalError;
  }
});
