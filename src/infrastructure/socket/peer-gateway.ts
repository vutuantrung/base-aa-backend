import { randomUUID } from 'node:crypto';
import { JsonTaskFileStore } from '../../modules/task-workflow/task-file-store.js';
import { TaskWorkflow } from '../../modules/task-workflow/task-workflow.js';
import { JsonResourceSelectionStore, resourceSelectionSchema, type StoredSelection } from '../../modules/peer-messaging/resource-selection-store.js';
import type { Server } from 'socket.io';
import { type PeerId, type PeerMessage, type PeerMessageAck, type IncomingPeerMessage, incomingPeerMessageSchema } from '../../modules/peer-messaging/contracts.js';
import { PeerMessageService, processPeerMessageForAck } from '../../modules/peer-messaging/peer-message-service.js';
import { PeerDestinationPolicy, type PServerPeerTransport } from '../../modules/peer-messaging/peer-destination-policy.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';
import { PeerDirectory } from '../../modules/peer-messaging/peer-directory.js';
import { createSocketPeerGateway, type PeerSocketConnection } from './socket-peer-gateway.js';
import { SocketPeerMessageDelivery } from './socket-peer-message-delivery.js';
import { sendTaskHistorySnapshot } from './task-history-snapshot.js';

export interface ExternalPeerTransport extends PServerPeerTransport {}

/**
 * EServer instances have separate authenticated sockets keyed by instanceId.
 * SServer and AAUI retain their single-connection behavior.
 */
export function attachPeerGateway(io: Server, apiKey: string | undefined, transformations: TransformationRegistry) {
  const directory = new PeerDirectory();
  const connections = createSocketPeerGateway(io, apiKey, directory);
  const destinationPolicy = new PeerDestinationPolicy(directory, new SocketPeerMessageDelivery(connections));
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

  const service = new PeerMessageService(transformations, destinationPolicy);
  const taskWorkflow = new TaskWorkflow({
    store: taskStore,
    listEServerInstances: () => directory.listInstances('eserver'),
    isEServerConnectionReady: instanceId => getConnection('eserver', instanceId)?.connected ?? false,
    isPServerConnected: () => destinationPolicy.isPServerConnected(),
    processMessage: (value, authenticatedFrom, authenticatedInstanceId) =>
      service.process(value, authenticatedFrom, authenticatedInstanceId),
    defer: work => { setImmediate(() => { void work(); }); },
    publishTaskLifecycle: notification => getConnection('aaui')?.emit('task:lifecycle', notification),
    publishTaskResultLifecycle: notification => getConnection('aaui')?.emit('task:result:lifecycle', notification)
  });

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
      return taskWorkflow.receiveTask(value);
    }
    if (authenticatedFrom === 'eserver' && value && typeof value === 'object' &&
        (value as { payload?: { type?: unknown } }).payload?.type === 'demo.task.result') {
      return taskWorkflow.receiveTaskResult(value, instanceId);
    }
    return processPeerMessageForAck(service, value, authenticatedFrom, instanceId);
  }

  async function sendTaskSnapshot(connection: PeerSocketConnection): Promise<void> {
    await sendTaskHistorySnapshot(connection, () => isCurrentAaui(connection), taskWorkflow);
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
    registerPServerTransport(transport: ExternalPeerTransport): void { destinationPolicy.registerPServerTransport(transport); },
    receiveFromPServer(value: unknown): Promise<PeerMessageAck> { return handleMessage(value, 'pserver'); }
  };
}
