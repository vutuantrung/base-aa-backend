import { randomUUID } from 'node:crypto';
import { incomingPeerMessageSchema, type IncomingPeerMessage, type PeerMessage, type PeerMessageAck, type PeerId } from '../peer-messaging/contracts.js';
import { taskSchema, type StoredTask, type TaskFileStore } from './task-file-store.js';

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
  listEServerInstances(): Array<{ instanceId?: string }>;
  isEServerConnectionReady(instanceId: string): boolean;
  isPServerConnected(): boolean;
  processMessage(value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessage>;
  defer(work: () => Promise<void>): void;
  publishTaskLifecycle(notification: TaskLifecycleNotification): void;
  publishTaskResultLifecycle(notification: TaskLifecycleNotification): void;
}

/** M12 owns F08/F09 receipt policy, persistence coordination and history projection. */
export class TaskWorkflow {
  constructor(private readonly capabilities: TaskWorkflowCapabilities) {}

  async receiveTask(value: unknown): Promise<PeerMessageAck> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success || parsed.data.from !== 'pserver' || parsed.data.to !== 'eserver' ||
        parsed.data.payload.type !== 'demo.task.request') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid PServer task envelope' };
    }
    const validated = taskSchema.safeParse(parsed.data.payload.data);
    if (!validated.success || validated.data.status !== 'inProgress') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid inProgress task payload' };
    }

    const task = validated.data;
    const messageId = parsed.data.id ?? randomUUID();
    const instances = this.capabilities.listEServerInstances();
    const targetId = parsed.data.toInstanceId ?? (instances.length === 1 ? instances[0]?.instanceId : undefined);
    try {
      // File write completion is the existing receipt boundary.
      await this.capabilities.store.save(task);
    } catch (error) {
      console.error('[AAB] TASK PERSIST FAILED', task.id, error);
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task at AAB' };
    }

    this.publishTaskEvent(task, 'received', targetId);
    console.log('[AAB] TASK RECEIVED', task.id, 'target=', targetId ?? 'unresolved');
    this.capabilities.defer(() => this.forwardTask(parsed.data, messageId, task, targetId));

    const envelope: PeerMessage = {
      ...parsed.data, ...(targetId ? { toInstanceId: targetId } : {}),
      id: messageId,
      timestamp: Date.now(),
      payload: structuredClone(parsed.data.payload)
    };
    return { ok: true, status: 'received', data: envelope };
  }

  async receiveTaskResult(value: unknown, instanceId: string | undefined): Promise<PeerMessageAck> {
    const parsed = incomingPeerMessageSchema.safeParse(value);
    if (!parsed.success || parsed.data.from !== 'eserver' || parsed.data.to !== 'pserver' ||
        parsed.data.payload.type !== 'demo.task.result') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid EServer task result envelope' };
    }
    const validated = taskSchema.safeParse(parsed.data.payload.data);
    if (!validated.success || validated.data.status !== 'finished') {
      return { ok: false, code: 'INVALID_MESSAGE', error: 'Invalid finished task result payload' };
    }

    const task = validated.data;
    const messageId = parsed.data.id ?? randomUUID();
    try {
      // Validate and save against the original F08 task before sending a receipt ACK.
      await this.capabilities.store.saveResult(task);
    } catch (error) {
      console.error('[AAB] TASK RESULT PERSIST FAILED', task.id, error);
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task result at AAB' };
    }

    this.publishTaskResultEvent(task, 'received', instanceId);
    console.log('[AAB] TASK RESULT RECEIVED', task.id, 'from', instanceId ?? 'eserver');
    this.capabilities.defer(() => this.forwardTaskResult(parsed.data, messageId, task, instanceId));

    const envelope: PeerMessage = {
      ...parsed.data,
      id: messageId,
      sourceInstanceId: instanceId,
      timestamp: Date.now(),
      payload: structuredClone(parsed.data.payload)
    };
    return { ok: true, status: 'received', data: envelope };
  }

  async createHistorySnapshot(): Promise<TaskHistorySnapshot> {
    const tasks = await this.capabilities.store.listRecent(50);
    return {
      timestamp: Date.now(),
      tasks: tasks.map(task => ({
        task,
        status: task.status === 'finished' ? 'finished' : 'received',
        event: 'task.snapshot'
      }))
    };
  }

  private publishTaskEvent(task: StoredTask, status: TaskLifecycleStatus, targetId?: string, reason?: string): void {
    this.capabilities.publishTaskLifecycle({
      task, status, instanceId: targetId ?? null,
      event: `task.${status}`, timestamp: Date.now(), ...(reason ? { reason } : {})
    });
  }

  private publishTaskResultEvent(task: StoredTask, status: TaskLifecycleStatus, instanceId?: string, reason?: string): void {
    this.capabilities.publishTaskResultLifecycle({
      task, status, instanceId: instanceId ?? null,
      event: `task.result.${status}`, timestamp: Date.now(), ...(reason ? { reason } : {})
    });
  }

  private async forwardTask(
    parsed: IncomingPeerMessage, messageId: string, task: StoredTask, targetId?: string
  ): Promise<void> {
    try {
      if (!targetId) throw new Error('No unique EServer destination; specify toInstanceId');
      if (!this.capabilities.isEServerConnectionReady(targetId)) throw new Error('EServer is offline');
      const outbound: IncomingPeerMessage = { ...parsed, id: messageId, toInstanceId: targetId };
      await this.capabilities.processMessage(outbound, 'pserver');
      this.publishTaskEvent(task, 'forwarded', targetId);
      console.log('[AAB] TASK FORWARDED', task.id, 'to', targetId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.publishTaskEvent(task, 'forwardFailed', targetId, reason);
      console.error('[AAB] TASK FORWARD FAILED', task.id, reason);
    }
  }

  private async forwardTaskResult(
    parsed: IncomingPeerMessage, messageId: string, task: StoredTask, instanceId?: string
  ): Promise<void> {
    try {
      if (!this.capabilities.isPServerConnected()) throw new Error('PServer is offline');
      const outbound: IncomingPeerMessage = { ...parsed, id: messageId };
      await this.capabilities.processMessage(outbound, 'eserver', instanceId);
      this.publishTaskResultEvent(task, 'forwarded', instanceId);
      console.log('[AAB] TASK RESULT FORWARDED', task.id, 'to PServer');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.publishTaskResultEvent(task, 'forwardFailed', instanceId, reason);
      console.error('[AAB] TASK RESULT FORWARD FAILED', task.id, reason);
    }
  }
}
