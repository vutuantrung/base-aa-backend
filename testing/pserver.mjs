import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';

const port = 3001;
const host = process.env.PEER_HOST ?? '127.0.0.1';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
const server = createServer(app);
const io = new Server(server, { path: '/ws', cors: { origin: false }, maxHttpBufferSize: 1_000_000 });
const namespace = io.of('/');
const sessions = new Map();
let activeSessionId;
let aabSocket;

namespace.use((socket, next) => {
  if (socket.handshake.auth?.peerId !== 'aab') return next(new Error('invalid AAB identity'));
  if (process.env.API_KEY && socket.handshake.auth?.token !== process.env.API_KEY)
    return next(new Error('unauthorized'));
  if (aabSocket?.connected) return next(new Error('AAB already connected'));
  next();
});

namespace.on('connection', socket => {
  if (aabSocket?.connected) { socket.disconnect(true); return; }
  aabSocket = socket;
  console.log(`[pserver] ACCEPT AAB Socket.IO connection id=${socket.id}`);
  socket.on('automation_vm:session:connect', (payload, ack) => {
    console.log('[pserver] SESSION CONNECT RECEIVED', JSON.stringify(payload));
    let session;
    if (payload && typeof payload.session_id === 'string') {
      session = sessions.get(payload.session_id);
      if (!session) { ack?.({ ok: false, error: 'unknown session_id' }); return; }
    } else {
      if (!payload || typeof payload.udid !== 'string' || !payload.udid.trim()) {
        ack?.({ ok: false, error: 'VM UDID required' });
        return;
      }
      session = { id: randomUUID(), vm_udid: payload.udid, vmInfo: payload };
      sessions.set(session.id, session);
    }
    activeSessionId = session.id;
    console.log('[pserver] SESSION READY', { session_id: session.id, vm_udid: session.vm_udid });
    ack?.({ ok: true, session: { id: session.id, vm_udid: session.vm_udid } });
  });
  socket.emit('pserver:welcome', { from: 'pserver', to: 'aab', timestamp: Date.now() });

  socket.on('peer:ping', (value, ack) => {
    console.log('[pserver] RECEIVE peer:ping', JSON.stringify(value));
    ack?.({ ok: true, from: 'pserver', timestamp: Date.now() });
  });

  socket.on('peer:message', (message, ack) => {
    console.log('[pserver] RECEIVE peer:message', JSON.stringify(message));
    ack?.({ ok: true });
  });
  socket.on('disconnect', reason => {
    if (aabSocket?.id === socket.id) aabSocket = undefined;
    console.log('[pserver] AAB DISCONNECT', reason);
  });
});

async function sendToAab(message) {
  if (!aabSocket?.connected) throw new Error('AAB is offline');
  console.log('[pserver] SEND peer:message', JSON.stringify(message));
  const response = await aabSocket.timeout(8000).emitWithAck('peer:message', message);
  console.log('[pserver] RECEIVE peer:message ACK', JSON.stringify(response));
  return response;
}

app.get('/health', (_req, res) => res.json({
  server: 'pserver', port, status: 'running', aabConnected: Boolean(aabSocket?.connected), sessionId: activeSessionId ?? null
}));

app.post('/demo/dispatch-task', (req, res) => {
  if (!aabSocket?.connected || !activeSessionId) {
    res.status(503).json({ ok: false, error: 'AAB session not ready' });
    return;
  }
  const value = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const session = sessions.get(activeSessionId);
  const task = {
    ...value,
    session_id: value.session_id ?? activeSessionId,
    vm_udid: value.vm_udid ?? session.vm_udid
  };
  console.log('[pserver] DISPATCH activity:task:dispatch', JSON.stringify(task));
  aabSocket.emit('activity:task:dispatch', task);
  res.status(202).json({ ok: true, task });
});

app.post('/messages', async (req, res) => {
  try {
    const response = await sendToAab(req.body);
    res.status(response.ok ? 200 : 422).json(response);
  } catch (error) {
    res.status(aabSocket?.connected ? 502 : 503).json({
      ok: false, error: error instanceof Error ? error.message : 'Send failed'
    });
  }
});

app.post('/demo/send-to-aaui', async (req, res) => {
  const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const message = {
    version: '1.0', kind: 'event', from: 'pserver', to: 'aaui',
    channel: 'worker', event: 'message',
    payload: {
      type: 'demo.modified-param', version: '1.0',
      data: { originalParam: typeof input.originalParam === 'string' ? input.originalParam : 'hello from PServer' }
    }
  };
  try {
    const response = await sendToAab(message);
    res.status(response.ok ? 200 : 422).json(response);
  } catch (error) {
    res.status(aabSocket?.connected ? 502 : 503).json({
      ok: false, error: error instanceof Error ? error.message : 'Send failed'
    });
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, () => { server.off('error', reject); resolve(); });
});
console.log(`[pserver] HTTP + Socket.IO server listening on http://${host}:${port}`);
console.log('[pserver] Waiting for AAB to connect on Socket.IO path /ws, default namespace');

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise(resolve => io.close(resolve));
  if (server.listening) await new Promise(resolve => server.close(resolve));
  process.exit(0);
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
