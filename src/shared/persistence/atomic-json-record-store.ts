import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type ReliableDeliveryState = 'queued' | 'attempting' | 'retryable' | 'delivered' | 'failed' | 'uncertain';

export interface ReliableRecord<TPayload = unknown, TAck = unknown> {
  readonly formatVersion: 1;
  readonly key: string;
  readonly fingerprint: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly state: ReliableDeliveryState;
  readonly attempts: number;
  readonly nextAttemptAt?: number;
  readonly lastError?: string;
  readonly payload: TPayload;
  readonly ack: TAck;
  readonly checksum: string;
}

export interface ReliabilityLimits {
  readonly maxRecords: number;
  readonly maxBytes: number;
}

export interface AtomicJsonRecordStoreHooks {
  readonly beforeOperation?: (operation: 'write' | 'file-sync' | 'file-close' | 'hard-link' | 'rename', path: string) => Promise<void>;
  readonly syncDirectory?: (directory: string, context: string) => Promise<void>;
}

export interface ReliableRecordStore<TPayload, TAck> {
  initialize(): Promise<void>;
  get(key: string): Promise<ReliableRecord<TPayload, TAck> | undefined>;
  list(): Promise<ReliableRecord<TPayload, TAck>[]>;
  create(record: ReliableRecord<TPayload, TAck>): Promise<{ record: ReliableRecord<TPayload, TAck>; created: boolean }>;
  transition(key: string, state: ReliableDeliveryState,
    changes?: { attempts?: number; nextAttemptAt?: number; lastError?: string; clearNextAttempt?: boolean }): Promise<ReliableRecord<TPayload, TAck>>;
  close(preserveLock?: boolean): Promise<void>;
}

export const DEFAULT_RELIABILITY_LIMITS: ReliabilityLimits = {
  maxRecords: 10_000,
  maxBytes: 256 * 1024 * 1024
};

export class ReliabilityCapacityError extends Error {
  constructor() {
    super('Reliability queue capacity is full');
    this.name = 'ReliabilityCapacityError';
  }
}

export class ReliabilityWriterLockError extends Error {
  constructor(readonly directory: string) {
    super(`Reliability state directory is locked: ${directory}; verify the owning process before removing .writer.lock`);
    this.name = 'ReliabilityWriterLockError';
  }
}

export class ReliabilityCommitUncertainError extends Error {
  constructor(message = 'Reliability record publication is uncertain; operator reconciliation is required') {
    super(message);
    this.name = 'ReliabilityCommitUncertainError';
  }
}

const allowedTransitions: Record<ReliableDeliveryState, readonly ReliableDeliveryState[]> = {
  queued: ['attempting', 'retryable', 'failed', 'uncertain'],
  attempting: ['delivered', 'retryable', 'failed', 'uncertain'],
  retryable: ['attempting', 'failed', 'uncertain'],
  delivered: [],
  failed: [],
  uncertain: []
};

