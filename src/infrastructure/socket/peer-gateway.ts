import { JsonTaskFileStore } from '../../modules/task-workflow/task-file-store.js';
import { TaskWorkflow } from '../../modules/task-workflow/task-workflow.js';
import { JsonResourceSelectionStore } from '../../modules/resource-selection/resource-selection-store.js';
import { ResourceSelectionWorkflow } from '../../modules/resource-selection/resource-selection-workflow.js';
import type { Server } from 'socket.io';
import type { PeerId, PeerMessageAck } from '../../modules/peer-messaging/contracts.js';
import { PeerMessageService, processPeerMessageForAck } from '../../modules/peer-messaging/peer-message-service.js';
import { PeerDestinationPolicy, type CdcPeerTransport } from '../../modules/peer-messaging/peer-destination-policy.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';
import { PeerDirectory } from '../../modules/peer-messaging/peer-directory.js';
import { createSocketPeerGateway, type PeerSocketConnection } from './socket-peer-gateway.js';
import { SocketPeerMessageDelivery } from './socket-peer-message-delivery.js';
import { sendTaskHistorySnapshot } from './task-history-snapshot.js';
import { sendResourceSelectionSnapshot } from './resource-selection-snapshot.js';
import type { ReliabilityRunnerPolicy } from '../../shared/persistence/reliable-outbox-runner.js';
import { DEFAULT_RELIABILITY_LIMITS } from '../../shared/persistence/atomic-json-record-store.js';
import type { ApplicationAdmission } from '../../shared/contracts/application-admission.js';

export interface ExternalPeerTransport extends CdcPeerTransport { }

export interface PeerMessageHandlerCapabilities {
  receiveResourceSelection(value: unknown): Promise<PeerMessageAck>;
  receiveTaskRequest(value: unknown): Promise<PeerMessageAck>;
  receiveTaskResult(value: unknown, authenticatedInstanceId?: string): Promise<PeerMessageAck>;
  notifyCdcReady?(): void;
  processGenericMessage(
    value: unknown,
    authenticatedFrom: PeerId,
    authenticatedInstanceId?: string
  ): Promise<PeerMessageAck>;
}

export async function processAdmittedPeerMessage(
  coordinator: ApplicationAdmission | undefined,
  value: unknown,
  authenticatedFrom: PeerId,
  instanceId: string | undefined,
  handle: (value: unknown, from: PeerId, instanceId?: string) => Promise<PeerMessageAck>,
  acknowledge: (ack: PeerMessageAck) => void
): Promise<void> {
  const processAndAcknowledge = async () => { acknowledge(await handle(value, authenticatedFrom, instanceId)); };
  if (!coordinator) { await processAndAcknowledge(); return; }
  try { await coordinator.run('peer', processAndAcknowledge); }
  catch (error) {
    if (error instanceof Error && error.message === 'APPLICATION_DRAINING') {
      acknowledge({ ok: false, code: 'DELIVERY_FAILED', error: 'APPLICATION_DRAINING' });
      return;
    }
    throw error;
  }
}

