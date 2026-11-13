import { startPeerServer } from './shared/create-peer-server.mjs';
import { startScheduledPeerMessages } from './shared/scheduled-peer-message.mjs';

export const SCHEDULE_CALL_TIME = 10_000; // F03 status update interval, unchanged.

const { socket } = await startPeerServer({ peerId: 'sserver', port: 3003 });
let sequence = 0;
let schedule;

function stopSchedule() {
  schedule?.stop();
  schedule = undefined;
}

function startSchedule() {
  stopSchedule();
  schedule = startScheduledPeerMessages({
    socket,
    intervalMs: SCHEDULE_CALL_TIME,
    createMessage: () => ({
      version: '1.0',
      kind: 'event',
      from: 'sserver',
      to: 'aaui',
      channel: 'worker',
      event: 'message',
      payload: {
        type: 'sserver.scheduled-update',
        version: '1.0',
        data: {
          instanceId: 'sserver',
          sequence: ++sequence,
          sentAt: new Date().toISOString(),
          message: 'Scheduled update from SServer'
        }
      }
    })
  });
  console.log(`[sserver] F03 status messages every ${SCHEDULE_CALL_TIME / 1000}s`);
}

// Exactly the former F03 lifecycle: initial tick after 10s,
// skip when offline/in-flight, restart schedule after reconnect.
socket.on('connect', startSchedule);
socket.on('disconnect', stopSchedule);
if (socket.connected) startSchedule();

process.prependOnceListener('SIGINT', stopSchedule);
process.prependOnceListener('SIGTERM', stopSchedule);
