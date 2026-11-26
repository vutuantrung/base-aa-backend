import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
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

function createDiskStore(directory: string, maxRecords = 10, hooks: AtomicJsonRecordStoreHooks = {}, maxBytes = 1_000_000) {
  return new AtomicJsonRecordStore<Payload, Ack>(
    directory,
    (value): value is Payload => Boolean(value && typeof value === 'object' && 'message' in value),
    (value): value is Ack => Boolean(value && typeof value === 'object' && 'ok' in value && value.ok === true),
    { maxRecords, maxBytes },
    hooks
  );
}

function record(key: string, id = key) {
  return createReliableRecord<Payload, Ack>({
    key, fingerprint: `fingerprint:${key}`, createdAt: 100, updatedAt: 100,
    state: 'queued', attempts: 0, payload: { message: key }, ack: { ok: true, id }
  });
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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

test('same-process store instances share writer reference ownership and recount quarantine capacity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-shared-process-writer-'));
  let failed = false;
  const first = createDiskStore(directory, 1, {
    async beforeOperation(operation) {
      if (!failed && operation === 'write') { failed = true; throw new Error('injected quarantine capacity evidence'); }
    }
  });
  const second = createDiskStore(directory, 1);
  try {
    await Promise.all([first.initialize(), second.initialize()]);
    await assert.rejects(first.create(record('F08:quarantined-capacity')), /injected quarantine capacity evidence/);
    await assert.rejects(second.create(record('F09:capacity-after-quarantine')), ReliabilityCapacityError);
    await first.close();
    await stat(join(directory, '.writer.lock'));
    await second.close();
    const reopened = createDiskStore(directory);
    await reopened.initialize();
    await reopened.close();
  } finally {
    await Promise.all([first.close(), second.close()]);
    await rm(directory, { recursive: true, force: true });
  }
});

test('startup converts an interrupted attempting record to uncertain without replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-recovery-'));
  const firstStore = createDiskStore(directory);
  await firstStore.create(record('M13:aa:message-1'));
  await firstStore.transition('M13:aa:message-1', 'attempting', { attempts: 1 });
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
    assert.equal((await store.get('M13:aa:message-1'))?.state, 'uncertain');
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