/** M05 composes authenticated operation routing before delegating validation to each owner. */
export function createPeerMessageHandler(capabilities: PeerMessageHandlerCapabilities) {
  return async (value: unknown, authenticatedFrom: PeerId, authenticatedInstanceId?: string): Promise<PeerMessageAck> => {
    const operationType = getRawPayloadType(value);

    if (authenticatedFrom === 'aa' && operationType === 'demo.resource-selection') {
      return await capabilities.receiveResourceSelection(value);
    }
    if (authenticatedFrom === 'cdc' && operationType === 'automation.task.request') {
      return await capabilities.receiveTaskRequest(value);
    }
    if (authenticatedFrom === 'eserver' && operationType === 'automation.task.result') {
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
 * Spa and Aa retain their single-connection behavior.
 */
export function attachPeerGateway(
  io: Server, apiKey: string | undefined, transformations: TransformationRegistry,
  reliabilityPolicy?: ReliabilityRunnerPolicy, coordinator?: ApplicationAdmission
) {
  const directory = new PeerDirectory();
  const connections = createSocketPeerGateway(io, apiKey, directory, () => coordinator?.isAccepting() ?? true);
  const destinationPolicy = new PeerDestinationPolicy(directory, new SocketPeerMessageDelivery(connections));
  // P03 states one capacity bound without defining its scope across the two
  // independently retained workflow directories. Split it evenly so the
  // composed application cannot exceed the approved aggregate defaults.
  const workflowCapacity = {
    maxRecords: DEFAULT_RELIABILITY_LIMITS.maxRecords / 2,
    maxBytes: DEFAULT_RELIABILITY_LIMITS.maxBytes / 2
  };
  const taskStore = new JsonTaskFileStore(undefined, workflowCapacity);
  const selectionStore = new JsonResourceSelectionStore(undefined, workflowCapacity);

  function getConnection(peerId: 'eserver' | 'spa' | 'aa', instanceId?: string): PeerSocketConnection | undefined {
    const identity = directory.lookup(peerId, instanceId);
    return identity ? connections.getConnection(identity.connectionId) : undefined;
  }

  // Transport presence is distinct from the 10s/20s application message streams.
  // Socket.IO events for each Aa connection are sent in order.
  function presenceSnapshot() {
    return directory.presenceSnapshot();
  }

  function publishPresence(instanceId: string, status: 'online' | 'offline', socketId: string, reason?: string): void {
    if (coordinator && !coordinator.isAccepting()) return;
    const target = getConnection('aa');
    if (!target?.connected) return;
    target.emit('peer:status', { peerId: 'eserver', instanceId, status, socketId, timestamp: Date.now(), ...(reason ? { reason } : {}) });
  }

  const service = new PeerMessageService(transformations, destinationPolicy);
  const taskWorkflow = new TaskWorkflow({
    store: taskStore,
    outbox: taskStore.reliability,
    hasLegacyOperation: (kind, taskId) => taskStore.hasLegacyOperation(kind, taskId),
    projectLegacyOperation: payload => taskStore.projectLegacyOperation(payload),
    listEServerInstances: () => directory.listInstances('eserver'),
    isEServerConnectionReady: instanceId => getConnection('eserver', instanceId)?.connected ?? false,
    isCdcConnected: () => destinationPolicy.isCdcConnected(),
    processMessage: (value, authenticatedFrom, authenticatedInstanceId) => service.process(value, authenticatedFrom, authenticatedInstanceId),
    prepareForDurableDelivery: (value, authenticatedFrom, authenticatedInstanceId) => service.prepareForDurableDelivery(value, authenticatedFrom, authenticatedInstanceId),
    deliverPreparedMessage: message => service.deliverPreparedMessage(message),
    reliabilityPolicy,
    defer: work => { setImmediate(() => { void work(); }); },
    publishTaskLifecycle: notification => getConnection('aa')?.emit('task:lifecycle', notification),
    publishTaskResultLifecycle: notification => getConnection('aa')?.emit('task:result:lifecycle', notification)
  });
  const selectionWorkflow = new ResourceSelectionWorkflow({
    store: selectionStore,
    outbox: selectionStore.reliability,
    projectLegacyReceipt: record => selectionStore.projectLegacyReceipt(record),
    processMessage: (value, authenticatedFrom) => service.process(value, authenticatedFrom),
    prepareForDurableDelivery: (value, authenticatedFrom) => service.prepareForDurableDelivery(value, authenticatedFrom),
    deliverPreparedMessage: message => service.deliverPreparedMessage(message),
    isCdcConnected: () => destinationPolicy.isCdcConnected(),
    reliabilityPolicy,
    defer: work => { setImmediate(() => { void work(); }); },
    publishUpdated: record => getConnection('aa')?.emit('resource-selection:updated', record)
  });

  function isCurrentAa(connection: PeerSocketConnection): boolean {
    return connection.peerId === 'aa' && directory.lookup('aa')?.connectionId === connection.connectionId;
  }

  async function sendSelectionSnapshot(connection: PeerSocketConnection): Promise<void> {
    await sendResourceSelectionSnapshot(connection, () => isCurrentAa(connection), selectionWorkflow);
  }

  const handleMessage = createPeerMessageHandler({
    receiveResourceSelection: value => selectionWorkflow.receiveSelection(value),
    receiveTaskRequest: value => taskWorkflow.receiveTask(value),
    receiveTaskResult: (value, authenticatedInstanceId) => taskWorkflow.receiveTaskResult(value, authenticatedInstanceId),
    processGenericMessage: (value, authenticatedFrom, authenticatedInstanceId) => processPeerMessageForAck(service, value, authenticatedFrom, authenticatedInstanceId)
  });

  async function receiveAdmittedMessage(value: unknown, authenticatedFrom: PeerId, instanceId?: string): Promise<PeerMessageAck> {
    if (!coordinator) return handleMessage(value, authenticatedFrom, instanceId);
    try { return await coordinator.run('peer', () => handleMessage(value, authenticatedFrom, instanceId)); }
    catch (error) {
      if (error instanceof Error && error.message === 'APPLICATION_DRAINING')
        return { ok: false, code: 'DELIVERY_FAILED', error: 'APPLICATION_DRAINING' };
      throw error;
    }
  }

  async function processCdcIngress(value: unknown, acknowledge: (ack: PeerMessageAck) => void): Promise<void> {
    await processAdmittedPeerMessage(coordinator, value, 'cdc', undefined, handleMessage, acknowledge);
  }

  function runSnapshot(operation: () => Promise<void>): void {
    const work = coordinator ? coordinator.run('snapshot', operation) : operation();
    void work.catch(error => {
      if (!(error instanceof Error && error.message === 'APPLICATION_DRAINING'))
        console.error('[AS] SNAPSHOT FAILED', error instanceof Error ? error.message : 'unknown');
    });
  }

  async function sendTaskSnapshot(connection: PeerSocketConnection): Promise<void> {
    await sendTaskHistorySnapshot(connection, () => isCurrentAa(connection), taskWorkflow);
  }

  connections.onConnection(connection => {
    if (coordinator && !coordinator.isAccepting()) { connection.disconnect(); return; }
    const peerId = connection.peerId;
    const instanceId = connection.instanceId;
    console.log(`[AS] CONNECT peer=${peerId} instance=${instanceId ?? '-'} socket=${connection.connectionId}`);
    if (peerId === 'eserver') {
      void taskWorkflow.destinationReady();
      publishPresence(instanceId!, 'online', connection.connectionId);
    } else if (peerId === 'aa') {
      // Late Aa connections and reconnects always receive the online set.
      connection.emit('peer:status:snapshot', presenceSnapshot());
      // Task lifecycle events are transient; rehydrate the dashboard from disk.
      runSnapshot(() => sendTaskSnapshot(connection));
      runSnapshot(() => sendSelectionSnapshot(connection));
    }

    connection.emit('as:welcome', { from: 'as', to: peerId, instanceId, message: 'connected', timestamp: Date.now() });

    if (peerId === 'aa') {
      connection.on('task:lifecycle:refresh', () => { runSnapshot(() => sendTaskSnapshot(connection)); });
      connection.on('resource-selection:refresh', () => { runSnapshot(() => sendSelectionSnapshot(connection)); });
    }

    connection.on('peer:ping', (payload, ackCandidate) => {
      console.log(`[AS] RECEIVE peer=${peerId} instance=${instanceId ?? '-'} event=peer:ping payload=${JSON.stringify(payload)}`);
      if (typeof ackCandidate === 'function') ackCandidate({ ok: true, from: 'as', timestamp: Date.now() });
    });
    connection.on('peer:message', async (value, ackCandidate) => {
      if (typeof ackCandidate !== 'function') return;
      await processAdmittedPeerMessage(coordinator, value, peerId, instanceId, handleMessage, ack => ackCandidate(ack));
    });
    connection.onDisconnect((reason, removedCurrentIdentity) => {
      if (peerId === 'eserver' && removedCurrentIdentity) {
        publishPresence(instanceId!, 'offline', connection.connectionId, reason);
      }
      console.log(`[AS] DISCONNECT peer=${peerId} instance=${instanceId ?? '-'} reason=${reason}`);
    });
  });

  return {
    async start(deferDelivery = false): Promise<void> {
      try {
        await taskWorkflow.start(!deferDelivery);
        await selectionWorkflow.start(!deferDelivery);
      }
      catch (error) {
        this.beginDrain();
        await this.waitForIdle();
        await this.close();
        throw error;
      }
    },
    async activate(): Promise<void> {
      await Promise.all([taskWorkflow.activate(), selectionWorkflow.activate()]);
    },
    beginDrain(): void {
      taskWorkflow.close();
      selectionWorkflow.close();
    },
    async waitForIdle(): Promise<void> {
      await Promise.all([taskWorkflow.waitForIdle(), selectionWorkflow.waitForIdle()]);
    },
    workCounts() {
      return { task: taskWorkflow.workCounts(), selection: selectionWorkflow.workCounts() };
    },
    async close(preserveLock = false): Promise<void> {
      this.beginDrain();
      await this.waitForIdle();
      await Promise.all([
        taskStore.reliability.close(preserveLock),
        selectionStore.reliability.close(preserveLock)
      ]);
    },
    notifyCdcReady(): void {
      void Promise.all([taskWorkflow.destinationReady(), selectionWorkflow.destinationReady()]);
    },
    registerCdcTransport(transport: ExternalPeerTransport): void { destinationPolicy.registerCdcTransport(transport); },
    receiveFromCdc(value: unknown): Promise<PeerMessageAck> { return receiveAdmittedMessage(value, 'cdc'); },
    processCdcIngress
  };
}
