import { randomUUID } from 'node:crypto';
import { incomingPeerMessageSchema, type IncomingPeerMessage, type PeerMessage, type PeerMessageAck } from '../peer-messaging/contracts.js';
import { resourceSelectionSchema, type ResourceSelectionStore, type SelectionOperationPayload, type StoredSelection } from './resource-selection-store.js';
import { createReliableRecord, fingerprintReliableValue, type ReliableRecordStore } from '../../shared/persistence/atomic-json-record-store.js';
import { ReliableOutboxRunner, type ReliabilityRunnerPolicy } from '../../shared/persistence/reliable-outbox-runner.js';

export interface ResourceSelectionSnapshot {
  records: StoredSelection[];
  timestamp: number;
}

export interface ResourceSelectionWorkflowCapabilities {
  readonly store: Pick<ResourceSelectionStore, 'save' | 'updateDelivery' | 'listRecent'>;
  readonly outbox: ReliableRecordStore<SelectionOperationPayload, PeerMessageAck>;
  projectLegacyReceipt?(record: StoredSelection): Promise<void>;
  processMessage(value: unknown, authenticatedFrom: 'aa'): Promise<PeerMessage>;
  prepareForDurableDelivery?(value: unknown, authenticatedFrom: 'aa'): Promise<PeerMessage>;
  deliverPreparedMessage?(message: PeerMessage): Promise<void>;
  isCdcConnected(): boolean;
  defer(work: () => Promise<void>): void;
  publishUpdated(record: StoredSelection): void;
  now?: () => number;
  random?: () => number;
  reliabilityPolicy?: ReliabilityRunnerPolicy;
}

/** M13 owns selection receipt, canonical delivery state and snapshot projection. */
export class ResourceSelectionWorkflow {
  private readonly runner: ReliableOutboxRunner<SelectionOperationPayload, PeerMessageAck>;

  constructor(private readonly capabilities: ResourceSelectionWorkflowCapabilities) {
    this.runner = new ReliableOutboxRunner(capabilities.outbox, {
      isReady: () => this.capabilities.isCdcConnected(),
      deliver: payload => this.deliver(payload),
      onState: operation => this.publishState(operation.payload, operation.state, operation.lastError),
      defer: capabilities.defer,
      now: capabilities.now,
      random: capabilities.random,
      policy: capabilities.reliabilityPolicy
    });
  }

  async start(activate = true): Promise<void> { await this.runner.start(activate); }
  async activate(): Promise<void> { await this.runner.activate(); }
  close(): boolean { return this.runner.close(); }
  async waitForIdle(): Promise<void> { await this.runner.waitForIdle(); }
  workCounts() { return this.runner.workCounts(); }
  async destinationReady(): Promise<void> { await this.runner.wake(); }

  async receiveSelection(value: unknown): Promise<PeerMessageAck> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success || parsed.data.from !== 'aa' || parsed.data.to !== 'cdc' ||
        parsed.data.payload.type !== 'demo.resource-selection') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid resource selection envelope' };
    }
    const selection = resourceSelectionSchema.safeParse(parsed.data.payload.data);
    if (!selection.success) return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid resource selection IDs' };

    const messageId = parsed.data.id ?? randomUUID();
    const key = parsed.data.id ? `M13:aa:${parsed.data.id}` : `M13:aa:unkeyed:${randomUUID()}`;
    const fingerprint = fingerprintReliableValue({
      authenticatedSender: 'aa', id: parsed.data.id, kind: parsed.data.kind, from: parsed.data.from,
      to: parsed.data.to, toInstanceId: parsed.data.toInstanceId, channel: parsed.data.channel,
      event: parsed.data.event, correlationId: parsed.data.correlationId, causationId: parsed.data.causationId,
      payload: { type: parsed.data.payload.type, version: parsed.data.payload.version, data: selection.data }
    });
    const existing = await this.capabilities.outbox.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        return { ok: false, code: 'INVALID_MESSAGE', error: 'Conflicting duplicate resource selection submission' };
      return existing.ack;
    }

    const timestamp = this.now();
    const record: StoredSelection = {
      id: randomUUID(), createdTime: timestamp, selection: selection.data, deliveryStatus: 'pending'
    };
    const ackEnvelope: PeerMessage = {
      ...parsed.data, id: messageId, timestamp,
      payload: structuredClone(parsed.data.payload)
    };
    const prepareValue = { ...parsed.data, id: messageId };
    let outbound: PeerMessage = { ...prepareValue, timestamp };
    let preparationError: string | undefined;
    try {
      if (this.capabilities.prepareForDurableDelivery)
        outbound = await this.capabilities.prepareForDurableDelivery(prepareValue, 'aa');
    } catch (error) { preparationError = error instanceof Error ? error.message : String(error); }

    const payload: SelectionOperationPayload = { record, outbound };
    const ack: PeerMessageAck = { ok: true, status: 'received', data: ackEnvelope };
    const operation = createReliableRecord({
      key, fingerprint, createdAt: timestamp, updatedAt: timestamp,
      state: preparationError ? 'failed' : 'queued', attempts: 0,
      ...(preparationError ? { lastError: preparationError } : {}), payload, ack
    });
    let committed: Awaited<ReturnType<typeof this.capabilities.outbox.create>>;
    try { committed = await this.capabilities.outbox.create(operation); }
    catch (error) {
      console.error('[AS] RESOURCE SELECTION PERSIST FAILED', error instanceof Error ? error.message : 'unknown');
      return { ok: false, code: 'DELIVERY_FAILED', error: error instanceof Error && error.message === 'Reliability queue capacity is full'
        ? 'Reliability queue capacity is full' : 'Could not persist resource selection' };
    }
    if (committed.record.fingerprint !== fingerprint)
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Conflicting duplicate resource selection submission' };
    if (!committed.created) return committed.record.ack;

    try { await this.capabilities.projectLegacyReceipt?.(record); }
    catch (error) { console.error('[AS] RESOURCE SELECTION LEGACY PROJECTION FAILED', record.id, error instanceof Error ? error.message : 'unknown'); }
    this.publishUpdated(record);
    if (preparationError) this.publishUpdated({ ...record, deliveryStatus: 'forwardFailed', deliveryError: preparationError });
    else await this.runner.enqueue(key);
    return ack;
  }

  async createSnapshot(): Promise<ResourceSelectionSnapshot> {
    const records = await this.capabilities.store.listRecent(50);
    return { records, timestamp: this.now() };
  }

  private async deliver(payload: SelectionOperationPayload): Promise<void> {
    if (this.capabilities.deliverPreparedMessage) await this.capabilities.deliverPreparedMessage(payload.outbound);
    else await this.capabilities.processMessage(payload.outbound, 'aa');
  }

  private publishState(payload: SelectionOperationPayload, state: string, reason?: string): void {
    if (state !== 'delivered' && state !== 'failed') return;
    const deliveryStatus = state === 'delivered' ? 'forwarded' : 'forwardFailed';
    this.publishUpdated({ ...payload.record, deliveryStatus, ...(reason ? { deliveryError: reason } : {}) });
  }

  private publishUpdated(record: StoredSelection): void {
    try { this.capabilities.publishUpdated(record); }
    catch (error) { console.error('[AS] RESOURCE SELECTION PROJECTION FAILED', record.id, error instanceof Error ? error.message : 'unknown'); }
  }

  private now(): number { return this.capabilities.now?.() ?? Date.now(); }
}
