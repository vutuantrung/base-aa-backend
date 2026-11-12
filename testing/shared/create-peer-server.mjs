import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';
import taskFlow from './task-flow.cjs';
const { TASK_REQUEST_TYPE, TASK_STATUS, isTask } = taskFlow;

/**
 * Shared infrastructure for EServer / SServer.
 * Each runs its own Express + Socket.IO server and one outgoing AAB client.
 * PServer has a separate inbound Socket.IO implementation in testing/pserver.mjs.
 * Business communication channels are intentionally NOT defined here.
 */
export async function startPeerServer({ peerId, port, instanceId }) {
  const aabUrl = process.env.AAB_URL ?? 'http://127.0.0.1:3000';
  const host = process.env.PEER_HOST ?? '127.0.0.1';
  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const ioServer = new Server(server, { cors: { origin: false } });
  const socket = io(`${aabUrl.replace(/\/$/, '')}/peers`, {
    autoConnect: false,
    reconnection: true,
    transports: ['websocket'],
    auth: { peerId, ...(instanceId ? { instanceId } : {}), ...(process.env.API_KEY ? { token: process.env.API_KEY } : {}) }
  });

  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => res.json({
    server: peerId,
    instanceId: instanceId ?? null,
    port,
    aabConnected: socket.connected,
    status: 'running'
  }));

  app.post('/messages', async (req, res) => {
    if (!socket.connected) { res.status(503).json({ ok: false, error: 'AAB is offline' }); return; }
    try {
      const response = await socket.timeout(8000).emitWithAck('peer:message', req.body);
      console.log(`[${peerId}] SEND peer:message`, req.body, 'ACK', response);
      res.status(response.ok ? 200 : 422).json(response);
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Send failed' });
    }
  });

  // Local diagnostic Socket.IO server. Inbound only; intentionally no relay to AAB.
  ioServer.on('connection', client => {
    console.log(`[${peerId}] LOCAL SOCKET CONNECT id=${client.id}`);
    client.emit('peer:local-welcome', { from: peerId, message: 'connected locally' });
    client.on('disconnect', reason => console.log(`[${peerId}] LOCAL SOCKET DISCONNECT id=${client.id} reason=${reason}`));
  });

  socket.on('connect', () => {
    console.log(`[${peerId}] CONNECT to AAB instance=${instanceId ?? '-'} socket=${socket.id}`);
    socket.timeout(5000).emit('peer:ping', { from: peerId }, (error, response) => {
      if (error) { console.error(`[${peerId}] PING FAILED`, error.message); return; }
      console.log(`[${peerId}] RECEIVE peer:ping ACK`, response);
    });
  });
  // EServer only acknowledges receipt. Completion must come from explicit
  // EServer business processing; there is no automatic 5-second transition.
  const receivedTaskIds = new Set();
  socket.on('peer:message', (message, ack) => {
    console.log(`[${peerId}] RECEIVE peer:message`, JSON.stringify(message));
    if (peerId === 'eserver' && message?.from === 'pserver' && message?.to === 'eserver' &&
        message.payload?.type === TASK_REQUEST_TYPE) {
      const task = message.payload.data;
      if (!isTask(task, TASK_STATUS.inProgress) || receivedTaskIds.has(task.id)) {
        ack?.({ ok: false, error: 'Invalid or duplicate task' });
        return;
      }
      receivedTaskIds.add(task.id);
      console.log(`[eserver:${instanceId}] TASK ACCEPTED (awaiting explicit completion)`, JSON.stringify(task));
    }
    ack?.({ ok: true, status: 'received' });
  });
  socket.on('aab:welcome', message => console.log(`[${peerId}] RECEIVE aab:welcome`, message));
  socket.on('connect_error', error => console.error(`[${peerId}] AAB CONNECT ERROR`, error.message));
  socket.on('disconnect', reason => console.log(`[${peerId}] AAB DISCONNECT reason=${reason}`));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  console.log(`[${peerId}] HTTP + Socket.IO instance=${instanceId ?? '-'} listening at http://${host}:${port}`);
  socket.connect();

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    socket.disconnect();
    await new Promise(resolve => ioServer.close(resolve));
    if (server.listening) await new Promise(resolve => server.close(resolve));
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  return { app, server, ioServer, socket };
}
