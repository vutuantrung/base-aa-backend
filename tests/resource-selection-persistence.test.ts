import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { JsonResourceSelectionStore } from '../src/modules/peer-messaging/resource-selection-store.js';

let directory: string;
let oldDirectory: string | undefined;
let app: ReturnType<typeof createApplication>;
let base: string;

const selection = {
  browserProfileId: 'browser-profile-001',
  proxyId: 'proxy-002',
  accountId: 'account-tk-001'
};

before(async () => {
  oldDirectory = process.env.AAB_SELECTION_STORE_DIR;
  directory = await mkdtemp(join(tmpdir(), 'aab-selections-'));
  process.env.AAB_SELECTION_STORE_DIR = directory;
  app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => {
  if (app) await app.close();
  if (oldDirectory === undefined) delete process.env.AAB_SELECTION_STORE_DIR;
  else process.env.AAB_SELECTION_STORE_DIR = oldDirectory;
  if (directory) await rm(directory, { recursive: true, force: true });
});

function connect(peerId: 'aaui') {
  const socket = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false, auth: { peerId }
  });
  const ready = new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return { socket, ready };
}

test('AAB persists selection and ACKs received even when PServer is offline', async () => {
  const ui = connect('aaui');
  await ui.ready;
  try {
    const events: any[] = [];
    const failure = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing selection forwarding failure')), 3000);
      ui.socket.on('resource-selection:updated', record => {
        events.push(record);
        if (record.deliveryStatus === 'forwardFailed') {
          clearTimeout(timer);
          resolve(record);
        }
      });
    });
    const ack: any = await ui.socket.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'aaui', to: 'pserver',
      payload: { type: 'demo.resource-selection', data: selection }
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.status, 'received');

    const failed = await failure;
    assert.equal(failed.deliveryStatus, 'forwardFailed');
    assert.deepEqual(events.map(record => record.deliveryStatus), ['pending', 'forwardFailed']);
    assert.match(failed.deliveryError, /offline/i);

    const store = new JsonResourceSelectionStore(directory);
    const [saved] = await store.listRecent(50);
    assert.ok(saved);
    assert.equal(saved.id, failed.id);
    assert.deepEqual(saved.selection, selection);
    assert.equal(saved.deliveryStatus, 'forwardFailed');
    assert.equal((await readdir(directory)).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).length, 1);

    // Request a snapshot through the same AAUI connection.
    const refreshed = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing selection snapshot')), 3000);
      ui.socket.once('resource-selection:snapshot', value => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    ui.socket.emit('resource-selection:refresh');
    assert.equal((await refreshed).records[0].id, failed.id);
  } finally { ui.socket.disconnect(); }
});

test('new AAUI connection recovers saved records from AAB disk', async () => {
  const ui = connect('aaui');
  try {
    const snapshot = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Snapshot missing on AAUI connect')), 3000);
      ui.socket.once('resource-selection:snapshot', value => {
        clearTimeout(timer);
        resolve(value);
      });
      ui.socket.once('connect_error', reject);
    });
    await ui.ready;
    const received = await snapshot;
    assert.ok(received.records.some((record: any) =>
      record.selection.browserProfileId === selection.browserProfileId &&
      record.deliveryStatus === 'forwardFailed'));
  } finally { ui.socket.disconnect(); }
});

test('store refuses malformed selections and preserves input IDs exactly', async () => {
  const store = new JsonResourceSelectionStore(directory);
  await assert.rejects(store.save({ ...selection, accountId: '' }), /too_small|String|small/i);
  assert.ok((await store.listRecent()).every(record =>
    Object.keys(record.selection).sort().join(',') === 'accountId,browserProfileId,proxyId'));
});
