const { app, BrowserWindow, ipcMain } = require('electron');
const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { io } = require('socket.io-client');
const { TASK_REQUEST_TYPE, TASK_RESULT_TYPE, isTask, TASK_STATUS, createTaskProcessor, PROCESSING_TIME_MS } = require('../shared/task-flow.cjs');

const peerId = 'aaui';
const port = 3004;
const host = '127.0.0.1';
const aabUrl = process.env.AAB_URL || 'http://127.0.0.1:3000';
let httpServer;
let window;
let socket;
const logs = [];
let taskProcessor;

function log(event, value) {
  const record = { timestamp: new Date().toISOString(), event, value };
  logs.push(record);
  if (logs.length > 200) logs.shift();
  console.log('[AAUI]', event, value ?? '');
  if (window && !window.isDestroyed()) window.webContents.send('aaui:log', record);
}

async function checkHttp() {
  try {
    const response = await fetch(new URL('/health', aabUrl), {
      signal: AbortSignal.timeout(4000),
      headers: process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : {}
    });
    const data = await response.json();
    log('HTTP AAB /health', { status: response.status, data });
    return { status: response.status, data };
  } catch (error) {
    log('HTTP ERROR', error.message);
    return { error: error.message };
  }
}

async function launch() {
  const httpApp = express();
  httpApp.use(express.json({ limit: '1mb' }));
  httpApp.disable('x-powered-by');
  httpApp.get('/health', (_req, res) => res.json({ server: peerId, port, aabConnected: Boolean(socket?.connected) }));
  httpApp.post('/messages', async (req, res) => {
    if (!socket?.connected) { res.status(503).json({ ok: false, error: 'AAB is offline' }); return; }
    try {
      const response = await socket.timeout(8000).emitWithAck('peer:message', req.body);
      log('SEND peer:message ACK', response);
      res.status(response.ok ? 200 : 422).json(response);
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Send failed' });
    }
  });
  httpApp.get('/', (_req, res) => res.sendFile(join(__dirname, 'index.html')));
  httpApp.get('/renderer.js', (_req, res) => res.sendFile(join(__dirname, 'renderer.js')));
  httpApp.get('/styles.css', (_req, res) => res.sendFile(join(__dirname, 'styles.css')));
  httpApp.get('/dashboard-state.js', (_req, res) => res.sendFile(join(__dirname, 'dashboard-state.js')));
  httpServer = createServer(httpApp);
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => { httpServer.off('error', reject); resolve(); });
  });
  log('HTTP listening', `http://${host}:${port}`);

  ipcMain.handle('aaui:logs', () => logs);
  ipcMain.handle('aaui:check-http', checkHttp);
  window = new BrowserWindow({
    width: 1320, height: 860, minWidth: 720, minHeight: 540,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  await window.loadURL(`http://${host}:${port}/`);

  socket = io(`${aabUrl.replace(/\/$/, '')}/peers`, {
    transports: ['websocket'],
    auth: { peerId, ...(process.env.API_KEY ? { token: process.env.API_KEY } : {}) }
  });
  socket.on('connect', () => {
    log('Socket CONNECT AAB', socket.id);
    socket.timeout(5000).emit('peer:ping', { from: peerId }, (error, response) => {
      if (error) log('PING FAILED', error.message);
      else log('RECEIVE peer:ping ACK', response);
    });
  });
  taskProcessor = createTaskProcessor({
    delayMs: PROCESSING_TIME_MS,
    onStart: task => log('TASK IN PROGRESS', task),
    onFinish: async task => {
      log('TASK FINISHED', task);
      if (!socket?.connected) {
        log('TASK RESULT ERROR', { id: task.id, error: 'AAB disconnected; result was not sent' });
        return;
      }
      try {
        const response = await socket.timeout(8000).emitWithAck('peer:message', {
          version: '1.0', kind: 'response', from: 'aaui', to: 'pserver',
          payload: { type: TASK_RESULT_TYPE, version: '1.0', data: task }
        });
        if (!response?.ok) {
          log('TASK RESULT ERROR', { id: task.id, error: response?.error || 'PServer rejected result' });
        } else {
          log('TASK RESULT DELIVERED', { id: task.id, messageId: response.data?.id });
        }
      } catch (error) {
        log('TASK RESULT ERROR', { id: task.id, error: error.message });
      }
    },
    onError: error => log('TASK PROCESS ERROR', { error: error?.message || String(error) })
  });
  socket.on('peer:message', (message, ack) => {
    log('RECEIVE peer:message', message);
    if (message?.from === 'pserver' && message?.to === 'aaui' &&
        message?.payload?.type === TASK_REQUEST_TYPE) {
      const task = message.payload.data;
      if (!isTask(task, TASK_STATUS.inProgress)) {
        ack?.({ ok: false, error: 'Invalid task data' });
        return;
      }
      if (!taskProcessor.receive(task)) {
        ack?.({ ok: false, error: 'Duplicate task or processor stopped' });
        return;
      }
    }
    ack?.({ ok: true });
  });
  socket.on('peer:status', value => log('RECEIVE peer:status', value));
  socket.on('peer:status:snapshot', value => log('RECEIVE peer:status:snapshot', value));
  socket.on('aab:welcome', value => log('RECEIVE aab:welcome', value));
  socket.on('connect_error', error => log('Socket CONNECT ERROR', error.message));
  socket.on('disconnect', reason => log('Socket DISCONNECT', reason));
  void checkHttp();
}

app.whenReady().then(() => launch().catch(error => { console.error('[AAUI] STARTUP ERROR', error); app.quit(); }));
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { taskProcessor?.stop(); socket?.disconnect(); httpServer?.close(); });
