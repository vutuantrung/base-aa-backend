import { JsonTaskFileStore } from '../../modules/task-workflow/task-file-store.js';
import { TaskWorkflow } from '../../modules/task-workflow/task-workflow.js';
import { JsonResourceSelectionStore } from '../../modules/resource-selection/resource-selection-store.js';
import { ResourceSelectionWorkflow } from '../../modules/resource-selection/resource-selection-workflow.js';
import type { Server } from 'socket.io';
import type { PeerId, PeerMessageAck } from '../../modules/peer-messaging/contracts.js';
import { PeerMessageService, processPeerMessageForAck } from '../../modules/peer-messaging/peer-message-service.js';
import { PeerDestinationPolicy, type PServerPeerTransport } from '../../modules/peer-messaging/peer-destination-policy.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';
import { PeerDirectory } from '../../modules/peer-messaging/peer-directory.js';
import { createSocketPeerGateway, type PeerSocketConnection } from './socket-peer-gateway.js';
import { SocketPeerMessageDelivery } from './socket-peer-message-delivery.js';
import { sendTaskHistorySnapshot } from './task-history-snapshot.js';
import { sendResourceSelectionSnapshot } from './resource-selection-snapshot.js';

export interface ExternalPeerTransport extends PServerPeerTransport {}

export interface PeerMessageHandlerCapabilities {
  receiveResourceSelection(value: unknown): Promise<PeerMessageAck>;
  receiveTaskRequest(value: unknown): Promise<PeerMessageAck>;
  receiveTaskResult(value: unknown, authenticatedInstanceId?: string): Promise<PeerMessageAck>;
  processGenericMessage(
    value: unknown,
    authenticatedFrom: PeerId,
    authenticatedInstanceId?: string
  ): Promise<PeerMessageAck>;
}

/** M05 composes authenticated operation routing before delegating validation to each owner. */
export function createPeerMessageHandler(capabilities: PeerMessageHandlerCapabilities) {
  return async (value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessageAck> => {
    const operationType = getRawPayloadType(value);

    if (authenticatedFrom === 'aaui' && operationType === 'demo.resource-selection') {
      return await capabilities.receiveResourceSelection(value);
    }
    if (authenticatedFrom === 'pserver' && operationType === 'demo.task.request') {
      return await capabilities.receiveTaskRequest(value);
    }
    if (authenticatedFrom === 'eserver' && operationType === 'demo.task.result') {
      return await capabilities.receiveTaskResult(value, authenticatedInstanceId);
    }
    return await capabilities.processGenericMessage(value, authenticatedFrom, authenticatedInstanceId);
  };
}

function getRawPayloadType(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const payload: unknown = Reflect.get(value, 'payload');
  if (payload === null || payload === undefined) return undefined;
  const payloadContainer: object = Object(payload);
  return Reflect.get(payloadContainer, 'type');
}

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
  const selectionWorkflow = new ResourceSelectionWorkflow({
    store: selectionStore,
    processMessage: (value, authenticatedFrom) => service.process(value, authenticatedFrom),
    defer: work => { setImmediate(() => { void work(); }); },
    publishUpdated: record => getConnection('aaui')?.emit('resource-selection:updated', record)
  });

  function isCurrentAaui(connection: PeerSocketConnection): boolean {
    return connection.peerId === 'aaui' && directory.lookup('aaui')?.connectionId === connection.connectionId;
  }

  async function sendSelectionSnapshot(connection: PeerSocketConnection): Promise<void> {
    await sendResourceSelectionSnapshot(connection, () => isCurrentAaui(connection), selectionWorkflow);
  }

  const handleMessage = createPeerMessageHandler({
    receiveResourceSelection: value => selectionWorkflow.receiveSelection(value),
    receiveTaskRequest: value => taskWorkflow.receiveTask(value),
    receiveTaskResult: (value, authenticatedInstanceId) =>
      taskWorkflow.receiveTaskResult(value, authenticatedInstanceId),
    processGenericMessage: (value, authenticatedFrom, authenticatedInstanceId) =>
      processPeerMessageForAck(service, value, authenticatedFrom, authenticatedInstanceId)
  });

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
