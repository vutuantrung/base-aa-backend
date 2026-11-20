import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JsonTaskFileStore, taskSchema } from '../../modules/peer-messaging/task-file-store.js';
import { JsonResourceSelectionStore, resourceSelectionSchema, type StoredSelection } from '../../modules/peer-messaging/resource-selection-store.js';
import type { Server } from 'socket.io';
import { type PeerId, type PeerMessage, type PeerMessageAck, type IncomingPeerMessage, incomingPeerMessageSchema } from '../../modules/peer-messaging/contracts.js';
import { PeerMessageService, PeerMessageError } from '../../modules/peer-messaging/peer-message-service.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';
import { PeerDirectory } from '../../modules/peer-messaging/peer-directory.js';
import { createSocketPeerGateway, type PeerSocketConnection } from './socket-peer-gateway.js';

export interface ExternalPeerTransport {
  isConnected(): boolean;
  deliver(message: PeerMessage): Promise<void>;
}

/**
 * EServer instances have separate authenticated sockets keyed by instanceId.
 * SServer and AAUI retain their single-connection behavior.
 */
export function attachPeerGateway(io: Server, apiKey: string | undefined, transformations: TransformationRegistry) {
  const directory = new PeerDirectory();
  const connections = createSocketPeerGateway(io, apiKey, directory);
  let pserverTransport: ExternalPeerTransport | undefined;
  const taskStore = new JsonTaskFileStore();
  const selectionStore = new JsonResourceSelectionStore();

  function getConnection(peerId: 'eserver' | 'sserver' | 'aaui', instanceId?: string): PeerSocketConnection | undefined {
    const identity = directory.lookup(peerId, instanceId);
    return identity ? connections.getConnection(identity.connectionId) : undefined;
  }

  // Transport presence is distinct from the 10s/20s application message streams.
  // Socket.IO events for each AAUI connection are sent in order.
  function presenceSnapshot() {
    return directory.presenceSnapshot();
  }

  function publishPresence(instanceId: string, status: 'online' | 'offline', socketId: string, reason?: string): void {
    const target = getConnection('aaui');
    if (!target?.connected) return;
    target.emit('peer:status', {
      peerId: 'eserver', instanceId, status, socketId,
      timestamp: Date.now(), ...(reason ? { reason } : {})
    });
  }

  function resolveTarget(message: IncomingPeerMessage): PeerSocketConnection | undefined {
    if (message.to === 'eserver') {
      if (message.toInstanceId) return getConnection('eserver', message.toInstanceId);
      const instances = directory.listInstances('eserver');
      if (instances.length === 1) return connections.getConnection(instances[0]?.connectionId ?? '');
      return undefined;
    }
    if (message.to === 'sserver' || message.to === 'aaui') return getConnection(message.to);
    return undefined;
  }

  const service = new PeerMessageService(transformations, {

    isConnected(peer: PeerId, toInstanceId?: string) {
      if (peer === 'aab') return true;
      if (peer === 'pserver') return pserverTransport?.isConnected() ?? false;
      if (peer === 'eserver') return directory.has('eserver', toInstanceId);
      return peer === 'sserver' || peer === 'aaui' ? directory.has(peer) : false;
    },
    validateDestination(message: IncomingPeerMessage): void {
      if (message.to === 'eserver' && !message.toInstanceId && directory.listInstances('eserver').length > 1)
        throw new PeerMessageError('AMBIGUOUS_DESTINATION', 'Multiple EServer instances connected; toInstanceId is required');
    },
    async deliver(message: PeerMessage): Promise<void> {
      if (message.to === 'pserver') {
        if (!pserverTransport?.isConnected()) throw new Error('PServer is offline');
        await pserverTransport.deliver(message);
      } else {
        const target = resolveTarget(message);
        if (!target) throw new Error(`Destination ${message.to} is offline`);
        const response = await target.emitWithAck<{ ok?: boolean }>('peer:message', message, 5000);
        if (!response?.ok) throw new Error(`Destination ${message.to} rejected message`);
      }
      console.log(`[AAB] FORWARD id=${message.id} from=${message.from} sourceInstance=${message.sourceInstanceId ?? '-'} to=${message.to} toInstance=${message.toInstanceId ?? '-'} type=${message.payload.type}`);
    }
  });

  function publishTaskEvent(
    task: z.infer<typeof taskSchema>, status: 'received' | 'forwarded' | 'forwardFailed',
    targetId?: string, reason?: string
  ): void {
    getConnection('aaui')?.emit('task:lifecycle', {
      task, status, instanceId: targetId ?? null,
      event: `task.${status}`, timestamp: Date.now(),
      ...(reason ? { reason } : {})
    });
  }

  /**
   * Receipt ACK is strictly an AAB acceptance/persistence acknowledgment.
   * EServer delivery is attempted asynchronously and reported independently.
   */
  async function receiveTask(value: unknown): Promise<PeerMessageAck> {
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
    const instances = directory.listInstances('eserver');
    const targetId = parsed.data.toInstanceId ?? (instances.length === 1 ? instances[0]?.instanceId : undefined);
    try {
      // File persistence is the durability boundary for the receipt ACK.
      await taskStore.save(task);
    } catch (error) {
      console.error('[AAB] TASK PERSIST FAILED', task.id, error);
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task at AAB' };
    }

    publishTaskEvent(task, 'received', targetId);
    console.log('[AAB] TASK RECEIVED', task.id, 'target=', targetId ?? 'unresolved');

    // Do not await the EServer here: PServer already has an accepted task.
    setImmediate(() => {
      void (async () => {
        try {
          if (!targetId) throw new Error('No unique EServer destination; specify toInstanceId');
          const target = getConnection('eserver', targetId);
          if (!target?.connected) throw new Error('EServer is offline');
          const outbound: IncomingPeerMessage = {
            ...parsed.data, id: messageId, toInstanceId: targetId,
          };
          // Use existing validation/transformation/ACK forwarding logic.
          await service.process(outbound, 'pserver');
          publishTaskEvent(task, 'forwarded', targetId);
          console.log('[AAB] TASK FORWARDED', task.id, 'to', targetId);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          publishTaskEvent(task, 'forwardFailed', targetId, reason);
          console.error('[AAB] TASK FORWARD FAILED', task.id, reason);
        }
      })();
    });

    const envelope: PeerMessage = {
      ...parsed.data, ...(targetId ? { toInstanceId: targetId } : {}),
      id: messageId,
      timestamp: Date.now(),
      payload: structuredClone(parsed.data.payload)
    };
    return { ok: true, status: 'received', data: envelope };
  }

  function publishResultEvent(
    task: z.infer<typeof taskSchema>,
    status: 'received' | 'forwarded' | 'forwardFailed',
    instanceId: string | undefined,
    reason?: string
  ): void {
    getConnection('aaui')?.emit('task:result:lifecycle', {
      task, status, instanceId: instanceId ?? null,
      event: `task.result.${status}`, timestamp: Date.now(),
      ...(reason ? { reason } : {})
    });
  }

  /**
   * F09 mirrors F08 in the opposite direction.
   * AAB acknowledges only durable receipt, not PServer delivery.
   */
  async function receiveTaskResult(value: unknown, instanceId: string | undefined): Promise<PeerMessageAck> {
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
      // Persist and validate against the original F08 task before acknowledging EServer.
      await taskStore.saveResult(task);
    } catch (error) {
      console.error('[AAB] TASK RESULT PERSIST FAILED', task.id, error);
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist task result at AAB' };
    }

    publishResultEvent(task, 'received', instanceId);
    console.log('[AAB] TASK RESULT RECEIVED', task.id, 'from', instanceId ?? 'eserver');

    setImmediate(() => {
      void (async () => {
        try {
          if (!pserverTransport?.isConnected()) throw new Error('PServer is offline');
          const outbound: IncomingPeerMessage = { ...parsed.data, id: messageId };
          await service.process(outbound, 'eserver', instanceId);
          publishResultEvent(task, 'forwarded', instanceId);
          console.log('[AAB] TASK RESULT FORWARDED', task.id, 'to PServer');
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          publishResultEvent(task, 'forwardFailed', instanceId, reason);
          console.error('[AAB] TASK RESULT FORWARD FAILED', task.id, reason);
        }
      })();
    });

    const envelope: PeerMessage = {
      ...parsed.data,
      id: messageId,
      sourceInstanceId: instanceId,
      timestamp: Date.now(),
      payload: structuredClone(parsed.data.payload)
    };
    return { ok: true, status: 'received', data: envelope };
  }

  function publishSelection(record: StoredSelection): void {
    getConnection('aaui')?.emit('resource-selection:updated', record);
  }

  async function receiveSelection(value: unknown): Promise<PeerMessageAck> {
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
      record = await selectionStore.save(selection.data);
    } catch (error) {
      console.error('[AAB] RESOURCE SELECTION PERSIST FAILED', error);
      return { ok: false, code: 'DELIVERY_FAILED', error: 'Could not persist resource selection' };
    }

    publishSelection(record);
    console.log('[AAB] RESOURCE SELECTION SAVED', record.id);

    const messageId = parsed.data.id ?? randomUUID();
    setImmediate(() => {
      void (async () => {
        let status: 'forwarded' | 'forwardFailed' = 'forwarded';
        let reason: string | undefined;
        try {
          await service.process({ ...parsed.data, id: messageId }, 'aaui');
          console.log('[AAB] RESOURCE SELECTION FORWARDED', record.id);
        } catch (error) {
          status = 'forwardFailed';
          reason = error instanceof Error ? error.message : String(error);
          console.error('[AAB] RESOURCE SELECTION FORWARD FAILED', record.id, reason);
        }
        // A failure to write monitoring metadata must never reclassify a
        // successfully delivered message as a PServer delivery failure.
        try {
          await selectionStore.updateDelivery(record.id, status, reason);
        } catch (storeError) {
          console.error('[AAB] RESOURCE SELECTION STATUS STORE FAILED', record.id, storeError);
        }
        publishSelection({
          ...record, deliveryStatus: status,
          ...(reason ? { deliveryError: reason } : {})
        });
      })();
    });

    const envelope: PeerMessage = {
      ...parsed.data, id: messageId, timestamp: Date.now(),
      payload: structuredClone(parsed.data.payload)
    };
    return { ok: true, status: 'received', data: envelope };
  }

  function isCurrentAaui(connection: PeerSocketConnection): boolean {
    return connection.peerId === 'aaui' && directory.lookup('aaui')?.connectionId === connection.connectionId;
  }

  async function sendSelectionSnapshot(connection: PeerSocketConnection): Promise<void> {
    if (!isCurrentAaui(connection)) return;
    try {
      const records = await selectionStore.listRecent(50);
      if (!connection.connected || !isCurrentAaui(connection)) return;
      connection.emit('resource-selection:snapshot', { records, timestamp: Date.now() });
    } catch (error) {
      console.error('[AAB] RESOURCE SELECTION SNAPSHOT FAILED', error);
      if (connection.connected && isCurrentAaui(connection)) {
        connection.emit('resource-selection:snapshot', {
          records: [], timestamp: Date.now(), error: 'Could not load saved selections'
        });
      }
    }
  }

  async function handleMessage(value: unknown, authenticatedFrom: PeerId, instanceId?: string): Promise<PeerMessageAck> {
    if (authenticatedFrom === 'aaui' && value && typeof value === 'object' &&
        (value as { payload?: { type?: unknown } }).payload?.type === 'demo.resource-selection') {
      return receiveSelection(value);
    }
    if (authenticatedFrom === 'pserver' && value && typeof value === 'object' &&
        (value as { payload?: { type?: unknown } }).payload?.type === 'demo.task.request') {
      return receiveTask(value);
    }
    if (authenticatedFrom === 'eserver' && value && typeof value === 'object' &&
        (value as { payload?: { type?: unknown } }).payload?.type === 'demo.task.result') {
      return receiveTaskResult(value, instanceId);
    }
    try {
      const message = await service.process(value, authenticatedFrom, instanceId);
      console.log(`[AAB] PROCESSED id=${message.id} from=${message.from} sourceInstance=${message.sourceInstanceId ?? '-'} to=${message.to} type=${message.payload.type} transformers=${message.processing?.processedBy.join(',') || 'none'}`);
      return { ok: true, data: message };
    } catch (error) {
      const code = error instanceof PeerMessageError ? error.code : 'TRANSFORMATION_FAILED';
      console.error(`[AAB] MESSAGE ERROR from=${authenticatedFrom} instance=${instanceId ?? '-'} code=${code}`, error);
      return { ok: false, code, error: error instanceof Error ? error.message : 'Internal message error' };
    }
  }

  async function sendTaskSnapshot(connection: PeerSocketConnection): Promise<void> {
    if (!isCurrentAaui(connection)) return;
    try {
      const tasks = await taskStore.listRecent(50);
      if (!connection.connected || !isCurrentAaui(connection)) return;
      connection.emit('task:lifecycle:snapshot', {
        timestamp: Date.now(),
        tasks: tasks.map(task => ({
          task,
          status: task.status === 'finished' ? 'finished' : 'received',
          event: 'task.snapshot'
        }))
      });
    } catch (error) {
      console.error('[AAB] TASK SNAPSHOT ERROR', error);
      if (connection.connected && isCurrentAaui(connection)) {
        connection.emit('task:lifecycle:snapshot', {
          timestamp: Date.now(), tasks: [],
          error: 'Unable to load persisted task history'
        });
      }
    }
  }

  connections.onConnection(connection => {
    const peerId = connection.peerId;
    const instanceId = connection.instanceId;
    console.log(`[AAB] CONNECT peer=${peerId} instance=${instanceId ?? '-'} socket=${connection.connectionId}`);
    if (peerId === 'eserver') {
      publishPresence(instanceId!, 'online', connection.connectionId);
    } else if (peerId === 'aaui') {
      // Late AAUI connections and reconnects always receive the online set.
      connection.emit('peer:status:snapshot', presenceSnapshot());
      // Task lifecycle events are transient; rehydrate the dashboard from disk.
      void sendTaskSnapshot(connection);
      void sendSelectionSnapshot(connection);
    }
    connection.emit('aab:welcome', { from: 'aab', to: peerId, instanceId, message: 'connected', timestamp: Date.now() });

    if (peerId === 'aaui') {
      connection.on('task:lifecycle:refresh', () => { void sendTaskSnapshot(connection); });
      connection.on('resource-selection:refresh', () => { void sendSelectionSnapshot(connection); });
    }

    connection.on('peer:ping', (payload, ackCandidate) => {
      console.log(`[AAB] RECEIVE peer=${peerId} instance=${instanceId ?? '-'} event=peer:ping payload=${JSON.stringify(payload)}`);
      if (typeof ackCandidate === 'function') ackCandidate({ ok: true, from: 'aab', timestamp: Date.now() });
    });
    connection.on('peer:message', async (value, ackCandidate) => {
      if (typeof ackCandidate === 'function') ackCandidate(await handleMessage(value, peerId, instanceId));
    });
    connection.onDisconnect((reason, removedCurrentIdentity) => {
      if (peerId === 'eserver' && removedCurrentIdentity) {
        publishPresence(instanceId!, 'offline', connection.connectionId, reason);
      }
      console.log(`[AAB] DISCONNECT peer=${peerId} instance=${instanceId ?? '-'} reason=${reason}`);
    });
  });

  return {
    registerPServerTransport(transport: ExternalPeerTransport): void { pserverTransport = transport; },
    receiveFromPServer(value: unknown): Promise<PeerMessageAck> { return handleMessage(value, 'pserver'); }
  };
}
