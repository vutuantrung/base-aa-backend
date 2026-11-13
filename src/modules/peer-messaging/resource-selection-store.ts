import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

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

/**
 * Durable one-file-per-submission receipt. A separate status sidecar keeps
 * the original submission immutable while tracking best-effort delivery.
 */
export class JsonResourceSelectionStore {
  private readonly directory: string;

  constructor(directory = process.env.AAB_SELECTION_STORE_DIR ?? './data/resource-selections') {
    this.directory = resolve(directory);
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

    const records: StoredSelection[] = [];
    for (const name of names) {
      const id = name.slice(0, -'.json'.length);
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
      records.push({
        id, createdTime: receipt.createdTime,
        selection: resourceSelectionSchema.parse(receipt.selection),
        deliveryStatus: deliveryStatus === 'forwarded' || deliveryStatus === 'forwardFailed'
          ? deliveryStatus : 'pending',
        ...(deliveryStatus === 'forwardFailed' && typeof delivery.deliveryError === 'string'
          ? { deliveryError: delivery.deliveryError } : {})
      });
    }
    return records.sort((a, b) => b.createdTime - a.createdTime || b.id.localeCompare(a.id))
      .slice(0, Math.max(0, limit));
  }
}
