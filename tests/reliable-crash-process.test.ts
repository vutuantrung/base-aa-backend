import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { access, mkdir, mkdtemp, open, readFile, readdir, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AtomicJsonRecordStore, createReliableRecord, ReliabilityCommitUncertainError,
  ReliabilityWriterLockError
} from '../src/shared/persistence/atomic-json-record-store.js';
import { ReliableOutboxRunner } from '../src/shared/persistence/reliable-outbox-runner.js';
import { createApplication } from '../src/app/create-app.js';

interface Payload { readonly message: string }
interface Ack { readonly ok: true; readonly id: string }

const workerPath = fileURLToPath(new URL('./helpers/reliable-crash-child.ts', import.meta.url));

async function persistSendCount(path: string): Promise<number> {
  let count = 0;
  try { count = Number(await readFile(path, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  count += 1;
  const handle = await open(path, 'w', 0o600);
  try { await handle.writeFile(String(count)); await handle.sync(); }
  finally { await handle.close(); }
  return count;
}

function diskStore(directory: string) {
  return new AtomicJsonRecordStore<Payload, Ack>(
    directory,
    (value): value is Payload => Boolean(value && typeof value === 'object' && 'message' in value),
    (value): value is Ack => Boolean(value && typeof value === 'object' && Reflect.get(value, 'ok') === true),
    { maxRecords: 10, maxBytes: 1_000_000 }
  );
}

function record(key: string, id = 'stable-message-id') {
  const now = Date.now();
  return createReliableRecord<Payload, Ack>({ key, fingerprint: `fingerprint:${key}`, createdAt: now, updatedAt: now,
    state: 'queued', attempts: 0, payload: { message: 'stable-crash-payload' }, ack: { ok: true, id } });
}

function launch(directory: string, mode: string, barrier: string, key: string): {
  child: ChildProcess;
  messages: unknown[];
  waitFor(predicate: (message: unknown) => boolean): Promise<unknown>;
  readSendCount(): Promise<number>;
  killAndWait(): Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
} {
  const child = fork(workerPath, [directory, mode, barrier, key], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc']
  });
  const messages: unknown[] = [];
  const sendCounterPath = join(directory, '.receiver-send-count');
  let sendCountWrite = Promise.resolve();
  const waiters: Array<{ predicate: (message: unknown) => boolean; resolve(value: unknown): void; reject(error: Error): void }> = [];
  let childErrors = '';
  child.stderr?.on('data', chunk => { childErrors += String(chunk); });
  child.on('message', message => {
    messages.push(message);
    if (Reflect.get(message as object, 'type') === 'send')
      sendCountWrite = sendCountWrite.then(async () => { await persistSendCount(sendCounterPath); });
    const index = waiters.findIndex(waiter => waiter.predicate(message));
    if (index >= 0) waiters.splice(index, 1)[0]?.resolve(message);
  });
  return {
    child,
    messages,
    async readSendCount() {
      try { return Number(await readFile(sendCounterPath, 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
    },
    waitFor(predicate) {
      const existing = messages.find(predicate);
      if (existing !== undefined) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex(waiter => waiter.reject === reject);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for child message; stderr=${childErrors}`));
        }, 15_000);
        waiters.push({ predicate, resolve(value) { clearTimeout(timer); resolve(value); }, reject(error) { clearTimeout(timer); reject(error); } });
      });
    },
    async killAndWait() {
      if (child.exitCode !== null || child.signalCode !== null)
        return { code: child.exitCode, signal: child.signalCode };
      const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
      });
      child.kill('SIGKILL');
      const result = await exited;
      await sendCountWrite;
      return result;
    }
  };
}

async function restartAfterOwnedCrash(directory: string) {
  // The harness removes only its own lock after observing the child exit by SIGKILL.
  await unlink(join(directory, '.writer.lock'));
  return diskStore(directory);
}

async function runRestartedRunner(store: ReturnType<typeof diskStore>, now = Date.now(), sendCounterPath?: string) {
  const scheduled: Array<() => Promise<void>> = [];
  let sends = 0;
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver() {
      sends += 1;
      if (sendCounterPath) await persistSendCount(sendCounterPath);
    },
    onState() {},
    defer(work) { scheduled.push(work); },
    now: () => now,
    random: () => 0
  });
  await runner.start();
  return { runner, scheduled, sendCount: () => sends };
}

test('SIGKILL before temp write, after write before sync, and before canonical link never yields a receipt or send', async () => {
  for (const barrier of ['before-write', 'after-write', 'before-link']) {
    const directory = await mkdtemp(join(tmpdir(), `r75-crash-${barrier}-`));
    const key = `M13:${barrier}`;
    const child = launch(directory, 'create', barrier, key);
    try {
      const hit = await child.waitFor(message => Reflect.get(message as object, 'phase') === barrier);
      assert.equal(Reflect.get(hit as object, 'type'), 'barrier');
      assert.deepEqual(await child.killAndWait(), { code: null, signal: 'SIGKILL' });
      assert.equal(child.messages.some(message => Reflect.get(message as object, 'type') === 'receipt-ack'), false);
      const restarted = await restartAfterOwnedCrash(directory);
      try {
        assert.equal((await restarted.list()).length, 0);
        assert.equal((await readdir(join(directory, '.quarantine'))).length, 1);
        assert.equal(await child.readSendCount(), 0);
        await assert.rejects(restarted.create(record(key)), ReliabilityCommitUncertainError);
        const runner = await runRestartedRunner(restarted);
        assert.equal(runner.scheduled.length, 0);
        runner.runner.close();
      } finally { await restarted.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('SIGKILL after canonical link and before directory sync retains exact receipt and resolves matching temp evidence', async () => {
  for (const barrier of ['after-link', 'after-link-before-dir-sync']) {
    const directory = await mkdtemp(join(tmpdir(), `r75-crash-${barrier}-`));
    const key = `M13:${barrier}`;
    const child = launch(directory, 'create', barrier, key);
    try {
      await child.waitFor(message => Reflect.get(message as object, 'phase') === barrier);
      assert.deepEqual(await child.killAndWait(), { code: null, signal: 'SIGKILL' });
      assert.equal(child.messages.some(message => Reflect.get(message as object, 'type') === 'receipt-ack'), false);
      const restarted = await restartAfterOwnedCrash(directory);
      try {
        const listed = await restarted.list();
        assert.equal(listed.length, 1);
        assert.equal(listed[0]?.state, 'queued');
        assert.deepEqual((await restarted.create(record(key, 'different-id'))).record.ack,
          { ok: true, id: 'stable-message-id' });
        if (barrier === 'after-link')
          assert.equal((await readdir(join(directory, '.quarantine'))).some(name => name.includes('-resolved-')), true);
        else assert.equal((await readdir(join(directory, '.quarantine'))).length, 0);
        const recovered = await runRestartedRunner(restarted, Date.now(), join(directory, '.receiver-send-count'));
        assert.equal(recovered.scheduled.length, 1);
        await recovered.scheduled.shift()?.();
        assert.equal(recovered.sendCount(), 1);
        assert.equal(await child.readSendCount(), 1);
        assert.equal((await restarted.get(key))?.payload.message, 'stable-crash-payload');
        assert.equal((await restarted.get(key))?.state, 'delivered');
        recovered.runner.close();
      } finally { await restarted.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('receipt ACK before first attempt is recoverable and attempted-before-emit is conservatively uncertain', async () => {
  for (const barrier of ['before-first-attempt', 'attempting-before-emit']) {
    const directory = await mkdtemp(join(tmpdir(), `r75-crash-${barrier}-`));
    const key = `M13:${barrier}`;
    const child = launch(directory, 'runner', barrier, key);
    try {
      const ack = await child.waitFor(message => Reflect.get(message as object, 'type') === 'receipt-ack');
      assert.deepEqual(Reflect.get(ack as object, 'ack'), { ok: true, id: 'stable-message-id' });
      await child.waitFor(message => Reflect.get(message as object, 'phase') === barrier);
      assert.deepEqual(await child.killAndWait(), { code: null, signal: 'SIGKILL' });
      const restarted = await restartAfterOwnedCrash(directory);
      try {
        const state = (await restarted.get(key))?.state;
        const recovery = await runRestartedRunner(restarted, Date.now(), join(directory, '.receiver-send-count'));
        if (barrier === 'before-first-attempt') {
          assert.equal(state, 'queued');
          assert.equal(recovery.scheduled.length, 1);
          await recovery.scheduled.shift()?.();
          assert.equal(recovery.sendCount(), 1);
          assert.equal(await child.readSendCount(), 1);
          assert.equal((await restarted.get(key))?.state, 'delivered');
        } else {
          assert.equal(state, 'attempting');
          assert.equal((await restarted.get(key))?.attempts, 1);
          assert.equal((await restarted.get(key))?.state, 'uncertain');
          assert.equal(recovery.scheduled.length, 0);
          assert.equal(recovery.sendCount(), 0);
          assert.equal(await child.readSendCount(), 0);
        }
        recovery.runner.close();
      } finally { await restarted.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('SIGKILL after remote side effect or positive ACK before state commit never replays the operation', async () => {
  for (const barrier of ['after-emit-before-ack', 'before-delivered-rename']) {
    const directory = await mkdtemp(join(tmpdir(), `r75-crash-${barrier}-`));
    const key = `M13:${barrier}`;
    const child = launch(directory, 'runner', barrier, key);
    try {
      await child.waitFor(message => Reflect.get(message as object, 'type') === 'receipt-ack');
      const event = barrier === 'after-emit-before-ack' ? 'after-emit-before-ack' : 'before-delivered-rename';
      if (barrier === 'after-emit-before-ack') {
        await child.waitFor(message => Reflect.get(message as object, 'type') === 'send');
        await child.waitFor(message => Reflect.get(message as object, 'phase') === event);
        assert.equal(child.messages.some(message => Reflect.get(message as object, 'type') === 'peer-ack'), false);
      } else {
        await child.waitFor(message => Reflect.get(message as object, 'type') === 'peer-ack');
        await child.waitFor(message => Reflect.get(message as object, 'phase') === event);
      }
      assert.deepEqual(await child.killAndWait(), { code: null, signal: 'SIGKILL' });
      assert.equal(child.messages.filter(message => Reflect.get(message as object, 'type') === 'send').length,
        barrier === 'after-emit-before-ack' ? 1 : 1);
      assert.equal(await child.readSendCount(), 1);
      const restarted = await restartAfterOwnedCrash(directory);
      try {
        const recovery = await runRestartedRunner(restarted);
        if (barrier === 'after-emit-before-ack')
          assert.equal((await restarted.get(key))?.state, 'uncertain');
        else {
          assert.equal(await restarted.get(key), undefined);
          assert.equal((await restarted.list()).length, 0);
          assert.ok((await readdir(join(directory, '.quarantine'))).length > 0);
        }
        assert.equal(recovery.scheduled.length, 0);
        assert.equal(recovery.sendCount(), 0);
        assert.equal(await child.readSendCount(), 1);
        recovery.runner.close();
      } finally { await restarted.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('SIGKILL after delivered rename preserves terminal state; retryable due metadata and stale locks remain conservative', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'r75-crash-delivered-rename-'));
  const key = 'M13:delivered-rename';
  const child = launch(directory, 'runner', 'after-delivered-rename', key);
  try {
    await child.waitFor(message => Reflect.get(message as object, 'type') === 'receipt-ack');
    await child.waitFor(message => Reflect.get(message as object, 'type') === 'peer-ack');
    await child.waitFor(message => Reflect.get(message as object, 'phase') === 'after-delivered-rename');
    assert.deepEqual(await child.killAndWait(), { code: null, signal: 'SIGKILL' });
    const locked = diskStore(directory);
    await assert.rejects(locked.initialize(), ReliabilityWriterLockError);
    const restarted = await restartAfterOwnedCrash(directory);
    try {
      assert.equal((await restarted.get(key))?.state, 'delivered');
      const recovery = await runRestartedRunner(restarted, Date.now(), join(directory, '.receiver-send-count'));
      assert.equal(recovery.scheduled.length, 0);
      assert.equal(recovery.sendCount(), 0);
      assert.equal(await child.readSendCount(), 1);
      recovery.runner.close();

      const retryKey = 'M13:future-retry';
      const retryRecord = createReliableRecord<Payload, Ack>({
        key: retryKey, fingerprint: `fingerprint:${retryKey}`, createdAt: Date.now(), updatedAt: Date.now(),
        state: 'retryable', attempts: 2, nextAttemptAt: Date.now() + 60_000,
        payload: { message: 'retry-payload' }, ack: { ok: true, id: 'retry-id' }
      });
      await restarted.create(retryRecord);
      const future = await runRestartedRunner(restarted);
      assert.equal(future.scheduled.length, 0);
      assert.equal((await restarted.get(retryKey))?.attempts, 2);
      assert.ok((await restarted.get(retryKey))?.nextAttemptAt);
      future.runner.close();
    } finally { await restarted.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('SIGKILL preserves retry timing and terminal dedupe records without scheduling them', async () => {
  for (const state of ['retryable', 'delivered', 'failed', 'uncertain'] as const) {
    const directory = await mkdtemp(join(tmpdir(), `r75-crash-state-${state}-`));
    const key = `M13:state-${state}`;
    const child = launch(directory, state === 'retryable' ? 'retryable' : 'terminal', state, key);
    try {
      const receipt = await child.waitFor(message => Reflect.get(message as object, 'type') === 'receipt-ack');
      assert.deepEqual(Reflect.get(receipt as object, 'ack'), { ok: true, id: 'stable-message-id' });
      assert.deepEqual(await child.killAndWait(), { code: null, signal: 'SIGKILL' });
      const restarted = await restartAfterOwnedCrash(directory);
      try {
        const recovery = await runRestartedRunner(restarted, Date.now(), join(directory, '.receiver-send-count'));
        const recovered = await restarted.get(key);
        assert.equal(recovered?.state, state);
        assert.deepEqual((await restarted.create(record(key, 'replacement-id'))).record.ack,
          { ok: true, id: 'stable-message-id' });
        assert.equal(recovery.scheduled.length, 0);
        assert.equal(recovery.sendCount(), 0);
        assert.equal(await child.readSendCount(), 0);
        if (state === 'retryable') {
          assert.equal(recovered?.attempts, 2);
          assert.ok((recovered?.nextAttemptAt ?? 0) > Date.now());
        }
        recovery.runner.close();
      } finally { await restarted.close(); }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
});

test('two live child writers cannot share one state directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'r75-two-writers-'));
  const child = launch(directory, 'hold-lock', '', 'unused');
  try {
    await child.waitFor(message => Reflect.get(message as object, 'type') === 'lock-held');
    const contender = diskStore(directory);
    await assert.rejects(contender.initialize(), ReliabilityWriterLockError);
    assert.deepEqual(await child.killAndWait(), { code: null, signal: 'SIGKILL' });
    const stale = diskStore(directory);
    await assert.rejects(stale.initialize(), ReliabilityWriterLockError);
    const recovered = await restartAfterOwnedCrash(directory);
    await recovered.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('directory aliases still encounter the exclusive writer lock', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'r75-directory-alias-'));
  const alias = join(tmpdir(), `r75-directory-alias-link-${process.pid}-${Date.now()}`);
  await symlink(directory, alias, 'dir');
  const first = diskStore(directory);
  const second = diskStore(alias);
  try {
    await first.initialize();
    await assert.rejects(second.initialize(), ReliabilityWriterLockError);
  } finally {
    await Promise.all([first.close(), second.close()]);
    await rm(alias, { force: true });
    await rm(directory, { recursive: true, force: true });
  }
});

test('partial application startup failure releases the store that started successfully', async () => {
  const taskDirectory = await mkdtemp(join(tmpdir(), 'r75-startup-task-'));
  const selectionDirectory = await mkdtemp(join(tmpdir(), 'r75-startup-selection-'));
  const priorTaskDirectory = process.env.AS_TASK_STORE_DIR;
  const priorSelectionDirectory = process.env.AS_SELECTION_STORE_DIR;
  process.env.AS_TASK_STORE_DIR = taskDirectory;
  process.env.AS_SELECTION_STORE_DIR = selectionDirectory;
  const staleLock = join(selectionDirectory, '.r7.5-outbox', '.writer.lock');
  await mkdir(join(selectionDirectory, '.r7.5-outbox'), { recursive: true });
  const staleHandle = await open(staleLock, 'wx', 0o600);
  await staleHandle.writeFile(JSON.stringify({ pid: -1, startedAt: 0 }));
  await staleHandle.close();
  const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
  try {
    let startupError: unknown;
    try { await app.listen(0); }
    catch (error) { startupError = error; }
    assert.ok(startupError instanceof Error, 'startup should reject after partial runner acquisition');
    const startupCause = startupError instanceof AggregateError ? startupError.cause : startupError;
    assert.ok(startupCause instanceof Error);
    assert.equal(startupCause.name, 'ReliabilityWriterLockError');
    await app.close();
    await assert.rejects(access(join(taskDirectory, '.r7.5-outbox', '.writer.lock')), { code: 'ENOENT' });
    await access(staleLock);
    assert.equal(app.httpServer.listening, false);
  } finally {
    await app.close().catch(() => undefined);
    if (priorTaskDirectory === undefined) delete process.env.AS_TASK_STORE_DIR;
    else process.env.AS_TASK_STORE_DIR = priorTaskDirectory;
    if (priorSelectionDirectory === undefined) delete process.env.AS_SELECTION_STORE_DIR;
    else process.env.AS_SELECTION_STORE_DIR = priorSelectionDirectory;
    await rm(taskDirectory, { recursive: true, force: true });
    await rm(selectionDirectory, { recursive: true, force: true });
  }
});