test('a valid but conflicting temp artifact blocks the canonical key from ACK and replay', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-conflicting-temp-'));
  const firstStore = createDiskStore(directory);
  const canonical = record('F09:conflicting-temp', 'canonical-ack');
  await firstStore.create(canonical);
  await firstStore.close();
  const canonicalName = (await readdir(directory)).find(name => /^[0-9a-f]{64}\.json$/.test(name));
  assert.ok(canonicalName);
  await writeFile(join(directory, `${canonicalName}.conflict.tmp`), `${JSON.stringify(record(canonical.key, 'other-ack'), null, 2)}\n`, { mode: 0o600 });

  const store = createDiskStore(directory);
  const scheduled: Array<() => Promise<void>> = [];
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true, async deliver() { assert.fail('Blocked key must not replay'); },
    onState() {}, defer(work) { scheduled.push(work); }
  });
  try {
    assert.equal(await store.get(canonical.key), undefined);
    assert.equal((await store.list()).length, 0);
    await assert.rejects(store.create(record(canonical.key, 'new-ack')), ReliabilityCommitUncertainError);
    await runner.start();
    assert.equal(scheduled.length, 0);
  } finally {
    runner.close();
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
    assert.equal(await store.get('F08:rename-failure'), undefined);
    assert.equal((await store.list()).length, 0);
    await assert.rejects(store.create(record('F08:rename-failure')), ReliabilityCommitUncertainError);
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
  await store.create(record('M13:aa:bounded'));
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
    assert.equal((await store.get('M13:aa:bounded'))?.state, 'retryable');
    assert.equal((await store.get('M13:aa:bounded'))?.attempts, 1);
    now = 2_000;
    await runner.wake();
    await scheduled.shift()?.();
    assert.equal((await store.get('M13:aa:bounded'))?.state, 'failed');
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

test('startup scanning is oldest-first and caps concurrent attempts at four', async () => {
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

  assert.throws(() => new ReliableOutboxRunner(store, {
    isReady: () => true, async deliver() {}, onState() {}, defer() {},
    policy: { ...DEFAULT_RELIABILITY_POLICY, concurrency: 100 }
  }), /approved retry, age, batch, and concurrency bounds/);
});

test('two workflow outbox runners share the approved process-wide concurrency ceiling', async () => {
  const firstStore = new MemoryReliableRecordStore<Payload, Ack>();
  const secondStore = new MemoryReliableRecordStore<Payload, Ack>();
  const now = Date.now();
  for (let index = 0; index < 8; index += 1) {
    await firstStore.create(createReliableRecord({ key: `M12:aggregate-${index}`, fingerprint: `M12:${index}`,
      createdAt: now, updatedAt: now, state: 'queued', attempts: 0, payload: { message: 'm12' }, ack: { ok: true, id: 'm12' } }));
    await secondStore.create(createReliableRecord({ key: `M13:aggregate-${index}`, fingerprint: `M13:${index}`,
      createdAt: now, updatedAt: now, state: 'queued', attempts: 0, payload: { message: 'm13' }, ack: { ok: true, id: 'm13' } }));
  }
  let active = 0;
  let maximum = 0;
  let releaseDeliveries!: () => void;
  const deliveriesReleased = new Promise<void>(resolve => { releaseDeliveries = resolve; });
  let reachedCeiling!: () => void;
  const fourActive = new Promise<void>(resolve => { reachedCeiling = resolve; });
  const scheduledFirst: Array<() => Promise<void>> = [];
  const scheduledSecond: Array<() => Promise<void>> = [];
  const makeRunner = (store: MemoryReliableRecordStore<Payload, Ack>, scheduled: Array<() => Promise<void>>) =>
    new ReliableOutboxRunner(store, {
      isReady: () => true,
      async deliver() {
        active += 1;
        maximum = Math.max(maximum, active);
        if (active === DEFAULT_RELIABILITY_POLICY.concurrency) reachedCeiling();
        await deliveriesReleased;
        active -= 1;
      },
      onState() {}, defer(work) { scheduled.push(work); }
    });
  const first = makeRunner(firstStore, scheduledFirst);
  const second = makeRunner(secondStore, scheduledSecond);
  try {
    await Promise.all([first.start(), second.start()]);
    const work = Promise.all([...scheduledFirst, ...scheduledSecond].map(run => run()));
    await fourActive;
    assert.equal(maximum, DEFAULT_RELIABILITY_POLICY.concurrency);
    releaseDeliveries();
    await work;
    assert.equal(maximum, 4);
  } finally {
    releaseDeliveries();
    first.close();
    second.close();
    await Promise.all([firstStore.close(), secondStore.close()]);
  }
});

test('close racing runner startup preserves the writer lock until startup settles and starts no scanner', async () => {
  const memory = new MemoryReliableRecordStore<Payload, Ack>();
  let initializeResolve!: () => void;
  const initializeGate = new Promise<void>(resolve => { initializeResolve = resolve; });
  let listCalls = 0;
  const store = {
    initialize: () => initializeGate,
    get: (key: string) => memory.get(key),
    list: async () => { listCalls += 1; return memory.list(); },
    create: (value: ReturnType<typeof record>) => memory.create(value),
    transition: (key: string, state: Parameters<typeof memory.transition>[1], changes?: Parameters<typeof memory.transition>[2]) =>
      memory.transition(key, state, changes),
    close: async () => {}
  };
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true, async deliver() {}, onState() {}, defer() {}
  });
  const starting = runner.start();
  assert.equal(runner.close(), true);
  initializeResolve();
  await starting;
  assert.equal(listCalls, 0);
});

