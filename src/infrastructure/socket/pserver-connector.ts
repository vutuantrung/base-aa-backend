import { io } from 'socket.io-client';

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
  /** Engine.IO path, not a namespace. */
  path?: string;
  vmInfo: VmInfo;
  apiKey?: string;
}

type SessionAck = {
  ok?: boolean;
  session?: { id?: string; vm_udid?: string };
};

export function connectToPServer(config: PServerConnectionConfig) {
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

  function isReady(): boolean {
    return client.connected && sessionReady;
  }

  function registerSession(): void {
    sessionReady = false;
    console.log('[AAB] CONNECT to PServer', client.id);
    const payload = sessionId ? { session_id: sessionId } : vmInfo;
    client.timeout(10_000).emit(SESSION_CONNECT_EVENT, payload, (error: Error | null, ack: SessionAck) => {
      if (error) {
        console.error('[AAB] SESSION TIMEOUT', error.message);
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
  }

  function receiveTask(data: unknown): void {
    console.log('[AAB] ACTIVITY_TASK RECEIVED', data);
    if (!isReady() || !sessionId) {
      console.warn('[AAB] ACTIVITY_TASK Session not ready');
      return;
    }
    if (!data || typeof data !== 'object') {
      console.warn('[AAB] ACTIVITY_TASK Invalid payload');
      return;
    }
    if (!('session_id' in data) || data.session_id !== sessionId) {
      console.warn('[AAB] ACTIVITY_TASK Session mismatch');
      return;
    }
    if (!('vm_udid' in data) || data.vm_udid !== vmInfo.udid) {
      console.warn('[AAB] ACTIVITY_TASK VM mismatch');
      return;
    }
    console.log('[AAB] ACTIVITY_TASK VALIDATED', data);
  }

  function receiveMessage(value: unknown, ack?: (response: unknown) => void): void {
    if (!isReady()) {
      ack?.({ ok: false, error: 'PServer session not ready' });
      return;
    }
    console.log('[AAB] RECEIVE PServer peer:message', value);
    ack?.({ ok: true });
  }

  async function sendMessage(value: unknown): Promise<void> {
    if (!isReady()) throw new Error('PServer session not ready');
    const result: { ok?: boolean } = await client.timeout(5000).emitWithAck('peer:message', value);
    if (!result?.ok) throw new Error('PServer rejected message');
  }

  client.on('connect', registerSession);
  client.on(DISPATCH_EVENT, receiveTask);
  client.on('peer:message', receiveMessage);
  client.on('connect_error', error => console.error('[AAB] PServer connection error:', error.message));
  client.on('disconnect', reason => {
    sessionReady = false;
    console.log('[AAB] DISCONNECT from PServer', reason);
  });

  return {
    connect: () => client.connect(),
    close: () => client.disconnect(),
    get connected() { return isReady(); },
    get sessionId() { return sessionId; },
    sendMessage
  };
}
