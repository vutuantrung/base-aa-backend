import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import taskFlow from './shared/task-flow.cjs';
import selectionFlow from './shared/resource-selection.cjs';
const { validateSelection } = selectionFlow;
const { TASK_REQUEST_TYPE, TASK_RESULT_TYPE, TASK_STATUS, MAX_TASKS, isTask, createTask } = taskFlow;

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
const tasks = new Map();
function keepTask(task) {
  tasks.set(task.id, task);
  if (tasks.size > MAX_TASKS) tasks.delete(tasks.keys().next().value);
}

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
    if (message?.payload?.type === 'demo.resource-selection') {
      if (message.from !== 'aaui' || message.to !== 'pserver') {
        ack?.({ ok: false, error: 'Unexpected sender or recipient for resource selection' });
        return;
      }
      const selection = validateSelection(message.payload.data);
      if (!selection.ok) {
        ack?.({ ok: false, error: selection.error });
        return;
      }
      console.log('[pserver] RESOURCE SELECTION RECEIVED', JSON.stringify(selection.data));
      ack?.({ ok: true });
      return;
    }
    if (message?.from === 'eserver' && message?.to === 'pserver' &&
        message?.payload?.type === TASK_RESULT_TYPE) {
      const task = message.payload.data;
      const previous = tasks.get(task?.id);
      if (!isTask(task, TASK_STATUS.finished) || !previous ||
          previous.status !== TASK_STATUS.inProgress ||
          task.config !== previous.config || task.createdTime !== previous.createdTime) {
        console.warn('[pserver] TASK RESULT REJECTED', JSON.stringify(task));
        ack?.({ ok: false, error: 'Unknown task, invalid transition or task data mismatch' });
        return;
      }
      keepTask(task);
      console.log('[pserver] TASK FINISHED RECEIVED FROM ESERVER', JSON.stringify(task));
    }
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

// HTTP curl trigger for PServer -> AAB -> AAUI -> AAB -> PServer.
app.post('/demo/tasks', async (req, res) => {
  if (req.body?.config !== undefined && typeof req.body.config !== 'string') {
    res.status(400).json({ ok: false, error: 'config must be a string' });
    return;
  }
  // Accept the exact task body, or retain the config-only demo shorthand.
  const taskFields = ['id', 'status', 'createdTime', 'updatedTime'];
  const explicitTask = taskFields.some(field => req.body?.[field] !== undefined);
  const task = explicitTask ? {
    id: req.body?.id,
    status: req.body?.status,
    config: req.body?.config,
    createdTime: req.body?.createdTime,
    updatedTime: req.body?.updatedTime
  } : createTask(req.body?.config ?? 'mock task configuration');
  if (!isTask(task, TASK_STATUS.inProgress)) {
    res.status(400).json({ ok: false, error: 'Task requires task-<id>, inProgress status, string config, and valid ordered timestamps' });
    return;
  }
  const toInstanceId = req.query.toInstanceId ?? req.body?.toInstanceId;
  if (toInstanceId !== undefined && (typeof toInstanceId !== 'string' || !toInstanceId.trim())) {
    res.status(400).json({ ok: false, error: 'toInstanceId must be a non-empty string' });
    return;
  }
  const message = {
    version: '1.0', kind: 'request', from: 'pserver', to: 'eserver',
    ...(toInstanceId ? { toInstanceId } : {}),
    payload: { type: TASK_REQUEST_TYPE, version: '1.0', data: task }
  };
  keepTask(task);
  try {
    const response = await sendToAab(message);
    if (!response.ok) {
      tasks.delete(task.id);
      res.status(422).json({ ok: false, error: response.error, code: response.code });
      return;
    }
    console.log('[pserver] TASK RECEIVED BY AAB', JSON.stringify(task));
    res.status(202).json({ ok: true, status: response.status ?? 'received', task, messageId: response.data?.id });
  } catch (error) {
    tasks.delete(task.id);
    res.status(aabSocket?.connected ? 502 : 503).json({
      ok: false, error: error instanceof Error ? error.message : 'Delivery failed'
    });
  }
});

app.get('/demo/tasks', (_req, res) => res.json({ tasks: [...tasks.values()].reverse() }));
app.get('/demo/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) { res.status(404).json({ ok: false, error: 'Task not found' }); return; }
  res.json({ ok: true, task });
});

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
