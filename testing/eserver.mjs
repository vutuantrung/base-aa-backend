import { startPeerServer } from './shared/create-peer-server.mjs';
import { startScheduledPeerMessages } from './shared/scheduled-peer-message.mjs';

export const SCHEDULE_CALL_TIME = 10_000; // 10 seconds
const port = Number(process.env.ESERVER_PORT ?? 3002);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ESERVER_PORT');
const instanceId = process.env.ESERVER_INSTANCE_ID ?? `eserver-${port}`;
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(instanceId)) throw new Error('Invalid ESERVER_INSTANCE_ID');
const { socket } = await startPeerServer({ peerId: 'eserver', port, instanceId });

let sequence = 0;
const scheduler = startScheduledPeerMessages({
  socket,
  intervalMs: SCHEDULE_CALL_TIME,
  createMessage: () => ({
    version: '1.0',
    kind: 'event',
    from: 'eserver',
    to: 'aaui',
    channel: 'worker',
    event: 'message',
    payload: {
      type: 'eserver.scheduled-update',
      version: '1.0',
      data: {
        instanceId,
        sequence: ++sequence,
        sentAt: new Date().toISOString(),
        message: 'Scheduled update from EServer'
      }
    }
  })
});

process.prependOnceListener('SIGINT', () => scheduler.stop());
process.prependOnceListener('SIGTERM', () => scheduler.stop());
console.log(`[eserver:${instanceId}] SCHEDULE enabled: EServer -> AAB -> AAUI every ${SCHEDULE_CALL_TIME / 1000}s`);
