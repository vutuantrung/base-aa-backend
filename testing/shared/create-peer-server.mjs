import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

/**
 * Shared infrastructure for PServer / EServer / SServer.
 * Each runs its own Express + Socket.IO server and one outgoing AAB client.
 * Business communication channels are intentionally NOT defined here.
 */
export async function startPeerServer({ peerId, port }) {
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
    auth: { peerId, ...(process.env.API_KEY ? { token: process.env.API_KEY } : {}) }
  });

  app.get('/health', (_req, res) => res.json({
    server: peerId,
    port,
    aabConnected: socket.connected,
    status: 'running'
  }));

  // Local diagnostic Socket.IO server. Inbound only; intentionally no relay to AAB.
  ioServer.on('connection', client => {
    console.log(`[${peerId}] LOCAL SOCKET CONNECT id=${client.id}`);
    client.emit('peer:local-welcome', { from: peerId, message: 'connected locally' });
    client.on('disconnect', reason => console.log(`[${peerId}] LOCAL SOCKET DISCONNECT id=${client.id} reason=${reason}`));
  });

  socket.on('connect', () => {
    console.log(`[${peerId}] CONNECT to AAB socket=${socket.id}`);
    socket.timeout(5000).emit('peer:ping', { from: peerId }, (error, response) => {
      if (error) { console.error(`[${peerId}] PING FAILED`, error.message); return; }
      console.log(`[${peerId}] RECEIVE peer:ping ACK`, response);
    });
  });
  socket.on('aab:welcome', message => console.log(`[${peerId}] RECEIVE aab:welcome`, message));
  socket.on('connect_error', error => console.error(`[${peerId}] AAB CONNECT ERROR`, error.message));
  socket.on('disconnect', reason => console.log(`[${peerId}] AAB DISCONNECT reason=${reason}`));

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  console.log(`[${peerId}] HTTP + Socket.IO listening at http://${host}:${port}`);
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
