import type { PeerMessage, PeerMessageAck } from '../peer-messaging/contracts.js';
import type { CdcTransport, VmInfo } from './contracts.js';
import { ProvenUnsentDeliveryError } from '../../shared/contracts/reliable-delivery.js';

export const SESSION_CONNECT_EVENT = 'automation_vm:session:connect';
export const DISPATCH_EVENT = 'activity:task:dispatch';

export interface CdcProtocolConfig {
  vmInfo: VmInfo;
}

export interface CdcGatewayCapabilities {
  registerCdcTransport(transport: { isConnected(): boolean; deliver(message: PeerMessage): Promise<void> }): void;
  receiveFromCdc(value: unknown): Promise<PeerMessageAck>;
  processCdcIngress?(value: unknown, acknowledge: (ack: PeerMessageAck) => void): Promise<void>;
  notifyCdcReady?(): void;
}

export function createCdcProtocol(config: CdcProtocolConfig, transport: CdcTransport, gateway: CdcGatewayCapabilities) {
  const { vmInfo } = config;
  let sessionId: string | undefined;
  let sessionReady = false;
  let registrationGeneration = 0;
  const isSessionReady = () => transport.connected && sessionReady;

  gateway.registerCdcTransport({
    isConnected: isSessionReady,
    async deliver(message) {
      if (!isSessionReady()) throw new ProvenUnsentDeliveryError('CDC session is not registered');
      const result = await transport.emitWithAck<{ ok?: boolean }>('peer:message', message, 5000);
      if (!result?.ok) throw new Error('CDC rejected message');
    }
  });

  transport.on('connect', () => {
    const generation = ++registrationGeneration;
    sessionReady = false;
    console.log(`[AS] CONNECT to CDC socket transport connected`);
    const payload = sessionId ? { session_id: sessionId } : vmInfo;
    console.log('[AS] SESSION CONNECT Sending:', payload);
    void transport.emitWithAck<SessionAck>(SESSION_CONNECT_EVENT, payload, 10_000).then(ack => {
      if (generation !== registrationGeneration) return;
      if (!ack?.ok || !ack.session?.id) {
        console.error('[AS] SESSION ERROR', ack);
        return;
      }
      sessionId = ack.session.id;
      sessionReady = true;
    gateway.notifyCdcReady?.();
      console.log('[AS] SESSION READY', { session_id: sessionId, vm_udid: ack.session.vm_udid });
    }, error => {
      if (generation !== registrationGeneration) return;
      console.error('[AS] SESSION TIMEOUT No server acknowledgement:', error instanceof Error ? error.message : error);
    });
  });

  transport.on(DISPATCH_EVENT, data => {
    console.log('[AS] ACTIVITY_TASK RECEIVED', data);
    if (!isSessionReady() || !sessionId) {
      console.warn('[AS] ACTIVITY_TASK Session not ready');
      return;
    }
    if (!data || typeof data !== 'object') {
      console.warn('[AS] ACTIVITY_TASK Invalid payload');
      return;
    }
    const task = data as { session_id?: unknown; vm_udid?: unknown };
    if (task.session_id !== sessionId) {
      console.warn('[AS] ACTIVITY_TASK Session mismatch');
      return;
    }
    if (task.vm_udid !== vmInfo.udid) {
      console.warn('[AS] ACTIVITY_TASK VM mismatch');
      return;
    }
    console.log('[AS] ACTIVITY_TASK VALIDATED', data);
    // No implicit forwarding: business destination and task processing will be defined later.
  });

  transport.on('peer:message', async (value, acknowledgement) => {
    const ack = typeof acknowledgement === 'function'
      ? acknowledgement as (result: PeerMessageAck) => void
      : undefined;
    if (!isSessionReady()) {
      ack?.({ ok: false, code: 'UNSUPPORTED_DESTINATION', error: 'Cdc session not ready' });
      return;
    }
    console.log('[AS] RECEIVE Cdc peer:message');
    if (!ack) return;
    if (gateway.processCdcIngress) await gateway.processCdcIngress(value, ack);
    else ack(await gateway.receiveFromCdc(value));
  });

  transport.on('connect_error', error => {
    console.error('[AS] Cdc connection error:', error instanceof Error ? error.message : error);
  });
  transport.on('disconnect', reason => {
    registrationGeneration += 1;
    sessionReady = false;
    console.log(`[AS] DISCONNECT from Cdc reason=${String(reason)}`);
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
