import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  AtomicJsonRecordStore, createReliableRecord, ReliabilityCapacityError,
  ReliabilityCommitUncertainError, type AtomicJsonRecordStoreHooks
} from '../src/shared/persistence/atomic-json-record-store.js';
import { DEFAULT_RELIABILITY_POLICY, ReliableOutboxRunner } from '../src/shared/persistence/reliable-outbox-runner.js';
import { MemoryReliableRecordStore } from './helpers/memory-reliable-store.js';

interface Payload { readonly message: string }
interface Ack { readonly ok: true; readonly id: string }

function createDiskStore(directory: string, maxRecords = 10, hooks: AtomicJsonRecordStoreHooks = {}) {
  return new AtomicJsonRecordStore<Payload, Ack>(
    directory,
    (value): value is Payload => Boolean(value && typeof value === 'object' && 'message' in value),
    (value): value is Ack => Boolean(value && typeof value === 'object' && 'ok' in value && value.ok === true),
    { maxRecords, maxBytes: 1_000_000 },
    hooks
  );
}

function record(key: string, id = key) {
  return createReliableRecord<Payload, Ack>({
    key, fingerprint: `fingerprint:${key}`, createdAt: 100, updatedAt: 100,
    state: 'queued', attempts: 0, payload: { message: key }, ack: { ok: true, id }
  });
}

