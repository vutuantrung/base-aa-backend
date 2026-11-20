import { randomUUID } from 'node:crypto';
import { incomingPeerMessageSchema, type IncomingPeerMessage, type PeerMessage, type PeerMessageAck } from '../peer-messaging/contracts.js';
import { resourceSelectionSchema, type ResourceSelectionStore, type StoredSelection } from './resource-selection-store.js';

export interface ResourceSelectionSnapshot {
  records: StoredSelection[];
  timestamp: number;
}

export interface ResourceSelectionWorkflowCapabilities {
  readonly store: Pick<ResourceSelectionStore, 'save' | 'updateDelivery' | 'listRecent'>;
  processMessage(value: unknown, authenticatedFrom: 'aaui'): Promise<PeerMessage>;
  defer(work: () => Promise<void>): void;
  publishUpdated(record: StoredSelection): void;
}

/** M13 owns selection validation, receipt, forwarding status and snapshot projection. */
export class ResourceSelectionWorkflow {
  constructor(private readonly capabilities: ResourceSelectionWorkflowCapabilities) {}

  async receiveSelection(value: unknown): Promise<PeerMessageAck> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success || parsed.data.from !== 'aaui' || parsed.data.to !== 'pserver' ||
        parsed.data.payload.type !== 'demo.resource-selection') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid resource selection envelope' };
    }
    const selection = resourceSelectionSchema.safeParse(parsed.data.payload.data);
    if (!selection.success) {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid resource selection IDs' };
    }

    let record: StoredSelection;
    try {
      record = await this.capabilities.store.save(selection.data);
    } catch (error) {
      console.error('[AAB] RESOURCE SELECTION PERSIST FAILED', error);
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist resource selection' };
    }

    this.capabilities.publishUpdated(record);
    console.log('[AAB] RESOURCE SELECTION SAVED', record.id);
    const messageId = parsed.data.id ?? randomUUID();
    this.capabilities.defer(() => this.forwardSelection(parsed.data, messageId, record));

    const envelope: PeerMessage = {
      ...parsed.data, id: messageId, timestamp: Date.now(),
      payload: structuredClone(parsed.data.payload)
    };
    return { ok: true, status: 'received', data: envelope };
  }

  async createSnapshot(): Promise<ResourceSelectionSnapshot> {
    const records = await this.capabilities.store.listRecent(50);
    return { records, timestamp: Date.now() };
  }

  private async forwardSelection(
    parsed: IncomingPeerMessage, messageId: string, record: StoredSelection
  ): Promise<void> {
    let status: 'forwarded' | 'forwardFailed' = 'forwarded';
    let reason: string | undefined;
    try {
      await this.capabilities.processMessage({ ...parsed, id: messageId }, 'aaui');
      console.log('[AAB] RESOURCE SELECTION FORWARDED', record.id);
    } catch (error) {
      status = 'forwardFailed';
      reason = error instanceof Error ? error.message : String(error);
      console.error('[AAB] RESOURCE SELECTION FORWARD FAILED', record.id, reason);
    }

    // Monitoring persistence is independent of peer delivery and the final AAUI update.
    try {
      await this.capabilities.store.updateDelivery(record.id, status, reason);
    } catch (storeError) {
      console.error('[AAB] RESOURCE SELECTION STATUS STORE FAILED', record.id, storeError);
    }
    this.capabilities.publishUpdated({
      ...record, deliveryStatus: status,
      ...(reason ? { deliveryError: reason } : {})
    });
  }
}