test('readiness scans contain transient store read errors without an unhandled rejection', async () => {
  const memory = new MemoryReliableRecordStore<Payload, Ack>();
  let failList = false;
  const store = {
    initialize: () => memory.initialize(), get: (key: string) => memory.get(key),
    list: async () => { if (failList) throw new Error('injected scan read failure'); return memory.list(); },
    create: (value: ReturnType<typeof record>) => memory.create(value),
    transition: (key: string, state: Parameters<typeof memory.transition>[1], changes?: Parameters<typeof memory.transition>[2]) =>
      memory.transition(key, state, changes),
    close: () => memory.close()
  };
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true, async deliver() {}, onState() {}, defer() {}
  });
  try {
    await runner.start();
    failList = true;
    await assert.doesNotReject(runner.wake());
  } finally {
    runner.close();
    await memory.close();
  }
});

test('overlapping readiness and periodic-style scans do not duplicate an active key', async () => {
  const store = new MemoryReliableRecordStore<Payload, Ack>();
  const now = Date.now();
  await store.create(createReliableRecord({ key: 'M12:overlapping-scan', fingerprint: 'overlap',
    createdAt: now, updatedAt: now, state: 'queued', attempts: 0,
    payload: { message: 'overlap' }, ack: { ok: true, id: 'overlap' } }));
  const scheduled: Array<() => Promise<void>> = [];
  let releaseDelivery!: () => void;
  const deliveryGate = new Promise<void>(resolve => { releaseDelivery = resolve; });
  let deliveryEntered!: () => void;
  const entered = new Promise<void>(resolve => { deliveryEntered = resolve; });
  let sends = 0;
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() { sends += 1; deliveryEntered(); await deliveryGate; },
    onState() {}, defer(work) { scheduled.push(work); }
  });
  try {
    await runner.start();
    await Promise.all([runner.wake(), runner.wake()]);
    assert.equal(scheduled.length, 1);
    const work = scheduled.shift()?.();
    await entered;
    await Promise.all([runner.wake(), runner.wake()]);
    assert.equal(scheduled.length, 0);
    assert.equal(sends, 1);
    releaseDelivery();
    await work;
  } finally {
    releaseDelivery();
    runner.close();
    await store.close();
  }
});

test('scanner list settlement holds runner ownership until shutdown can safely release it', async () => {
  const memory = new MemoryReliableRecordStore<Payload, Ack>();
  const recordValue = record('M12:suspended-scanner');
  await memory.create(recordValue);
  let releaseRunner: (() => void) | undefined = () => {};
  let ownershipReleased = false;
  const enteredList = deferred();
  const releaseList = deferred();
  let suspendList = false;
  const store = {
    initialize: () => memory.initialize(), get: (key: string) => memory.get(key),
    list: async () => {
      if (suspendList) {
        enteredList.resolve();
        await releaseList.promise;
      }
      return memory.list();
    },
    create: (value: ReturnType<typeof record>) => memory.create(value),
    transition: (key: string, state: Parameters<typeof memory.transition>[1], changes?: Parameters<typeof memory.transition>[2]) =>
      memory.transition(key, state, changes),
    close: () => memory.close(),
    claimRunner: () => {
      ownershipReleased = false;
      return () => { ownershipReleased = true; releaseRunner?.(); releaseRunner = undefined; };
    }
  };
  const scheduled: Array<() => Promise<void>> = [];
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true, async deliver() {}, onState() {}, defer(work) { scheduled.push(work); }
  });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await runner.start(false);
    suspendList = true;
    const scan = runner.wake();
    await withTimeout(enteredList.promise, 'scanner did not enter injected store.list()');
    runner.close();
    let idleSettled = false;
    const idle = runner.waitForIdle().then(() => { idleSettled = true; });
    await Promise.resolve();
    assert.equal(idleSettled, false);
    assert.equal(ownershipReleased, false);
    releaseList.resolve();
    await Promise.all([scan, idle]);
    assert.equal(ownershipReleased, true);
    assert.equal(scheduled.length, 0, 'closed scanner must not start an attempt after list settles');
  } finally {
    releaseList.resolve();
    runner.close();
    await runner.waitForIdle();
    await memory.close();
    clearInterval(keepAlive);
  }
});

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 2000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

