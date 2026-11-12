const { app, BrowserWindow, ipcMain } = require('electron');
const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { io } = require('socket.io-client');

const peerId = 'aaui';
const port = 3004;
const host = '127.0.0.1';
const aabUrl = process.env.AAB_URL || 'http://127.0.0.1:3000';
let httpServer;
let window;
let socket;
const logs = [];

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
  socket.on('peer:message', (message, ack) => {
    log('RECEIVE peer:message', message);
    ack?.({ ok: true });
  });
  socket.on('aab:welcome', value => log('RECEIVE aab:welcome', value));
  socket.on('connect_error', error => log('Socket CONNECT ERROR', error.message));
  socket.on('disconnect', reason => log('Socket DISCONNECT', reason));
  void checkHttp();
}

app.whenReady().then(() => launch().catch(error => { console.error('[AAUI] STARTUP ERROR', error); app.quit(); }));
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { socket?.disconnect(); httpServer?.close(); });
