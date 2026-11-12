import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { JsonTaskFileStore, taskSchema } from '../../modules/peer-messaging/task-file-store.js';
import type { Server, Socket } from 'socket.io';
import { type PeerId, type ClientPeerId, type PeerMessage, type PeerMessageAck, type IncomingPeerMessage, incomingPeerMessageSchema } from '../../modules/peer-messaging/contracts.js';
import { PeerMessageService, PeerMessageError } from '../../modules/peer-messaging/peer-message-service.js';
import type { TransformationRegistry } from '../../modules/peer-messaging/transformation-registry.js';

const inboundPeerIds = ['eserver', 'sserver', 'aaui'] as const;
const peerAuth = z.object({
  peerId: z.enum(inboundPeerIds),
  instanceId: z.string().trim().min(1).max(100).optional(),
  token: z.string().optional()
});

export interface ExternalPeerTransport {
  isConnected(): boolean;
  deliver(message: PeerMessage): Promise<void>;
}

/**
 * EServer instances have separate authenticated sockets keyed by instanceId.
 * SServer and AAUI retain their single-connection behavior.
 */
export function attachPeerGateway(io: Server, apiKey: string | undefined, transformations: TransformationRegistry) {
  const peers = io.of('/peers');
  const singlePeers = new Map<'sserver' | 'aaui', Socket>();
  const eservers = new Map<string, Socket>();
  let pserverTransport: ExternalPeerTransport | undefined;
  const taskStore = new JsonTaskFileStore();

  // Transport presence is distinct from the 10s/20s application message streams.
  // Socket.IO events for each AAUI connection are sent in order.
  function presenceSnapshot() {
    return {
      peerId: 'eserver' as const,
      timestamp: Date.now(),
      instances: [...eservers.entries()].map(([instanceId, socket]) => ({
        peerId: 'eserver' as const,
        instanceId,
        status: 'online' as const,
        socketId: socket.id,
        timestamp: Date.now()
      }))
    };
  }

  function publishPresence(instanceId: string, status: 'online' | 'offline', socketId: string, reason?: string): void {
    const target = singlePeers.get('aaui');
    if (!target?.connected) return;
    target.emit('peer:status', {
      peerId: 'eserver', instanceId, status, socketId,
      timestamp: Date.now(), ...(reason ? { reason } : {})
    });
  }

  function resolveTarget(message: IncomingPeerMessage): Socket | undefined {
    if (message.to === 'eserver') {
      if (message.toInstanceId) return eservers.get(message.toInstanceId);
      if (eservers.size === 1) return eservers.values().next().value;
      return undefined;
    }
    if (message.to === 'sserver' || message.to === 'aaui') return singlePeers.get(message.to);
    return undefined;
  }

  const service = new PeerMessageService(transformations, {
    async beforeDeliver(message: PeerMessage): Promise<void> {
      if (message.from === 'eserver' && message.to === 'pserver' &&
          message.payload.type === 'demo.task.result') {
        await taskStore.saveResult(taskSchema.parse(message.payload.data));
        console.log('[AAB] TASK RESULT STORED', (message.payload.data as { id: string }).id);
        return;
      }

    },
    isConnected(peer: PeerId, toInstanceId?: string) {
      if (peer === 'aab') return true;
      if (peer === 'pserver') return pserverTransport?.isConnected() ?? false;
      if (peer === 'eserver') return toInstanceId ? eservers.has(toInstanceId) : eservers.size > 0;
      return peer === 'sserver' || peer === 'aaui' ? singlePeers.has(peer) : false;
    },
    validateDestination(message: IncomingPeerMessage): void {
      if (message.to === 'eserver' && !message.toInstanceId && eservers.size > 1)
        throw new PeerMessageError('AMBIGUOUS_DESTINATION', 'Multiple EServer instances connected; toInstanceId is required');
    },
    async deliver(message: PeerMessage): Promise<void> {
      if (message.to === 'pserver') {
        if (!pserverTransport?.isConnected()) throw new Error('PServer is offline');
        await pserverTransport.deliver(message);
      } else {
        const target = resolveTarget(message);
        if (!target) throw new Error(`Destination ${message.to} is offline`);
        const response: { ok?: boolean } = await target.timeout(5000).emitWithAck('peer:message', message);
        if (!response?.ok) throw new Error(`Destination ${message.to} rejected message`);
      }
      console.log(`[AAB] FORWARD id=${message.id} from=${message.from} sourceInstance=${message.sourceInstanceId ?? '-'} to=${message.to} toInstance=${message.toInstanceId ?? '-'} type=${message.payload.type}`);
    }
  });

  function publishTaskEvent(
    task: z.infer<typeof taskSchema>, status: 'received' | 'forwarded' | 'forwardFailed',
    targetId?: string, reason?: string
  ): void {
    singlePeers.get('aaui')?.emit('task:lifecycle', {
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
    const targetId = parsed.data.toInstanceId ?? (eservers.size === 1 ? [...eservers.keys()][0] : undefined);
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
          const target = eservers.get(targetId);
          if (!target?.connected) throw new Error('EServer is offline');
          const outbound: IncomingPeerMessage = {
            ...parsed.data, toInstanceId: targetId,
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
      id: parsed.data.id ?? randomUUID(),
      timestamp: Date.now(),
      payload: structuredClone(parsed.data.payload)
    };
    return { ok: true, status: 'received', data: envelope };
  }

  async function handleMessage(value: unknown, authenticatedFrom: PeerId, instanceId?: string): Promise<PeerMessageAck> {
    if (authenticatedFrom === 'pserver' && value && typeof value === 'object' &&
        (value as { payload?: { type?: unknown } }).payload?.type === 'demo.task.request') {
      return receiveTask(value);
    }
    try {
      const message = await service.process(value, authenticatedFrom, instanceId);
      if (authenticatedFrom === 'eserver' && message.to === 'pserver' &&
          message.payload.type === 'demo.task.result') {
        const task = taskSchema.parse(message.payload.data);
        if (task.status === 'finished') {
          singlePeers.get('aaui')?.emit('task:lifecycle', {
            task, status: 'finished', instanceId, event: 'task.finished',
            timestamp: Date.now()
          });
        }
      }
      console.log(`[AAB] PROCESSED id=${message.id} from=${message.from} sourceInstance=${message.sourceInstanceId ?? '-'} to=${message.to} type=${message.payload.type} transformers=${message.processing?.processedBy.join(',') || 'none'}`);
      return { ok: true, data: message };
    } catch (error) {
      const code = error instanceof PeerMessageError ? error.code : 'TRANSFORMATION_FAILED';
      console.error(`[AAB] MESSAGE ERROR from=${authenticatedFrom} instance=${instanceId ?? '-'} code=${code}`, error);
      return { ok: false, code, error: error instanceof Error ? error.message : 'Internal message error' };
    }
  }

  peers.use((socket, next) => {
    const auth = peerAuth.safeParse(socket.handshake.auth);
    if (!auth.success) return next(new Error('invalid peer identity'));
    if (apiKey && auth.data.token !== apiKey) return next(new Error('unauthorized'));
    if (auth.data.peerId === 'eserver') {
      const instanceId = auth.data.instanceId ?? 'default';
      if (eservers.has(instanceId)) return next(new Error('EServer instance already connected'));
      socket.data.instanceId = instanceId;
    } else if (singlePeers.has(auth.data.peerId)) {
      return next(new Error('peer already connected'));
    }
    socket.data.peerId = auth.data.peerId;
    next();
  });

  peers.on('connection', (socket: Socket) => {
    const peerId = socket.data.peerId as Exclude<ClientPeerId, 'pserver'>;
    const instanceId = peerId === 'eserver' ? socket.data.instanceId as string : undefined;
    if (peerId === 'eserver') {
      if (eservers.has(instanceId!)) { socket.disconnect(true); return; }
      eservers.set(instanceId!, socket);
    } else {
      if (singlePeers.has(peerId)) { socket.disconnect(true); return; }
      singlePeers.set(peerId, socket);
    }
    console.log(`[AAB] CONNECT peer=${peerId} instance=${instanceId ?? '-'} socket=${socket.id}`);
    if (peerId === 'eserver') {
      publishPresence(instanceId!, 'online', socket.id);
    } else if (peerId === 'aaui') {
      // Late AAUI connections and reconnects always receive the online set.
      socket.emit('peer:status:snapshot', presenceSnapshot());
    }
    socket.emit('aab:welcome', { from: 'aab', to: peerId, instanceId, message: 'connected', timestamp: Date.now() });

    socket.on('peer:ping', (payload: unknown, ack?: (data: { ok: boolean; from: string; timestamp: number }) => void) => {
      console.log(`[AAB] RECEIVE peer=${peerId} instance=${instanceId ?? '-'} event=peer:ping payload=${JSON.stringify(payload)}`);
      ack?.({ ok: true, from: 'aab', timestamp: Date.now() });
    });
    socket.on('peer:message', async (value: unknown, ack?: (response: PeerMessageAck) => void) => {
      ack?.(await handleMessage(value, peerId, instanceId));
    });
    socket.on('disconnect', reason => {
      if (peerId === 'eserver') {
        if (eservers.get(instanceId!)?.id === socket.id) {
          eservers.delete(instanceId!);
          publishPresence(instanceId!, 'offline', socket.id, reason);
        }
      } else if (singlePeers.get(peerId)?.id === socket.id) {
        singlePeers.delete(peerId);
      }
      console.log(`[AAB] DISCONNECT peer=${peerId} instance=${instanceId ?? '-'} reason=${reason}`);
    });
  });

  return {
    registerPServerTransport(transport: ExternalPeerTransport): void { pserverTransport = transport; },
    receiveFromPServer(value: unknown): Promise<PeerMessageAck> { return handleMessage(value, 'pserver'); }
  };
}
