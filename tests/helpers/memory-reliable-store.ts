import type {
  ReliableDeliveryState, ReliableRecord, ReliableRecordStore
} from '../../src/shared/persistence/atomic-json-record-store.js';
import { createReliableRecord } from '../../src/shared/persistence/atomic-json-record-store.js';

export class MemoryReliableRecordStore<TPayload, TAck> implements ReliableRecordStore<TPayload, TAck> {
  private readonly records = new Map<string, ReliableRecord<TPayload, TAck>>();

  async initialize(): Promise<void> {}
  async get(key: string): Promise<ReliableRecord<TPayload, TAck> | undefined> { return this.records.get(key); }
  async list(): Promise<ReliableRecord<TPayload, TAck>[]> { return [...this.records.values()].sort((a, b) => a.createdAt - b.createdAt); }
  async create(record: ReliableRecord<TPayload, TAck>): Promise<{ record: ReliableRecord<TPayload, TAck>; created: boolean }> {
    const existing = this.records.get(record.key);
    if (existing) return { record: existing, created: false };
    this.records.set(record.key, record);
    return { record, created: true };
  }
  async transition(key: string, state: ReliableDeliveryState,
    changes: { attempts?: number; nextAttemptAt?: number; lastError?: string; clearNextAttempt?: boolean } = {}): Promise<ReliableRecord<TPayload, TAck>> {
    const current = this.records.get(key);
    if (!current) throw new Error(`Missing memory record ${key}`);
    const { checksum: _checksum, ...base } = current;
    const next = createReliableRecord({
      ...base, state, updatedAt: Date.now(), attempts: changes.attempts ?? current.attempts,
      ...(changes.clearNextAttempt ? {} : changes.nextAttemptAt === undefined
        ? ('nextAttemptAt' in current ? { nextAttemptAt: current.nextAttemptAt } : {})
        : { nextAttemptAt: changes.nextAttemptAt }),
      ...(changes.lastError === undefined ? ('lastError' in current ? { lastError: current.lastError } : {}) : { lastError: changes.lastError })
    });
    this.records.set(key, next);
    return next;
  }
  async close(): Promise<void> {}
}