const processWriters = new Map<string, { handle: Awaited<ReturnType<typeof open>>; references: number }>();
const processKeyQueues = new Map<string, Promise<void>>();

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function fingerprintReliableValue(value: unknown): string {
  return digest(stableJson(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('Reliability records must contain JSON values');
  return serialized;
}

function checksumFor<TPayload, TAck>(record: Omit<ReliableRecord<TPayload, TAck>, 'checksum'>): string {
  return digest(stableJson(record));
}

export function createReliableRecord<TPayload, TAck>(
  record: Omit<ReliableRecord<TPayload, TAck>, 'formatVersion' | 'checksum'>
): ReliableRecord<TPayload, TAck> {
  const checked = { formatVersion: 1 as const, ...record };
  return { ...checked, checksum: checksumFor(checked) };
}

/** Atomic, collision-safe JSON record storage for a single active process writer. */
export class AtomicJsonRecordStore<TPayload, TAck> implements ReliableRecordStore<TPayload, TAck> {
  private readonly directory: string;
  private readonly quarantineDirectory: string;
  private readonly records = new Map<string, ReliableRecord<TPayload, TAck>>();
  private readonly recordSizes = new Map<string, number>();
  private readonly blockedHashes = new Set<string>();
  private quarantinedRecords = 0;
  private quarantinedBytes = 0;
  private writerKey: string | undefined;
  private initialized: Promise<void> | undefined;
  private closed = false;

  constructor(
    directory: string,
    private readonly isPayload: (value: unknown) => value is TPayload,
    private readonly isAck: (value: unknown) => value is TAck,
    private readonly limits: ReliabilityLimits = DEFAULT_RELIABILITY_LIMITS,
    private readonly hooks: AtomicJsonRecordStoreHooks = {}
  ) {
    this.directory = resolve(directory);
    this.quarantineDirectory = join(this.directory, '.quarantine');
  }

  async initialize(): Promise<void> {
    if (!this.initialized) this.initialized = this.initializeDirectory();
    await this.initialized;
  }

  private async initializeDirectory(): Promise<void> {
    if (this.closed) throw new Error('Reliability record store is closed');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      const activeWriter = processWriters.get(this.directory);
      if (activeWriter) activeWriter.references += 1;
      else {
        const handle = await open(join(this.directory, '.writer.lock'), 'wx', 0o600);
        try {
          await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
          await handle.sync();
          processWriters.set(this.directory, { handle, references: 1 });
        } catch (error) {
          await handle.close();
          await unlink(join(this.directory, '.writer.lock')).catch(() => undefined);
          throw error;
        }
      }
      this.writerKey = this.directory;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ReliabilityWriterLockError(this.directory);
      throw error;
    }
    try {
      await mkdir(this.quarantineDirectory, { recursive: true, mode: 0o700 });
      await this.loadQuarantineKeys();
      const files = await readdir(this.directory);
      const temporaryFiles = files.filter(name => name.endsWith('.tmp'));
      for (const name of files.filter(item => /^[0-9a-f]{64}\.json$/.test(item))) {
        const path = join(this.directory, name);
        try {
          const raw = await readFile(path, 'utf8');
          const parsed: unknown = JSON.parse(raw);
          if (!this.isReliableRecord(parsed) || digest(parsed.key) !== name.slice(0, -'.json'.length))
            throw new Error('record schema, filename, or checksum invalid');
          this.records.set(parsed.key, parsed);
          this.recordSizes.set(parsed.key, Buffer.byteLength(raw));
        } catch (error) {
          await this.quarantine(path, error instanceof Error ? error.message : 'invalid record');
        }
      }
      for (const name of temporaryFiles) await this.reconcileTemporary(join(this.directory, name));
      await this.syncDirectory('startup');
    } catch (error) {
      await this.releaseWriter();
      throw error;
    }
  }

  private isReliableRecord(value: unknown): value is ReliableRecord<TPayload, TAck> {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<ReliableRecord<TPayload, TAck>>;
    if (record.formatVersion !== 1 || typeof record.key !== 'string' || typeof record.fingerprint !== 'string' ||
        typeof record.createdAt !== 'number' || typeof record.updatedAt !== 'number' ||
        !['queued', 'attempting', 'retryable', 'delivered', 'failed', 'uncertain'].includes(String(record.state)) ||
        !Number.isInteger(record.attempts) || !this.isPayload(record.payload) || !this.isAck(record.ack) ||
        typeof record.checksum !== 'string') return false;
    const { checksum, ...withoutChecksum } = record as ReliableRecord<TPayload, TAck>;
    return checksumFor(withoutChecksum) === checksum;
  }

  async get(key: string): Promise<ReliableRecord<TPayload, TAck> | undefined> {
    await this.initialize();
    const canonical = await this.readCanonical(key);
    if (canonical) this.records.set(key, canonical);
    return canonical;
  }

  async list(): Promise<ReliableRecord<TPayload, TAck>[]> {
    await this.initialize();
    await this.reloadCanonicalRecords();
    return [...this.records.values()].sort((left, right) => left.createdAt - right.createdAt || left.key.localeCompare(right.key));
  }

  private async reloadCanonicalRecords(): Promise<void> {
    const files = await readdir(this.directory);
    for (const name of files.filter(item => /^[0-9a-f]{64}\.json$/.test(item))) {
      const path = join(this.directory, name);
      try {
        const raw = await readFile(path, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (!this.isReliableRecord(parsed) || digest(parsed.key) !== name.slice(0, -'.json'.length))
          throw new Error('record schema, filename, or checksum invalid');
        this.records.set(parsed.key, parsed);
        this.recordSizes.set(parsed.key, Buffer.byteLength(raw));
      } catch (error) {
        await this.quarantine(path, error instanceof Error ? error.message : 'invalid record');
      }
    }
  }

  private async loadQuarantineKeys(): Promise<void> {
    const files = await readdir(this.quarantineDirectory);
    for (const name of files) {
      this.quarantinedRecords += 1;
      this.quarantinedBytes += (await stat(join(this.quarantineDirectory, name))).size;
      if (name.includes('-resolved-')) continue;
      const filenameHash = name.match(/(?:^|[-.])([0-9a-f]{64})(?:[-.]|$)/)?.[1];
      if (filenameHash) this.blockedHashes.add(filenameHash);
      try {
        const value: unknown = JSON.parse(await readFile(join(this.quarantineDirectory, name), 'utf8'));
        if (value && typeof value === 'object' && 'key' in value && typeof value.key === 'string')
          this.blockedHashes.add(digest(value.key));
      } catch { /* malformed quarantined content remains visible and is never replayed */ }
    }
  }

  private async reconcileTemporary(path: string): Promise<void> {
    try {
      const value: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (this.isReliableRecord(value)) {
        const canonical = await this.readCanonical(value.key);
        if (canonical?.checksum === value.checksum) {
          await this.quarantine(path, 'temporary link already has a matching canonical record', false);
          return;
        }
      }
    } catch { /* incomplete temporary data is quarantined below */ }
    await this.quarantine(path, 'incomplete or conflicting temporary record');
  }

  async create(record: ReliableRecord<TPayload, TAck>): Promise<{ record: ReliableRecord<TPayload, TAck>; created: boolean }> {
    await this.initialize();
    return this.withKeyLock('__capacity__', () => this.withKeyLock(record.key, async () => {
      if (this.blockedHashes.has(digest(record.key))) throw new ReliabilityCommitUncertainError();
      const existing = this.records.get(record.key) ?? await this.readCanonical(record.key);
      if (existing) return { record: existing, created: false };
      await this.reloadCanonicalRecords();
      const serialized = `${JSON.stringify(record, null, 2)}\n`;
      const size = Buffer.byteLength(serialized);
      if (this.records.size + this.quarantinedRecords >= this.limits.maxRecords ||
          this.totalBytes() + this.quarantinedBytes + size > this.limits.maxBytes)
        throw new ReliabilityCapacityError();
      const target = this.recordPath(record.key);
      const temporary = `${target}.${randomUUID()}.tmp`;
      await this.writeAndSyncTemporary(temporary, serialized);
      try {
        // link() creates the canonical name atomically and fails with EEXIST; rename() would overwrite.
        await this.hooks.beforeOperation?.('hard-link', temporary);
        await link(temporary, target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          const winner = await this.readCanonical(record.key);
          if (winner) {
            await this.quarantine(temporary, 'canonical publication collision resolved by existing record', false);
            return { record: winner, created: false };
          }
        }
        await this.quarantine(temporary, 'canonical publication collision');
        throw error;
      }
      try { await unlink(temporary); }
      catch (error) {
        console.warn('[AAB] RELIABILITY TEMPORARY LINK CLEANUP FAILED', temporary.split(/[\\/]/).at(-1),
          error instanceof Error ? error.message : 'unknown');
      }
      this.records.set(record.key, record);
      this.recordSizes.set(record.key, size);
      try { await this.syncDirectory('canonical publication'); }
      catch (error) {
        try {
          const { formatVersion: _formatVersion, checksum: _checksum, ...base } = record;
          const uncertain = createReliableRecord({
            ...base, updatedAt: Date.now(), state: 'uncertain' as const,
            lastError: 'Canonical publication directory sync failed; awaiting operator reconciliation'
          });
          await this.replaceCanonical(uncertain);
          await this.syncDirectory('uncertain commit reconciliation');
        } catch {
          this.blockedHashes.add(digest(record.key));
          await this.quarantine(target, 'canonical publication sync uncertain; replay blocked');
          this.records.delete(record.key);
          this.recordSizes.delete(record.key);
        }
        throw new ReliabilityCommitUncertainError(error instanceof Error ? error.message : undefined);
      }
      return { record, created: true };
    }));
  }

  async transition(
    key: string,
    state: ReliableDeliveryState,
    changes: { attempts?: number; nextAttemptAt?: number; lastError?: string; clearNextAttempt?: boolean } = {}
  ): Promise<ReliableRecord<TPayload, TAck>> {
    await this.initialize();
    return this.withKeyLock(key, async () => {
      const current = await this.readCanonical(key);
      if (!current) throw new Error(`Reliability record not found: ${key}`);
      if (state !== current.state && !allowedTransitions[current.state].includes(state))
        throw new Error(`Invalid reliability transition ${current.state} -> ${state}`);
      const { checksum: _checksum, ...base } = current;
      const nextBase = {
        ...base,
        updatedAt: Date.now(), state,
        attempts: changes.attempts ?? current.attempts,
        ...(changes.clearNextAttempt ? {} : changes.nextAttemptAt === undefined
          ? ('nextAttemptAt' in current ? { nextAttemptAt: current.nextAttemptAt } : {})
          : { nextAttemptAt: changes.nextAttemptAt }),
        ...(changes.lastError === undefined ? ('lastError' in current ? { lastError: current.lastError } : {}) : { lastError: changes.lastError })
      };
      const updated = createReliableRecord(nextBase);
      await this.replaceCanonical(updated);
      try { await this.syncDirectory('record update'); }
      catch (error) {
        if (state !== 'delivered') throw error;
        const { formatVersion: _formatVersion, checksum: _checksum, ...base } = updated;
        const uncertain = createReliableRecord({
          ...base, state: 'uncertain',
          lastError: 'Peer ACK was received but delivered-state publication is uncertain'
        });
        try {
          await this.replaceCanonical(uncertain);
          await this.syncDirectory('uncertain delivery-state reconciliation');
          return uncertain;
        } catch (reconciliationError) {
          this.blockedHashes.add(digest(key));
          await this.quarantine(this.recordPath(key), 'delivered-state sync uncertain; replay blocked');
          this.records.delete(key);
          this.recordSizes.delete(key);
          throw new ReliabilityCommitUncertainError(
            reconciliationError instanceof Error ? reconciliationError.message : undefined
          );
        }
      }
      return updated;
    });
  }

  private async replaceCanonical(record: ReliableRecord<TPayload, TAck>): Promise<void> {
    const serialized = `${JSON.stringify(record, null, 2)}\n`;
    const target = this.recordPath(record.key);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await this.writeAndSyncTemporary(temporary, serialized);
    try {
      await this.hooks.beforeOperation?.('rename', temporary);
      await rename(temporary, target);
    } catch (error) {
      await this.quarantine(temporary, 'atomic state replacement failed');
      throw error;
    }
    this.records.set(record.key, record);
    this.recordSizes.set(record.key, Buffer.byteLength(serialized));
  }

  private recordPath(key: string): string {
    return join(this.directory, `${digest(key)}.json`);
  }

  private async writeAndSyncTemporary(path: string, serialized: string): Promise<void> {
    const handle = await open(path, 'wx', 0o600);
    try {
      await this.hooks.beforeOperation?.('write', path);
      await handle.writeFile(serialized);
      await this.hooks.beforeOperation?.('file-sync', path);
      await handle.sync();
      await handle.close();
      await this.hooks.beforeOperation?.('file-close', path);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await this.quarantine(path, 'temporary record write, sync, or close failed');
      throw error;
    }
  }

  private totalBytes(): number {
    return [...this.recordSizes.values()].reduce((total, size) => total + size, 0);
  }

  private async readCanonical(key: string): Promise<ReliableRecord<TPayload, TAck> | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(this.recordPath(key), 'utf8'));
      return this.isReliableRecord(value) ? value : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  private async withKeyLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    const lockKey = `${this.directory}\0${key}`;
    const previous = processKeyQueues.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolveLock => { release = resolveLock; });
    const queued = previous.then(() => current);
    processKeyQueues.set(lockKey, queued);
    await previous;
    try { return await action(); }
    finally {
      release();
      if (processKeyQueues.get(lockKey) === queued) processKeyQueues.delete(lockKey);
    }
  }

  private async quarantine(path: string, reason: string, blockKey = true): Promise<void> {
    await mkdir(this.quarantineDirectory, { recursive: true, mode: 0o700 });
    const originalName = path.split(/[\\/]/).at(-1) ?? 'record';
    const hashFromName = originalName.match(/^([0-9a-f]{64})/)?.[1];
    if (blockKey && hashFromName) this.blockedHashes.add(hashFromName);
    if (originalName.endsWith('.json') && hashFromName) {
      for (const key of this.records.keys()) {
        if (digest(key) === hashFromName) {
          this.records.delete(key);
          this.recordSizes.delete(key);
        }
      }
    }
    let size = 0;
    try {
      const value: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (blockKey && value && typeof value === 'object' && 'key' in value && typeof value.key === 'string')
        this.blockedHashes.add(digest(value.key));
    } catch { /* partial temporary data has no parseable key */ }
    try { size = (await stat(path)).size; } catch { /* file may already be gone */ }
    const target = join(this.quarantineDirectory,
      `${Date.now()}-${randomUUID()}-${blockKey ? '' : 'resolved-'}${originalName}`);
    try {
      await rename(path, target);
      this.quarantinedRecords += 1;
      this.quarantinedBytes += size;
      console.error('[AAB] RELIABILITY RECORD QUARANTINED', target.split(/[\\/]/).at(-1), reason);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async syncDirectory(context: string): Promise<void> {
    if (this.hooks.syncDirectory) {
      await this.hooks.syncDirectory(this.directory, context);
      return;
    }
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(this.directory, 'r');
      await handle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const knownUnsupported = code === 'EINVAL' || code === 'ENOTSUP' || code === 'EOPNOTSUPP' || code === 'EBADF' ||
        (process.platform === 'win32' && (code === 'EISDIR' || code === 'EPERM'));
      if (knownUnsupported) {
        console.warn('[AAB] RELIABILITY DIRECTORY SYNC UNSUPPORTED', context, code);
        return;
      }
      throw error;
    } finally {
      await handle?.close();
    }
  }

  async close(preserveLock = false): Promise<void> {
    if (this.closed) return;
    try { await this.initialized; } catch { /* failed initialization already released its lock */ }
    this.closed = true;
    await this.releaseWriter(preserveLock);
  }

  private async releaseWriter(preserveLock = false): Promise<void> {
    if (!this.writerKey) return;
    const activeWriter = processWriters.get(this.writerKey);
    if (!activeWriter) return;
    activeWriter.references -= 1;
    if (activeWriter.references > 0) return;
    await activeWriter.handle.close();
    processWriters.delete(this.writerKey);
    if (preserveLock) {
      console.error('[AAB] RELIABILITY WRITER LOCK PRESERVED', this.directory);
      this.writerKey = undefined;
      return;
    }
    try { await unlink(join(this.directory, '.writer.lock')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await this.syncDirectory('writer lock removal');
    this.writerKey = undefined;
  }
}
