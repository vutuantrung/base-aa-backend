import { startPeerServer } from './shared/create-peer-server.mjs';
import { startScheduledPeerMessages } from './shared/scheduled-peer-message.mjs';
import { createMockVmInfo } from './shared/mock-vm-info.mjs';

export const SCHEDULE_CALL_TIME = 10_000; // Existing status update: 10 seconds
export const SEND_VM_INFO_TIME = 20_000; // VM information: 20 seconds

const port = Number(process.env.ESERVER_PORT ?? 3002);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid ESERVER_PORT');
const instanceId = process.env.ESERVER_INSTANCE_ID ?? `eserver-${port}`;
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(instanceId)) throw new Error('Invalid ESERVER_INSTANCE_ID');

const { socket } = await startPeerServer({ peerId: 'eserver', port, instanceId });

let sequence = 0;
let schedules = [];

function stopSchedules() {
  for (const schedule of schedules) schedule.stop();
  schedules = [];
}

function startSchedules() {
  stopSchedules();

  schedules = [
    startScheduledPeerMessages({
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
    }),
    startScheduledPeerMessages({
      socket,
      intervalMs: SEND_VM_INFO_TIME,
      createMessage: () => ({
        version: '1.0',
        kind: 'event',
        from: 'eserver',
        to: 'aaui',
        channel: 'worker',
        event: 'message',
        payload: {
          type: 'eserver.vm-info',
          version: '1.0',
          // VM data is an array; no extra wrapper fields are added.
          data: createMockVmInfo(instanceId)
        }
      })
    })
  ];
  console.log(`[eserver:${instanceId}] Scheduled messages: status ${SCHEDULE_CALL_TIME / 1000}s; VM info ${SEND_VM_INFO_TIME / 1000}s`);
}

// Each connection begins a fresh scheduling period; no messages are queued offline.
socket.on('connect', startSchedules);
socket.on('disconnect', stopSchedules);
if (socket.connected) startSchedules();

process.prependOnceListener('SIGINT', stopSchedules);
process.prependOnceListener('SIGTERM', stopSchedules);