test('atomic outbox creation is exclusive, mode-restricted, capacity-bounded and duplicate-stable across reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-outbox-'));
  let store = createDiskStore(directory, 1);
  try {
    const first = await store.create(record('F08:task-1', 'receipt-1'));
    assert.equal(first.created, true);
    assert.deepEqual(first.record.ack, { ok: true, id: 'receipt-1' });
    const second = await store.create(record('F08:task-1', 'receipt-2'));
    assert.equal(second.created, false);
    assert.deepEqual(second.record.ack, { ok: true, id: 'receipt-1' });
    await assert.rejects(store.create(record('F09:task-1')), ReliabilityCapacityError);
    const canonical = (await readdir(directory)).find(name => /^[0-9a-f]{64}\.json$/.test(name));
    assert.ok(canonical);
    assert.equal((await stat(join(directory, canonical))).mode & 0o777, 0o600);
    assert.equal((await readdir(directory)).some(name => name.endsWith('.tmp')), false);
  } finally {
    await store.close();
  }

  store = createDiskStore(directory, 1);
  try {
    const duplicate = await store.create(record('F08:task-1', 'new-process-id'));
    assert.equal(duplicate.created, false);
    assert.deepEqual(duplicate.record.ack, { ok: true, id: 'receipt-1' });
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('startup converts an interrupted attempting record to uncertain without replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-recovery-'));
  const firstStore = createDiskStore(directory);
  await firstStore.create(record('M13:aaui:message-1'));
  await firstStore.transition('M13:aaui:message-1', 'attempting', { attempts: 1 });
  await firstStore.close();

  const store = createDiskStore(directory);
  const scheduled: Array<() => Promise<void>> = [];
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() { throw new Error('uncalled for uncertain recovery'); },
    onState() {},
    defer(work) { scheduled.push(work); }
  });
  try {
    await runner.start();
    assert.equal((await store.get('M13:aaui:message-1'))?.state, 'uncertain');
    assert.equal(scheduled.length, 0);
    await runner.wake();
    assert.equal(scheduled.length, 0);
  } finally {
    runner.close();
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('startup quarantines duplicate temp links without hiding canonical records and blocks incomplete keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-temp-recovery-'));
  const firstStore = createDiskStore(directory);
  const canonical = record('F09:task-temp');
  await firstStore.create(canonical);
  await firstStore.close();
  const canonicalName = (await readdir(directory)).find(name => /^[0-9a-f]{64}\.json$/.test(name));
  assert.ok(canonicalName);
  const canonicalBytes = await readFile(join(directory, canonicalName));
  await writeFile(join(directory, `${canonicalName}.${process.pid}.tmp`), canonicalBytes, { mode: 0o600 });
  const blockedKey = 'F08:blocked-temp';
  const blockedHash = createHash('sha256').update(blockedKey).digest('hex');
  await writeFile(join(directory, `${blockedHash}.interrupted.tmp`), '{partial', { mode: 0o600 });

  const store = createDiskStore(directory);
  try {
    assert.deepEqual(await store.list(), [canonical]);
    const quarantineNames = await readdir(join(directory, '.quarantine'));
    assert.equal(quarantineNames.length, 2);
    assert.equal(quarantineNames.some(name => name.includes('-resolved-')), true);
    assert.equal((await store.create(record('F09:task-temp'))).created, false);
    await assert.rejects(store.create(record(blockedKey)));
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('unexpected directory-sync failure reconciles a published receipt to uncertain and withholds ACK commit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-sync-failure-'));
  let failed = false;
  const store = createDiskStore(directory, 10, {
    async syncDirectory(_directory, context) {
      if (!failed && context === 'canonical publication') {
        failed = true;
        throw new Error('unexpected directory sync error');
      }
    }
  });
  try {
    await assert.rejects(store.create(record('F08:sync-uncertain')), ReliabilityCommitUncertainError);
    assert.equal((await store.get('F08:sync-uncertain'))?.state, 'uncertain');
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('write, file-sync, close and hard-link failures withhold receipt commit', async () => {
  const operations = ['write', 'file-sync', 'file-close', 'hard-link'] as const;
  for (const operation of operations) {
    const directory = await mkdtemp(join(tmpdir(), `reliable-${operation}-failure-`));
    let injected = false;
    const store = createDiskStore(directory, 10, {
      async beforeOperation(name) {
        if (!injected && name === operation) {
          injected = true;
          throw new Error(`injected ${operation} failure`);
        }
      }
    });
    try {
      await assert.rejects(store.create(record(`F08:${operation}-failure`)), new RegExp(`injected ${operation} failure`));
      assert.equal((await store.list()).length, 0);
      assert.equal((await readdir(join(directory, '.quarantine'))).length, 1);
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('failed canonical state rename retains the prior state and quarantines the replacement temp file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-rename-failure-'));
  let failRename = false;
  const store = createDiskStore(directory, 10, {
    async beforeOperation(operation) {
      if (failRename && operation === 'rename') {
        failRename = false;
        throw new Error('injected rename failure');
      }
    }
  });
  try {
    await store.create(record('F08:rename-failure'));
    failRename = true;
    await assert.rejects(store.transition('F08:rename-failure', 'attempting', { attempts: 1 }), /injected rename failure/);
    assert.equal((await store.get('F08:rename-failure'))?.state, 'queued');
    assert.equal((await readdir(join(directory, '.quarantine'))).length, 1);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('delivered-state directory-sync failure is reconciled to uncertain rather than reported delivered', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-delivered-sync-'));
  let failDeliveredSync = false;
  const store = createDiskStore(directory, 10, {
    async syncDirectory(_directory, context) {
      if (failDeliveredSync && context === 'record update') {
        failDeliveredSync = false;
        throw new Error('unexpected directory sync error');
      }
    }
  });
  try {
    await store.create(record('F09:delivered-sync'));
    await store.transition('F09:delivered-sync', 'attempting', { attempts: 1 });
    failDeliveredSync = true;
    const reconciled = await store.transition('F09:delivered-sync', 'delivered');
    assert.equal(reconciled.state, 'uncertain');
    assert.match(reconciled.lastError ?? '', /publication is uncertain/i);
    assert.equal((await store.get('F09:delivered-sync'))?.state, 'uncertain');
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('offline retries use controlled equal-jitter timing; ambiguous send becomes terminal uncertain', async () => {
  const store = new MemoryReliableRecordStore<Payload, Ack>();
  await store.create(record('F08:task-2'));
  const scheduled: Array<() => Promise<void>> = [];
  const states: string[] = [];
  let now = 1_000;
  let ready = false;
  let sends = 0;
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => ready,
    async deliver() { sends += 1; throw new Error('ACK outcome is ambiguous'); },
    onState(value) { states.push(value.state); },
    defer(work) { scheduled.push(work); },
    now: () => now,
    random: () => 0.25
  });
  try {
    await runner.start();
    assert.equal(scheduled.length, 1);
    await scheduled.shift()?.();
    const retryable = await store.get('F08:task-2');
    assert.equal(retryable?.state, 'retryable');
    assert.equal(retryable?.attempts, 0);
    assert.equal(retryable?.nextAttemptAt, 2_250);

    now = retryable.nextAttemptAt!;
    ready = true;
    await runner.wake();
    assert.equal(scheduled.length, 1);
    await scheduled.shift()?.();
    assert.equal((await store.get('F08:task-2'))?.state, 'uncertain');
    assert.equal((await store.get('F08:task-2'))?.attempts, 1);
    assert.equal(sends, 1);
    await runner.wake();
    assert.equal(scheduled.length, 0);
    assert.deepEqual(states, ['retryable', 'uncertain']);
  } finally {
    runner.close();
    await store.close();
  }
});

test('approved retry limits are centralized and injected policy stops at the configured bound', async () => {
  assert.deepEqual(DEFAULT_RELIABILITY_POLICY, {
    maxAttempts: 6,
    retryDelaysMs: [2_000, 10_000, 60_000, 300_000, 1_800_000],
    maxAgeMs: 24 * 60 * 60 * 1_000,
    scanBatchSize: 100,
    concurrency: 4,
    scanIntervalMs: 1_000
  });
  class UnsentError extends Error { readonly reliabilityOutcome = 'unsent' as const; }
  const store = new MemoryReliableRecordStore<Payload, Ack>();
  await store.create(record('M13:aaui:bounded'));
  const scheduled: Array<() => Promise<void>> = [];
  let now = 1_000;
  let sends = 0;
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() { sends += 1; throw new UnsentError('connect failed before emit'); },
    onState() {},
    defer(work) { scheduled.push(work); },
    now: () => now,
    random: () => 0,
    policy: { ...DEFAULT_RELIABILITY_POLICY, maxAttempts: 1 }
  });
  try {
    await runner.start();
    await scheduled.shift()?.();
    assert.equal((await store.get('M13:aaui:bounded'))?.state, 'retryable');
    assert.equal((await store.get('M13:aaui:bounded'))?.attempts, 1);
    now = 2_000;
    await runner.wake();
    await scheduled.shift()?.();
    assert.equal((await store.get('M13:aaui:bounded'))?.state, 'failed');
    assert.equal(sends, 1);
  } finally {
    runner.close();
    await store.close();
  }
});

test('24-hour maximum age ends stale queued work without sending', async () => {
  const store = new MemoryReliableRecordStore<Payload, Ack>();
  await store.create(record('F08:expired', 'expired'));
  const scheduled: Array<() => Promise<void>> = [];
  let sends = 0;
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() { sends += 1; },
    onState() {},
    defer(work) { scheduled.push(work); },
    now: () => 86_401_000
  });
  try {
    await runner.start();
    await scheduled.shift()?.();
    assert.equal((await store.get('F08:expired'))?.state, 'failed');
    assert.equal(sends, 0);
  } finally {
    runner.close();
    await store.close();
  }
});

test('startup scanning is oldest-first, capped at 100 records and 4 concurrently scheduled attempts', async () => {
  const store = new MemoryReliableRecordStore<Payload, Ack>();
  for (let index = 0; index < 105; index += 1) await store.create(record(`F08:batch-${index}`));
  const scheduled: Array<() => Promise<void>> = [];
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() {},
    onState() {},
    defer(work) { scheduled.push(work); }
  });
  await runner.start();
  assert.equal(scheduled.length, DEFAULT_RELIABILITY_POLICY.concurrency);
  runner.close();
  await store.close();

  const batchStore = new MemoryReliableRecordStore<Payload, Ack>();
  for (let index = 0; index < 105; index += 1) await batchStore.create(record(`M13:batch-${index}`));
  const batchScheduled: Array<() => Promise<void>> = [];
  const batchRunner = new ReliableOutboxRunner(batchStore, {
    isReady: () => true,
    async deliver() {},
    onState() {},
    defer(work) { batchScheduled.push(work); },
    policy: { ...DEFAULT_RELIABILITY_POLICY, concurrency: 100 }
  });
  await batchRunner.start();
  assert.equal(batchScheduled.length, DEFAULT_RELIABILITY_POLICY.scanBatchSize);
  batchRunner.close();
  await batchStore.close();
});

