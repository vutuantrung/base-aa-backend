import { AtomicJsonRecordStore, createReliableRecord, type AtomicJsonRecordStoreHooks } from '../../src/shared/persistence/atomic-json-record-store.js';
import { ReliableOutboxRunner } from '../../src/shared/persistence/reliable-outbox-runner.js';

interface Payload { readonly message: string }
interface Ack { readonly ok: true; readonly id: string }

const directory = process.argv[2];
const mode = process.argv[3];
const barrier = process.argv[4];
const key = process.argv[5] ?? 'M13:crash-case';
if (!directory || !mode) throw new Error('directory and mode are required');

function send(message: unknown): void { process.send?.(message); }

function stopAt(phase: string): Promise<void> {
  send({ type: 'barrier', phase });
  return new Promise(resolve => {
    const receive = (message: unknown) => {
      if (message && typeof message === 'object' && Reflect.get(message, 'type') === 'release') {
        process.off('message', receive);
        resolve();
      }
    };
    process.on('message', receive);
  });
}

let updateSyncCount = 0;
let renameCount = 0;
const hooks: AtomicJsonRecordStoreHooks = {
  async beforeOperation(operation) {
    if (barrier === 'before-write' && operation === 'write') await stopAt('before-write');
    if (barrier === 'before-link' && operation === 'hard-link') await stopAt('before-link');
    if (barrier === 'before-delivered-rename' && operation === 'rename' && ++renameCount === 2)
      await stopAt('before-delivered-rename');
  },
  async afterOperation(operation) {
    if (barrier === 'after-write' && operation === 'write') await stopAt('after-write');
    if (barrier === 'after-link' && operation === 'hard-link') await stopAt('after-link');
    if (barrier === 'after-delivered-rename' && operation === 'rename' && ++renameCount === 2)
      await stopAt('after-delivered-rename');
  },
  async syncDirectory(_path, context) {
    if (context === 'record update') updateSyncCount += 1;
    if (barrier === 'after-link-before-dir-sync' && context === 'canonical publication')
      await stopAt('after-link-before-dir-sync');
    if (barrier === 'attempting-before-emit' && context === 'record update' && updateSyncCount === 1)
      await stopAt('attempting-before-emit');
    if (barrier === 'after-delivered-ack' && context === 'record update' && updateSyncCount === 2)
      await stopAt('after-delivered-ack');
  }
};

const store = new AtomicJsonRecordStore<Payload, Ack>(
  directory,
  (value): value is Payload => Boolean(value && typeof value === 'object' && 'message' in value),
  (value): value is Ack => Boolean(value && typeof value === 'object' && Reflect.get(value, 'ok') === true),
  { maxRecords: 10, maxBytes: 1_000_000 }, hooks
);

function newRecord() {
  const now = Date.now();
  return createReliableRecord<Payload, Ack>({
    key, fingerprint: `fingerprint:${key}`, createdAt: now, updatedAt: now,
    state: 'queued', attempts: 0, payload: { message: 'stable-crash-payload' }, ack: { ok: true, id: 'stable-message-id' }
  });
}

if (mode === 'create') {
  await store.create(newRecord());
  send({ type: 'receipt-ack', ack: (await store.get(key))?.ack });
} else if (mode === 'retryable') {
  await store.create(newRecord());
  await store.transition(key, 'retryable', {
    attempts: 2, nextAttemptAt: Date.now() + 60_000, lastError: 'Known unsent before invocation'
  });
  send({ type: 'receipt-ack', ack: (await store.get(key))?.ack });
} else if (mode === 'terminal') {
  await store.create(newRecord());
  if (barrier === 'delivered') {
    await store.transition(key, 'attempting', { attempts: 1 });
    await store.transition(key, 'delivered');
  } else if (barrier === 'failed' || barrier === 'uncertain') await store.transition(key, barrier);
  else throw new Error(`Unsupported terminal state: ${barrier}`);
  send({ type: 'receipt-ack', ack: (await store.get(key))?.ack });
} else if (mode === 'runner') {
  await store.create(newRecord());
  send({ type: 'receipt-ack', ack: (await store.get(key))?.ack });
  const runner = new ReliableOutboxRunner(store, {
    isReady: () => true,
    async deliver(payload) {
      send({ type: 'send', payload });
      if (barrier === 'after-emit-before-ack') await stopAt('after-emit-before-ack');
      else send({ type: 'peer-ack', ok: true });
    },
    onState() {},
    defer(work) {
      if (barrier === 'before-first-attempt') void stopAt('before-first-attempt').then(work);
      else setImmediate(() => { void work(); });
    }
  });
  await runner.start();
} else if (mode === 'hold-lock') {
  await store.initialize();
  send({ type: 'lock-held' });
}

process.on('message', () => undefined);
