import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { JsonTaskFileStore } from '../src/modules/peer-messaging/task-file-store.js';

test('persisted tasks appear in Aa snapshot after Aa connects late', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'as-history-'));
  const old = process.env.AS_TASK_STORE_DIR;
  process.env.AS_TASK_STORE_DIR = directory;
  let app: ReturnType<typeof createApplication> | undefined;
  try {
    const store = new JsonTaskFileStore(directory);
    const task = {
      id: 'task-' + randomUUID(), status: 'inProgress' as const,
      config: 'from-curl', createdTime: Date.now(), updatedTime: Date.now()
    };
    await store.save(task);
    assert.deepEqual(await store.listRecent(), [task]);

    app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
    const port = await app.listen(0);
    const aa = io(`http://127.0.0.1:${port}/peers`, {
      transports: ['websocket'], reconnection: false, auth: { peerId: 'aa' }
    });
    try {
      const snapshot = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Aa snapshot missing')), 3000);
        aa.once('task:lifecycle:snapshot', value => {
          clearTimeout(timeout);
          resolve(value);
        });
        aa.once('connect_error', reject);
      });
      const received = await snapshot;
      assert.equal(received.error, undefined);
      assert.ok(received.tasks.some((entry: any) =>
        entry.task.id === task.id && entry.status === 'received'));
      // UI can recover the same task again without restarting Electron.
      const replay = new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Manual refresh snapshot missing')), 3000);
        aa.once('task:lifecycle:snapshot', value => {
          clearTimeout(timeout);
          resolve(value);
        });
      });
      aa.emit('task:lifecycle:refresh');
      const refreshed = await replay;
      assert.ok(refreshed.tasks.some((entry: any) => entry.task.id === task.id));
    } finally {
      aa.disconnect();
    }

    const finished = { ...task, status: 'finished' as const, updatedTime: task.updatedTime + 5000 };
    await store.saveResult(finished);
    assert.deepEqual(await store.listRecent(), [finished]);
  } finally {
    if (app) await app.close();
    if (old === undefined) delete process.env.AS_TASK_STORE_DIR;
    else process.env.AS_TASK_STORE_DIR = old;
    await rm(directory, { recursive: true, force: true });
  }
});

test('task history returns an empty list for missing directory', async () => {
  const missing = join(tmpdir(), 'as-nonexistent-' + randomUUID());
  assert.deepEqual(await new JsonTaskFileStore(missing).listRecent(), []);
});