test('peer acceptance followed by failed local delivered-state commit is uncertain and is not replayed', async () => {
  const memory = new MemoryReliableRecordStore<Payload, Ack>();
  await memory.create(record('F09:accepted-before-commit'));
  const store = {
    initialize: () => memory.initialize(),
    get: (key: string) => memory.get(key),
    list: () => memory.list(),
    create: (value: ReturnType<typeof record>) => memory.create(value),
    close: () => memory.close(),
    transition: async (key: string, state: Parameters<typeof memory.transition>[1], changes?: Parameters<typeof memory.transition>[2]) => {
      if (state === 'delivered') throw new Error('local state commit failed after peer accepted');
      return memory.transition(key, state, changes);
    }
  };
  const scheduled: Array<() => Promise<void>> = [];
  let acceptedSideEffects = 0;
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() { acceptedSideEffects += 1; },
    onState() {},
    defer(work) { scheduled.push(work); },
    now: () => 100
  });
  try {
    await runner.start();
    await scheduled.shift()?.();
    assert.equal(acceptedSideEffects, 1);
    assert.equal((await memory.get('F09:accepted-before-commit'))?.state, 'uncertain');
    await runner.wake();
    assert.equal(scheduled.length, 0);
  } finally {
    runner.close();
    await memory.close();
  }
});
