import { randomUUID } from 'node:crypto';
import { incomingPeerMessageSchema, type IncomingPeerMessage, type PeerMessage, type PeerMessageAck, type PeerId } from '../peer-messaging/contracts.js';
import { taskSchema, type StoredTask, type TaskFileStore, type TaskOperationPayload } from './task-file-store.js';
import { createReliableRecord, fingerprintReliableValue, type ReliableRecordStore } from '../../shared/persistence/atomic-json-record-store.js';
import { ReliableOutboxRunner, type ReliabilityRunnerPolicy } from '../../shared/persistence/reliable-outbox-runner.js';

export type TaskLifecycleStatus = 'received' | 'forwarded' | 'forwardFailed';

export interface TaskLifecycleNotification {
  task: StoredTask;
  status: TaskLifecycleStatus;
  instanceId: string | null;
  event: string;
  timestamp: number;
  reason?: string;
}

export interface TaskHistorySnapshot {
  timestamp: number;
  tasks: Array<{ task: StoredTask; status: 'received' | 'finished'; event: 'task.snapshot' }>;
}

export interface TaskWorkflowCapabilities {
  readonly store: TaskFileStore;
  readonly outbox: ReliableRecordStore<TaskOperationPayload, PeerMessageAck>;
  hasLegacyOperation?(kind: 'F08' | 'F09', taskId: string): Promise<boolean>;
  projectLegacyOperation?(payload: TaskOperationPayload): Promise<void>;
  listEServerInstances(): Array<{ instanceId?: string }>;
  isEServerConnectionReady(instanceId: string): boolean;
  isCdcConnected(): boolean;
  processMessage(value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessage>;
  prepareForDurableDelivery?(value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessage>;
  deliverPreparedMessage?(message: PeerMessage): Promise<void>;
  defer(work: () => Promise<void>): void;
  publishTaskLifecycle(notification: TaskLifecycleNotification): void;
  publishTaskResultLifecycle(notification: TaskLifecycleNotification): void;
  now?: () => number;
  random?: () => number;
  reliabilityPolicy?: ReliabilityRunnerPolicy;
}

/** M12 owns F08/F09 receipt policy, persistence coordination and history projection. */
export class TaskWorkflow {
  private readonly runner: ReliableOutboxRunner<TaskOperationPayload, PeerMessageAck>;

  constructor(private readonly capabilities: TaskWorkflowCapabilities) {
    this.runner = new ReliableOutboxRunner(capabilities.outbox, {
      isReady: payload => payload.kind === 'F08'
        ? Boolean(payload.targetId && this.capabilities.isEServerConnectionReady(payload.targetId))
        : this.capabilities.isCdcConnected(),
      deliver: payload => this.deliver(payload),
      onState: record => this.publishState(record.payload, record.state, record.lastError),
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

  async receiveTask(value: unknown): Promise<PeerMessageAck> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success || parsed.data.from !== 'cdc' || parsed.data.to !== 'eserver' ||
      parsed.data.payload.type !== 'automation.task.request') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid Cdc task envelope' };
    }
    const validated = taskSchema.safeParse(parsed.data.payload.data);
    if (!validated.success || validated.data.status !== 'inProgress') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid inProgress task payload' };
    }

    const task = validated.data;
    const key = `F08:${task.id}`;
    const existing = await this.capabilities.outbox.get(key);
    const instances = this.capabilities.listEServerInstances();
    const targetId = parsed.data.toInstanceId ?? (existing?.payload.kind === 'F08' ? existing.payload.targetId : instances.length === 1 ? instances[0]?.instanceId : undefined);
    const fingerprint = fingerprintReliableValue({ task, targetId });
    const duplicate = this.matchExisting(existing, fingerprint, 'Conflicting duplicate task operation');
    if (duplicate) return duplicate;
    if (await this.capabilities.hasLegacyOperation?.('F08', task.id))
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task at AS' };

    const messageId = parsed.data.id ?? randomUUID();
    const ackTime = this.now();
    const ackEnvelope: PeerMessage = {
      ...parsed.data, ...(targetId ? { toInstanceId: targetId } : {}), id: messageId,
      timestamp: ackTime, payload: structuredClone(parsed.data.payload)
    };
    const prepareValue = {
      ...parsed.data, ...(targetId ? { toInstanceId: targetId } : {}), id: messageId,
      payload: structuredClone(parsed.data.payload)
    };
    let outbound: PeerMessage = { ...prepareValue, timestamp: ackTime };
    let preparationError: string | undefined;
    try {
      if (!targetId && instances.length !== 1) {
        throw new Error(instances.length > 1 ? 'Multiple EServer instances connected; toInstanceId is required' : 'No unique EServer destination; specify toInstanceId');
      }
      if (this.capabilities.prepareForDurableDelivery)
        outbound = await this.capabilities.prepareForDurableDelivery(prepareValue, 'cdc');
    } catch (error) {
      preparationError = error instanceof Error ? error.message : String(error);
    }

    const payload: TaskOperationPayload = { kind: 'F08', task, ...(targetId ? { targetId } : {}), outbound };
    const ack: PeerMessageAck = { ok: true, status: 'received', data: ackEnvelope };
    const initialState = preparationError ? 'failed' : 'queued';
    const record = createReliableRecord({
      key, fingerprint, createdAt: ackTime, updatedAt: ackTime, state: initialState, attempts: 0,
      ...(preparationError ? { lastError: preparationError } : {}), payload, ack
    });
    const committed = await this.commit(record, 'Could not persist task at AS');
    if (committed !== ack) return committed;
    await this.projectLegacy(payload);
    this.publishTaskEvent(task, 'received', targetId);
    if (preparationError) this.publishTaskEvent(task, 'forwardFailed', targetId, preparationError);
    else await this.runner.enqueue(key);
    return ack;
  }

  async receiveTaskResult(value: unknown, instanceId: string | undefined): Promise<PeerMessageAck> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success || parsed.data.from !== 'eserver' || parsed.data.to !== 'cdc' ||
      parsed.data.payload.type !== 'automation.task.result') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid EServer task result envelope' };
    }
    const validated = taskSchema.safeParse(parsed.data.payload.data);
    if (!validated.success || validated.data.status !== 'finished') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid finished task result payload' };
    }

    const task = validated.data;
    const key = `F09:${task.id}`;
    const fingerprint = fingerprintReliableValue({ task, sourceInstanceId: instanceId });
    const duplicate = this.matchExisting(
      await this.capabilities.outbox.get(key), fingerprint, 'Conflicting duplicate task operation'
    );
    if (duplicate) return duplicate;
    const original = await this.capabilities.store.read(task.id);
    if (!original || original.config !== task.config || original.createdTime !== task.createdTime || task.updatedTime < original.updatedTime)
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task result at AS' };
    if (await this.capabilities.hasLegacyOperation?.('F09', task.id))
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task result at AS' };

    const messageId = parsed.data.id ?? randomUUID();
    const ackTime = this.now();
    const ackEnvelope: PeerMessage = {
      ...parsed.data, id: messageId, sourceInstanceId: instanceId, timestamp: ackTime,
      payload: structuredClone(parsed.data.payload)
    };
    const prepareValue = { ...parsed.data, id: messageId };
    let outbound: PeerMessage = { ...prepareValue, sourceInstanceId: instanceId, timestamp: ackTime };
    let preparationError: string | undefined;
    try {
      if (this.capabilities.prepareForDurableDelivery)
        outbound = await this.capabilities.prepareForDurableDelivery(prepareValue, 'eserver', instanceId);
    } catch (error) {
      preparationError = error instanceof Error ? error.message : String(error);
    }

    const payload: TaskOperationPayload = {
      kind: 'F09', task, ...(instanceId ? { sourceInstanceId: instanceId } : {}), outbound
    };
    const ack: PeerMessageAck = { ok: true, status: 'received', data: ackEnvelope };
    const record = createReliableRecord({
      key, fingerprint, createdAt: ackTime, updatedAt: ackTime,
      state: preparationError ? 'failed' : 'queued', attempts: 0,
      ...(preparationError ? { lastError: preparationError } : {}), payload, ack
    });
    const committed = await this.commit(record, 'Could not persist task result at AS');
    if (committed !== ack) return committed;
    await this.projectLegacy(payload);
    this.publishTaskResultEvent(task, 'received', instanceId);
    if (preparationError) this.publishTaskResultEvent(task, 'forwardFailed', instanceId, preparationError);
    else await this.runner.enqueue(key);
    return ack;
  }

  async createHistorySnapshot(): Promise<TaskHistorySnapshot> {
    const tasks = await this.capabilities.store.listRecent(50);
    return {
      timestamp: this.now(),
      tasks: tasks.map(task => ({ task, status: task.status === 'finished' ? 'finished' : 'received', event: 'task.snapshot' }))
    };
  }

  private matchExisting(
    existing: Awaited<ReturnType<ReliableRecordStore<TaskOperationPayload, PeerMessageAck>['get']>>,
    fingerprint: string,
    conflictMessage: string
  ): PeerMessageAck | undefined {
    if (!existing) return undefined;
    if (existing.fingerprint !== fingerprint)
      return { ok: false, code: 'INVALID_MESSAGE', error: conflictMessage };
    return existing.ack;
  }

  private async commit(
    record: ReturnType<typeof createReliableRecord<TaskOperationPayload, PeerMessageAck>>,
    failureMessage: string
  ): Promise<PeerMessageAck> {
    try {
      const result = await this.capabilities.outbox.create(record);
      if (result.record.fingerprint !== record.fingerprint)
        return { ok: false, code: 'INVALID_MESSAGE', error: 'Conflicting duplicate task operation' };
      return result.record.ack;
    } catch (error) {
      console.error('[AS] TASK PERSIST FAILED', record.payload.task.id, error instanceof Error ? error.message : 'unknown');
      return {
        ok: false, code: 'DELIVERY_FAILED', error: error instanceof Error && error.message === 'Reliability queue capacity is full'
          ? 'Reliability queue capacity is full' : failureMessage
      };
    }
  }

  private async projectLegacy(payload: TaskOperationPayload): Promise<void> {
    try { await this.capabilities.projectLegacyOperation?.(payload); }
    catch (error) { console.error('[AS] TASK LEGACY PROJECTION FAILED', payload.task.id, error instanceof Error ? error.message : 'unknown'); }
  }

  private async deliver(payload: TaskOperationPayload): Promise<void> {
    if (this.capabilities.deliverPreparedMessage) await this.capabilities.deliverPreparedMessage(payload.outbound);
    else await this.capabilities.processMessage(payload.outbound, payload.kind === 'F08' ? 'cdc' : 'eserver', payload.sourceInstanceId);
  }

  private publishState(payload: TaskOperationPayload, state: string, reason?: string): void {
    if (state !== 'delivered' && state !== 'failed') return;
    if (payload.kind === 'F08') this.publishTaskEvent(payload.task, state === 'delivered' ? 'forwarded' : 'forwardFailed', payload.targetId, reason);
    else this.publishTaskResultEvent(payload.task, state === 'delivered' ? 'forwarded' : 'forwardFailed', payload.sourceInstanceId, reason);
  }

  private publishTaskEvent(task: StoredTask, status: TaskLifecycleStatus, targetId?: string, reason?: string): void {
    try {
      this.capabilities.publishTaskLifecycle({
        task, status, instanceId: targetId ?? null,
        event: `task.${status}`, timestamp: this.now(), ...(reason ? { reason } : {})
      });
    } catch (error) { console.error('[AS] TASK LIFECYCLE PROJECTION FAILED', task.id, error instanceof Error ? error.message : 'unknown'); }
  }

  private publishTaskResultEvent(task: StoredTask, status: TaskLifecycleStatus, instanceId?: string, reason?: string): void {
    try {
      this.capabilities.publishTaskResultLifecycle({
        task, status, instanceId: instanceId ?? null,
        event: `task.result.${status}`, timestamp: this.now(), ...(reason ? { reason } : {})
      });
    } catch (error) { console.error('[AS] TASK RESULT LIFECYCLE PROJECTION FAILED', task.id, error instanceof Error ? error.message : 'unknown'); }
  }

  private now(): number { return this.capabilities.now?.() ?? Date.now(); }
}
