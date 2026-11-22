import type { PeerMessage, PeerMessageAck } from '../peer-messaging/contracts.js';
import type { PServerTransport, VmInfo } from './contracts.js';
import { ProvenUnsentDeliveryError } from '../../shared/contracts/reliable-delivery.js';

export const SESSION_CONNECT_EVENT = 'automation_vm:session:connect';
export const DISPATCH_EVENT = 'activity:task:dispatch';

export interface PServerProtocolConfig {
  vmInfo: VmInfo;
}

export interface PServerGatewayCapabilities {
  registerPServerTransport(transport: { isConnected(): boolean; deliver(message: PeerMessage): Promise<void> }): void;
  receiveFromPServer(value: unknown): Promise<PeerMessageAck>;
  notifyPServerReady?(): void;
}

export function createPServerProtocol(config: PServerProtocolConfig, transport: PServerTransport, gateway: PServerGatewayCapabilities) {
  const { vmInfo } = config;
  let sessionId: string | undefined;
  let sessionReady = false;
  let registrationGeneration = 0;
  const isSessionReady = () => transport.connected && sessionReady;

  gateway.registerPServerTransport({
    isConnected: isSessionReady,
    async deliver(message) {
      if (!isSessionReady()) throw new ProvenUnsentDeliveryError('PServer session is not registered');
      const result = await transport.emitWithAck<{ ok?: boolean }>('peer:message', message, 5000);
      if (!result?.ok) throw new Error('PServer rejected message');
    }
  });

  transport.on('connect', () => {
    const generation = ++registrationGeneration;
    sessionReady = false;
    console.log(`[AAB] CONNECT to PServer socket transport connected`);
    const payload = sessionId ? { session_id: sessionId } : vmInfo;
    console.log('[AAB] SESSION CONNECT Sending:', payload);
    void transport.emitWithAck<SessionAck>(SESSION_CONNECT_EVENT, payload, 10_000).then(ack => {
      if (generation !== registrationGeneration) return;
      if (!ack?.ok || !ack.session?.id) {
        console.error('[AAB] SESSION ERROR', ack);
        return;
      }
      sessionId = ack.session.id;
      sessionReady = true;
      gateway.notifyPServerReady?.();
      console.log('[AAB] SESSION READY', { session_id: sessionId, vm_udid: ack.session.vm_udid });
    }, error => {
      if (generation !== registrationGeneration) return;
      console.error('[AAB] SESSION TIMEOUT No server acknowledgement:', error instanceof Error ? error.message : error);
    });
  });

  transport.on(DISPATCH_EVENT, data => {
    console.log('[AAB] ACTIVITY_TASK RECEIVED', data);
    if (!isSessionReady() || !sessionId) {
      console.warn('[AAB] ACTIVITY_TASK Session not ready');
      return;
    }
    if (!data || typeof data !== 'object') {
      console.warn('[AAB] ACTIVITY_TASK Invalid payload');
      return;
    }
    const task = data as { session_id?: unknown; vm_udid?: unknown };
    if (task.session_id !== sessionId) {
      console.warn('[AAB] ACTIVITY_TASK Session mismatch');
      return;
    }
    if (task.vm_udid !== vmInfo.udid) {
      console.warn('[AAB] ACTIVITY_TASK VM mismatch');
      return;
    }
    console.log('[AAB] ACTIVITY_TASK VALIDATED', data);
    // No implicit forwarding: business destination and task processing will be defined later.
  });

  transport.on('peer:message', async (value, acknowledgement) => {
    const ack = typeof acknowledgement === 'function'
      ? acknowledgement as (result: PeerMessageAck) => void
      : undefined;
    if (!isSessionReady()) {
      ack?.({ ok: false, code: 'UNSUPPORTED_DESTINATION', error: 'PServer session not ready' });
      return;
    }
    console.log('[AAB] RECEIVE PServer peer:message');
    ack?.(await gateway.receiveFromPServer(value));
  });

  transport.on('connect_error', error => {
    console.error('[AAB] PServer connection error:', error instanceof Error ? error.message : error);
  });
  transport.on('disconnect', reason => {
    registrationGeneration += 1;
    sessionReady = false;
    console.log(`[AAB] DISCONNECT from PServer reason=${String(reason)}`);
  });

  return {
    connect: () => transport.connect(),
    close: () => {
      registrationGeneration += 1;
      sessionReady = false;
      transport.close();
    },
    get connected() { return isSessionReady(); },
    get sessionId() { return sessionId; }
  };
}

type SessionAck = {
  ok?: boolean;
  session?: { id?: string; vm_udid?: string };
};