test('close during an active attempt preserves ownership evidence through the final state mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-active-close-'));
  const store = createDiskStore(directory);
  await store.create(record('F08:active-close'));
  const observer = createDiskStore(directory);
  await observer.initialize();
  let releaseDelivery!: () => void;
  const deliveryGate = new Promise<void>(resolve => { releaseDelivery = resolve; });
  let deliveryEntered!: () => void;
  const entered = new Promise<void>(resolve => { deliveryEntered = resolve; });
  const scheduled: Array<() => Promise<void>> = [];
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() { deliveryEntered(); await deliveryGate; throw new Error('ambiguous after emit'); },
    onState() {}, defer(work) { scheduled.push(work); }, now: () => 100
  });
  try {
    await runner.start();
    const work = scheduled.shift()?.();
    await entered;
    assert.equal(runner.close(), true);
    await store.close(true);
    await observer.close();
    await assert.rejects(createDiskStore(directory).initialize(), /state directory is locked/);
    releaseDelivery();
    await work;
    assert.equal((await store.get('F08:active-close'))?.state, 'uncertain');
    await assert.rejects(createDiskStore(directory).initialize(), /state directory is locked/);
  } finally {
    releaseDelivery();
    runner.close();
    await store.close(true);
    await observer.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('deadline rejection preserves writer lease through late delivery commit and releases it afterward', async () => {
  const memory = new MemoryReliableRecordStore<Payload, Ack>();
  const createdAt = Date.now();
  await memory.create(createReliableRecord({ key: 'F08:late-deadline', fingerprint: 'late-deadline', createdAt,
    updatedAt: createdAt, state: 'queued', attempts: 0, payload: { message: 'late-deadline' },
    ack: { ok: true, id: 'late-deadline' } }));
  let leaseHeld = false;
  const store = {
    initialize: () => memory.initialize(), get: (key: string) => memory.get(key), list: () => memory.list(),
    create: (value: ReturnType<typeof record>) => memory.create(value),
    transition: (key: string, state: Parameters<typeof memory.transition>[1], changes?: Parameters<typeof memory.transition>[2]) =>
      memory.transition(key, state, changes),
    close: () => memory.close(),
    claimRunner: () => { leaseHeld = true; return () => { leaseHeld = false; }; }
  };
  const deliveryEntered = deferred();
  const releaseDelivery = deferred();
  const scheduled: Array<() => Promise<void>> = [];
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() { deliveryEntered.resolve(); await releaseDelivery.promise; },
    onState() {}, defer(work) { scheduled.push(work); }
  });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await withTimeout(runner.start(), 'runner startup did not settle');
    const attempt = scheduled.shift();
    assert.ok(attempt, 'runner did not schedule the initial attempt');
    const attemptWork = attempt();
    await withTimeout(deliveryEntered.promise, 'late delivery did not start');
    runner.close();
    const ownerClose = withTimeout(runner.waitForIdle(), 'shutdown owner deadline elapsed', 25);
    await assert.rejects(ownerClose, /shutdown owner deadline elapsed/);
    assert.equal(leaseHeld, true);
    assert.equal((await memory.get('F08:late-deadline'))?.state, 'attempting');
    releaseDelivery.resolve();
    await Promise.all([attemptWork, runner.waitForIdle()]);
    assert.equal((await memory.get('F08:late-deadline'))?.state, 'delivered');
    assert.equal(leaseHeld, false);
  } finally {
    releaseDelivery.resolve();
    runner.close();
    await withTimeout(runner.waitForIdle(), 'runner did not become idle after releasing delivery');
    await memory.close();
    clearInterval(keepAlive);
  }
});

