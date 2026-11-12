import { io } from 'socket.io-client';
import type { PeerMessage } from '../../modules/peer-messaging/contracts.js';
import type { attachPeerGateway } from './peer-gateway.js';

export const SESSION_CONNECT_EVENT = 'automation_vm:session:connect';
export const DISPATCH_EVENT = 'activity:task:dispatch';

export interface VmInfo {
  udid: string;
  sdk: string;
  model: string;
  abi: string;
  forSearch: boolean;
  platforms: string[];
}

export interface PServerConnectionConfig {
  url: string;
  /** Socket.IO engine path (NOT namespace). The example uses '/ws'. */
  path?: string;
  vmInfo: VmInfo;
  apiKey?: string;
}

type SessionAck = {
  ok?: boolean;
  session?: { id?: string; vm_udid?: string };
};

/**
 * AAB is a Socket.IO CLIENT on the default namespace.
 * Protocol is compatible with connect-socket-example.js:
 *   path=/ws, session registration on each connect, task dispatch listener.
 * The existing peer:message event is also retained for AAB routing demos.
 */
export function connectToPServer(
  config: PServerConnectionConfig,
  gateway: ReturnType<typeof attachPeerGateway>
) {
  if (!config.vmInfo.udid.trim()) throw new Error('PServer VM UDID is required');

  const { url, apiKey, vmInfo } = config;
  let sessionId: string | undefined;
  let sessionReady = false;
  const client = io(url, {
    path: config.path ?? '/ws',
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    auth: { peerId: 'aab', ...(apiKey ? { token: apiKey } : {}) }
  });

  gateway.registerPServerTransport({
    isConnected: () => client.connected && sessionReady,
    async deliver(message: PeerMessage): Promise<void> {
      if (!sessionReady) throw new Error('PServer session is not registered');
      const result: { ok?: boolean } = await client.timeout(5000).emitWithAck('peer:message', message);
      if (!result?.ok) throw new Error('PServer rejected message');
    }
  });

  client.on('connect', () => {
    sessionReady = false;
    console.log(`[AAB] CONNECT to PServer url=${url} socket=${client.id}`);
    const payload = sessionId ? { session_id: sessionId } : vmInfo;
    console.log('[AAB] SESSION CONNECT Sending:', payload);
    client.timeout(10_000).emit(SESSION_CONNECT_EVENT, payload, (error: Error | null, ack: SessionAck) => {
      if (error) {
        console.error('[AAB] SESSION TIMEOUT No server acknowledgement:', error.message);
        return;
      }
      if (!ack?.ok || !ack.session?.id) {
        console.error('[AAB] SESSION ERROR', ack);
        return;
      }
      sessionId = ack.session.id;
      sessionReady = true;
      console.log('[AAB] SESSION READY', { session_id: sessionId, vm_udid: ack.session.vm_udid });
    });
  });

  client.on(DISPATCH_EVENT, (data: unknown) => {
    console.log('[AAB] ACTIVITY_TASK RECEIVED', data);
    if (!sessionReady || !sessionId) {
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

  client.on('peer:message', async (value: unknown, ack?: (result: Awaited<ReturnType<typeof gateway.receiveFromPServer>>) => void) => {
    if (!sessionReady) {
      ack?.({ ok: false, code: 'UNSUPPORTED_DESTINATION', error: 'PServer session not ready' });
      return;
    }
    console.log('[AAB] RECEIVE PServer peer:message');
    ack?.(await gateway.receiveFromPServer(value));
  });

  client.on('connect_error', error => console.error('[AAB] PServer connection error:', error.message));
  client.on('disconnect', reason => {
    sessionReady = false;
    console.log(`[AAB] DISCONNECT from PServer reason=${reason}`);
  });

  return {
    connect: () => client.connect(),
    close: () => client.disconnect(),
    get connected() { return client.connected && sessionReady; },
    get sessionId() { return sessionId; }
  };
}
