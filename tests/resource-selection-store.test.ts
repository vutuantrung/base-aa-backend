import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  JsonResourceSelectionStore, resourceSelectionSchema,
  type StoredSelection
} from '../src/modules/peer-messaging/resource-selection-store.js';

const selection = { browserProfileId: 'browser-1', proxyId: 'proxy-2', accountId: 'account-3' };

test('compatibility import keeps immutable receipt and separate fallback sidecar format', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'selection-store-'));
  try {
    const store = new JsonResourceSelectionStore(directory);
    const record = await store.save({ browserProfileId: ' browser-1 ', proxyId: ' proxy-2 ', accountId: ' account-3 ' });
    const receiptPath = join(directory, `${record.id}.json`);
    const receiptBefore = await readFile(receiptPath, 'utf8');
    assert.equal(receiptBefore.endsWith('\n'), true);
    assert.deepEqual(JSON.parse(receiptBefore), {
      id: record.id, createdTime: record.createdTime, selection
    });
    assert.equal((await stat(receiptPath)).mode & 0o777, 0o600);

    await store.updateDelivery(record.id, 'forwardFailed', '');
    const sidecar = await readFile(join(directory, `${record.id}.delivery.json`), 'utf8');
    assert.deepEqual(JSON.parse(sidecar), { deliveryStatus: 'forwardFailed', deliveryError: 'Delivery failed' });
    assert.equal(sidecar.endsWith('\n'), true);
    assert.equal(await readFile(receiptPath, 'utf8'), receiptBefore);
    assert.deepEqual(await store.listRecent(), [{ ...record, deliveryError: 'Delivery failed', deliveryStatus: 'forwardFailed' }]);
    await assert.rejects(store.updateDelivery(record.id, 'pending'), /Pending is the initial receipt state/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('history orders by createdTime then descending ID, applies limit, and normalizes unknown sidecar states', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'selection-history-'));
  const firstId = '11111111-1111-4111-8111-111111111111';
  const secondId = '22222222-2222-4222-8222-222222222222';
  const thirdId = '33333333-3333-4333-8333-333333333333';
  try {
    await mkdir(directory, { recursive: true });
    const writeReceipt = async (id: string, createdTime: number) => writeFile(join(directory, `${id}.json`), JSON.stringify({ id, createdTime, selection }) + '\n');
    await writeReceipt(firstId, 20);
    await writeReceipt(secondId, 20);
    await writeReceipt(thirdId, 10);
    await writeFile(join(directory, `${secondId}.delivery.json`), JSON.stringify({ deliveryStatus: 'unknown', deliveryError: 42 }));
    const store = new JsonResourceSelectionStore(directory);
    const recent = await store.listRecent(2);
    assert.deepEqual(recent.map(item => item.id), [secondId, firstId]);
    assert.equal(recent[0]?.deliveryStatus, 'pending');
    assert.equal('deliveryError' in (recent[0] ?? {}), false);
    assert.deepEqual(recent[0]?.selection, resourceSelectionSchema.parse(selection));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('missing selection directory remains empty and invalid persisted receipt IDs are rejected', async () => {
  const missing = join(tmpdir(), `missing-selection-${randomUUID()}`);
  assert.deepEqual(await new JsonResourceSelectionStore(missing).listRecent(), []);
  const directory = await mkdtemp(join(tmpdir(), 'selection-corrupt-'));
  try {
    const filenameId = '22222222-2222-4222-8222-222222222222';
    const receipt: StoredSelection = {
      id: 'bad-selection-id', createdTime: 1, selection,
      deliveryStatus: 'pending'
    };
    await writeFile(join(directory, `${filenameId}.json`), JSON.stringify(receipt));
    await assert.rejects(new JsonResourceSelectionStore(directory).listRecent(), /Corrupt resource selection receipt/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