test('shutdown cancels a process-wide slot waiter without a late send or limiter leak', async () => {
  const stores = Array.from({ length: 5 }, () => new MemoryReliableRecordStore<Payload, Ack>());
  const scheduled: Array<Array<() => Promise<void>>> = stores.map(() => []);
  const releases = Array.from({ length: 4 }, () => deferred<void>());
  const firstFourStarted = deferred<void>();
  let active = 0;
  let fifthSends = 0;
  const runners = stores.map((store, index) => new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() {
      if (index === 4) { fifthSends += 1; return; }
      active += 1;
      if (active === 4) firstFourStarted.resolve();
      await releases[index]!.promise;
      active -= 1;
    },
    onState() {}, defer(work) { scheduled[index]!.push(work); }
  }));
  const createdAt = Date.now();
  for (let index = 0; index < stores.length; index += 1) {
    await stores[index]!.create(createReliableRecord({ key: `F08:limiter-waiter-${index}`,
      fingerprint: `fingerprint:${index}`, createdAt, updatedAt: createdAt,
      state: 'queued', attempts: 0, payload: { message: `waiter-${index}` }, ack: { ok: true, id: `waiter-${index}` } }));
    await runners[index]!.start();
  }
  for (const tasks of scheduled) for (const task of tasks) void task();
  await firstFourStarted.promise;
  runners[4]!.close();
  await runners[4]!.waitForIdle();
  assert.equal(fifthSends, 0);
  assert.equal((await stores[4]!.get('F08:limiter-waiter-4'))?.state, 'queued');
  for (const release of releases) release.resolve();
  await Promise.all(runners.slice(0, 4).map(async runner => { runner.close(); await runner.waitForIdle(); }));
  await Promise.all(stores.map(store => store.close()));
  const afterReleaseStore = new MemoryReliableRecordStore<Payload, Ack>();
  await afterReleaseStore.create(createReliableRecord({ key: 'F08:limiter-after-release',
    fingerprint: 'fingerprint:after-release', createdAt: Date.now(), updatedAt: Date.now(),
    state: 'queued', attempts: 0, payload: { message: 'after-release' }, ack: { ok: true, id: 'after-release' } }));
  const afterReleaseScheduled: Array<() => Promise<void>> = [];
  let afterReleaseSends = 0;
  const afterReleaseRunner = new ReliableOutboxRunner(afterReleaseStore, {
    isReady: () => true, async deliver() { afterReleaseSends += 1; }, onState() {},
    defer(work) { afterReleaseScheduled.push(work); }
  });
  await afterReleaseRunner.start();
  for (const task of afterReleaseScheduled) await task();
  assert.equal(afterReleaseSends, 1);
  afterReleaseRunner.close();
  await afterReleaseRunner.waitForIdle();
  await afterReleaseStore.close();
});

test('cutoff between durable attempting state and transport invocation persists known-unsent retry without emitting', async () => {
  const memory = new MemoryReliableRecordStore<Payload, Ack>();
  const key = 'F08:cutoff-before-emit';
  const createdAt = Date.now();
  await memory.create(createReliableRecord({ key, fingerprint: key, createdAt, updatedAt: createdAt,
    state: 'queued', attempts: 0, payload: { message: key }, ack: { ok: true, id: key } }));
  const transitionEntered = deferred<void>();
  const releaseTransition = deferred<void>();
  const store = {
    initialize: () => memory.initialize(), get: (value: string) => memory.get(value), list: () => memory.list(),
    create: (value: ReturnType<typeof record>) => memory.create(value),
    async transition(value: string, state: Parameters<typeof memory.transition>[1], changes?: Parameters<typeof memory.transition>[2]) {
      if (state === 'attempting') {
        transitionEntered.resolve();
        await releaseTransition.promise;
      }
      return memory.transition(value, state, changes);
    },
    close: () => memory.close()
  };
  const scheduled: Array<() => Promise<void>> = [];
  let sends = 0;
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true, async deliver() { sends += 1; }, onState() {}, defer(work) { scheduled.push(work); }, now: () => createdAt
  });
  await runner.start();
  const attempt = scheduled[0]!();
  await transitionEntered.promise;
  runner.close();
  releaseTransition.resolve();
  await attempt;
  const persisted = await memory.get(key);
  assert.equal(sends, 0);
  assert.equal(persisted?.state, 'retryable');
  assert.equal(persisted?.attempts, 1);
  assert.ok((persisted?.nextAttemptAt ?? 0) > createdAt);
  await runner.waitForIdle();
  await memory.close();
});

