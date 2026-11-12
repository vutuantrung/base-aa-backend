import { startPeerServer } from './shared/create-peer-server.mjs';
import { startScheduledPeerMessages } from './shared/scheduled-peer-message.mjs';

export const SCHEDULE_CALL_TIME = 10_000; // 10 seconds
const { socket } = await startPeerServer({ peerId: 'eserver', port: 3002 });

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
        sequence: ++sequence,
        sentAt: new Date().toISOString(),
        message: 'Scheduled update from EServer'
      }
    }
  })
});

process.prependOnceListener('SIGINT', () => scheduler.stop());
process.prependOnceListener('SIGTERM', () => scheduler.stop());
console.log(`[eserver] SCHEDULE enabled: EServer -> AAB -> AAUI every ${SCHEDULE_CALL_TIME / 1000}s`);
