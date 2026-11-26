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
  oldDirectory = process.env.AS_SELECTION_STORE_DIR;
  directory = await mkdtemp(join(tmpdir(), 'as-selections-'));
  process.env.AS_SELECTION_STORE_DIR = directory;
  app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => {
  if (app) await app.close();
  if (oldDirectory === undefined) delete process.env.AS_SELECTION_STORE_DIR;
  else process.env.AS_SELECTION_STORE_DIR = oldDirectory;
  if (directory) await rm(directory, { recursive: true, force: true });
});

function connect(peerId: 'aa') {
  const socket = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false, auth: { peerId }
  });
  const ready = new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return { socket, ready };
}

test('AS persists selection and ACKs received while an offline Cdc delivery remains pending', async () => {
  const ui = connect('aa');
  await ui.ready;
  try {
    const events: any[] = [];
    ui.socket.on('resource-selection:updated', record => events.push(record));
    const ack: any = await ui.socket.timeout(3000).emitWithAck('peer:message', {
      kind: 'request', from: 'aa', to: 'cdc',
      payload: { type: 'demo.resource-selection', data: selection }
    });
    assert.equal(ack.ok, true);
    assert.equal(ack.status, 'received');

    const store = new JsonResourceSelectionStore(directory);
    const [saved] = await store.listRecent(50);
    assert.ok(saved);
    assert.deepEqual(saved.selection, selection);
    assert.equal(saved.deliveryStatus, 'pending');
    assert.deepEqual(events.map(record => record.deliveryStatus), ['pending']);
    assert.equal(saved.id, events[0].id);
    assert.equal((await readdir(directory)).filter(name => /^[0-9a-f-]{36}\.json$/.test(name)).length, 1);

    // Request a snapshot through the same Aa connection.
    const refreshed = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing selection snapshot')), 3000);
      ui.socket.once('resource-selection:snapshot', value => {
        clearTimeout(timer);
        resolve(value);
      });
    });
    ui.socket.emit('resource-selection:refresh');
    const snapshot = (await refreshed).records[0];
    assert.equal(snapshot.id, saved.id);
    assert.equal(snapshot.deliveryStatus, 'pending');
    await store.reliability.close();
  } finally { ui.socket.disconnect(); }
});

test('new Aa connection recovers saved records from AS disk', async () => {
  const ui = connect('aa');
  try {
    const snapshot = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Snapshot missing on Aa connect')), 3000);
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
      record.deliveryStatus === 'pending'));
  } finally { ui.socket.disconnect(); }
});

test('store refuses malformed selections and preserves input IDs exactly', async () => {
  const store = new JsonResourceSelectionStore(directory);
  await assert.rejects(store.save({ ...selection, accountId: '' }), /too_small|String|small/i);
  assert.ok((await store.listRecent()).every(record =>
    Object.keys(record.selection).sort().join(',') === 'accountId,browserProfileId,proxyId'));
});