test('same canonical directory permits one in-process outbox runner even with shared store references', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-runner-owner-'));
  const firstStore = createDiskStore(directory);
  const secondStore = createDiskStore(directory);
  const createRunner = (store: ReturnType<typeof createDiskStore>) => new ReliableOutboxRunner(store, {
    isReady: () => false, async deliver() {}, onState() {}, defer(work) { void work(); }
  });
  const firstRunner = createRunner(firstStore);
  const secondRunner = createRunner(secondStore);
  try {
    await firstRunner.start();
    await assert.rejects(secondRunner.start(), /runner already owns this state directory/);
    firstRunner.close();
    await firstRunner.waitForIdle();
    await secondRunner.start();
    secondRunner.close();
    await secondRunner.waitForIdle();
  } finally {
    firstRunner.close(); secondRunner.close();
    await Promise.all([firstRunner.waitForIdle(), secondRunner.waitForIdle()]);
    await Promise.all([firstStore.close(), secondStore.close()]);
    await rm(directory, { recursive: true, force: true });
  }
});

test('capacity overrides cannot exceed the approved record or byte bounds', () => {
  assert.throws(() => createDiskStore('unused', 10_001), /approved record and byte limits/);
  const memory = new MemoryReliableRecordStore<Payload, Ack>();
  const options = { isReady: () => true, async deliver() {}, onState() {}, defer() {} };
  assert.throws(() => new ReliableOutboxRunner(memory, {
    ...options, policy: { ...DEFAULT_RELIABILITY_POLICY, maxAgeMs: DEFAULT_RELIABILITY_POLICY.maxAgeMs + 1 }
  }), /approved retry, age, batch, and concurrency bounds/);
  assert.throws(() => new ReliableOutboxRunner(memory, {
    ...options, policy: { ...DEFAULT_RELIABILITY_POLICY, retryDelaysMs: [1, 2, 3, 4, 5] }
  }), /approved retry, age, batch, and concurrency bounds/);
});

test('a deleted cached canonical key becomes blocked instead of replaying a stale receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-deleted-canonical-'));
  const store = createDiskStore(directory);
  try {
    const original = await store.create(record('F08:deleted-canonical', 'original-ack'));
    assert.equal(original.created, true);
    const canonical = (await readdir(directory)).find(name => /^[0-9a-f]{64}\.json$/.test(name));
    assert.ok(canonical);
    await unlink(join(directory, canonical));
    await assert.rejects(store.create(record('F08:deleted-canonical', 'new-ack')), ReliabilityCommitUncertainError);
    assert.equal((await store.list()).some(item => item.key === 'F08:deleted-canonical'), false);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a corrupt canonical file is quarantined and cannot be replaced as a fresh accepted receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-corrupt-canonical-'));
  const store = createDiskStore(directory);
  const key = 'F09:corrupt-canonical';
  try {
    await store.create(record(key, 'original-ack'));
    const canonical = (await readdir(directory)).find(name => /^[0-9a-f]{64}\.json$/.test(name));
    assert.ok(canonical);
    await writeFile(join(directory, canonical), '{broken');
    await assert.rejects(store.create(record(key, 'replacement-ack')), ReliabilityCommitUncertainError);
    assert.equal((await store.list()).some(item => item.key === key), false);
    assert.equal((await readdir(join(directory, '.quarantine'))).length, 1);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('attempt metadata cannot move backwards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-attempt-monotonic-'));
  const store = createDiskStore(directory);
  try {
    await store.create(record('F08:attempt-monotonic'));
    await store.transition('F08:attempt-monotonic', 'attempting', { attempts: 1 });
    await assert.rejects(store.transition('F08:attempt-monotonic', 'retryable', { attempts: 0 }), /cannot decrease/);
    assert.equal((await store.get('F08:attempt-monotonic'))?.attempts, 1);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('state transition growth cannot exceed retained byte capacity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reliable-transition-capacity-'));
  const store = createDiskStore(directory, 10, {}, 1_200);
  try {
    await store.create(record('F08:transition-capacity'));
    await assert.rejects(store.transition('F08:transition-capacity', 'queued', { lastError: 'x'.repeat(2_000) }), ReliabilityCapacityError);
    assert.equal((await store.get('F08:transition-capacity'))?.state, 'queued');
    assert.equal((await store.get('F08:transition-capacity'))?.lastError, undefined);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
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
