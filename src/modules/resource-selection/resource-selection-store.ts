import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import type { PeerMessage, PeerMessageAck } from '../peer-messaging/contracts.js';
import { AtomicJsonRecordStore, type ReliabilityLimits, type ReliableRecord } from '../../shared/persistence/atomic-json-record-store.js';

export const resourceSelectionSchema = z.object({
  browserProfileId: z.string().trim().min(1).max(150),
  proxyId: z.string().trim().min(1).max(150),
  accountId: z.string().trim().min(1).max(150)
}).strict();

export type ResourceSelection = z.infer<typeof resourceSelectionSchema>;
export type SelectionDeliveryStatus = 'pending' | 'forwarded' | 'forwardFailed';
export type StoredSelection = {
  id: string;
  createdTime: number;
  selection: ResourceSelection;
  deliveryStatus: SelectionDeliveryStatus;
  deliveryError?: string;
};

export interface SelectionOperationPayload {
  record: StoredSelection;
  outbound: PeerMessage;
}

function isSelectionOperationPayload(value: unknown): value is SelectionOperationPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<SelectionOperationPayload>;
  return Boolean(payload.record && typeof payload.record === 'object' &&
    resourceSelectionSchema.safeParse(payload.record.selection).success &&
    payload.outbound && typeof payload.outbound === 'object');
}

function isPeerMessageAck(value: unknown): value is PeerMessageAck {
  return Boolean(value && typeof value === 'object' && 'ok' in value &&
    ((value as { ok: unknown }).ok === true || (value as { ok: unknown }).ok === false));
}

export interface ResourceSelectionStore {
  save(selection: ResourceSelection): Promise<StoredSelection>;
  updateDelivery(id: string, status: SelectionDeliveryStatus, reason?: string): Promise<void>;
  listRecent(limit?: number): Promise<StoredSelection[]>;
}

/**
 * Durable one-file-per-submission receipt. A separate status sidecar keeps
 * the original submission immutable while tracking best-effort delivery.
 */
export class JsonResourceSelectionStore implements ResourceSelectionStore {
  private readonly directory: string;
  readonly reliability: AtomicJsonRecordStore<SelectionOperationPayload, PeerMessageAck>;

  constructor(directory = process.env.AAB_SELECTION_STORE_DIR ?? './data/resource-selections', limits?: ReliabilityLimits) {
    this.directory = resolve(directory);
    this.reliability = new AtomicJsonRecordStore(
      join(this.directory, '.r7.5-outbox'), isSelectionOperationPayload, isPeerMessageAck, limits
    );
  }

  private receiptPath(id: string): string {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid selection ID');
    return join(this.directory, id + '.json');
  }

  private statusPath(id: string): string {
    this.receiptPath(id);
    return join(this.directory, id + '.delivery.json');
  }

  async save(selection: ResourceSelection): Promise<StoredSelection> {
    const data = resourceSelectionSchema.parse(selection);
    const record: StoredSelection = {
      id: randomUUID(),
      createdTime: Date.now(),
      selection: data,
      deliveryStatus: 'pending'
    };
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.receiptPath(record.id), JSON.stringify({
      id: record.id, createdTime: record.createdTime, selection: record.selection
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return record;
  }

  async updateDelivery(id: string, status: SelectionDeliveryStatus, reason?: string): Promise<void> {
    if (status === 'pending') throw new Error('Pending is the initial receipt state');
    const payload = {
      deliveryStatus: status,
      ...(status === 'forwardFailed' ? { deliveryError: reason || 'Delivery failed' } : {})
    };
    await writeFile(this.statusPath(id), JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  }

  async listRecent(limit = 50): Promise<StoredSelection[]> {
    let names: string[];
    try {
      names = (await readdir(this.directory))
        .filter(name => /^[0-9a-f-]{36}\.json$/.test(name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }

    const canonicalOperations = await this.reliability.list();
    const canonicalIds = new Set(canonicalOperations.map(operation => operation.payload.record.id));
    const records = new Map<string, { record: StoredSelection; time: number }>();
    for (const name of names) {
      const id = name.slice(0, -'.json'.length);
      if (canonicalIds.has(id)) continue;
      const receipt = JSON.parse(await readFile(this.receiptPath(id), 'utf8')) as {
        id: string; createdTime: number; selection: unknown
      };
      if (receipt.id !== id || !Number.isSafeInteger(receipt.createdTime))
        throw new Error('Corrupt resource selection receipt');
      let delivery: { deliveryStatus?: SelectionDeliveryStatus; deliveryError?: string } = {};
      try {
        delivery = JSON.parse(await readFile(this.statusPath(id), 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const deliveryStatus = delivery.deliveryStatus;
      const legacyRecord: StoredSelection = {
        id, createdTime: receipt.createdTime,
        selection: resourceSelectionSchema.parse(receipt.selection),
        deliveryStatus: deliveryStatus === 'forwarded' || deliveryStatus === 'forwardFailed'
          ? deliveryStatus : 'pending',
        ...(deliveryStatus === 'forwardFailed' && typeof delivery.deliveryError === 'string'
          ? { deliveryError: delivery.deliveryError } : {})
      };
      records.set(id, { record: legacyRecord, time: legacyRecord.createdTime });
    }
    for (const operation of canonicalOperations) {
      const state = operation.state;
      const deliveryStatus = state === 'delivered' ? 'forwarded' : state === 'failed' ? 'forwardFailed' : 'pending';
      records.set(operation.payload.record.id, {
        record: {
          ...operation.payload.record, deliveryStatus,
          ...(state === 'failed' && operation.lastError ? { deliveryError: operation.lastError } : {})
        },
        time: operation.createdAt
      });
    }
    return [...records.values()].sort((a, b) => b.time - a.time || b.record.id.localeCompare(a.record.id))
      .slice(0, Math.max(0, limit)).map(item => item.record);
  }

  async projectLegacyReceipt(record: StoredSelection): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.receiptPath(record.id), JSON.stringify({
      id: record.id, createdTime: record.createdTime, selection: record.selection
    }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
}

export type SelectionOperationRecord = ReliableRecord<SelectionOperationPayload, PeerMessageAck>;
