import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true });
let base: string;
before(async () => { base = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

function connect(peerId: string, instanceId?: string): { socket: Socket; connected: Promise<void> } {
  const socket = io(`${base}/peers`, {
    transports: ['websocket'], reconnection: false, auth: { peerId, instanceId }
  });
  const connected = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Peer connect timeout')), 3000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', error => { clearTimeout(timer); reject(error); });
  });
  return { socket, connected };
}

function event<T>(socket: Socket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for ' + name)), 3000);
    socket.once(name, data => { clearTimeout(timer); resolve(data as T); });
  });
}
type Presence = { peerId: string; instanceId: string; status: 'online' | 'offline'; socketId: string; reason?: string };
type Snapshot = { peerId: string; instances: Presence[] };

test('AAUI receives snapshot for existing EServers and subsequent connection events', async () => {
  const e1 = connect('eserver', 'presence-1');
  const e2 = connect('eserver', 'presence-2');
  await Promise.all([e1.connected, e2.connected]);

  const aaui = connect('aaui');
  try {
    const snapPromise = event<Snapshot>(aaui.socket, 'peer:status:snapshot');
    await aaui.connected;
    const snapshot = await snapPromise;
    assert.equal(snapshot.peerId, 'eserver');
    assert.deepEqual(snapshot.instances.map(i => i.instanceId).sort(), ['presence-1', 'presence-2']);
    assert.ok(snapshot.instances.every(i => i.status === 'online'));

    const offlinePromise = event<Presence>(aaui.socket, 'peer:status');
    e1.socket.disconnect();
    const offline = await offlinePromise;
    assert.equal(offline.instanceId, 'presence-1');
    assert.equal(offline.status, 'offline');
    assert.ok(offline.reason);

    const reconnect = connect('eserver', 'presence-1');
    const onlinePromise = event<Presence>(aaui.socket, 'peer:status');
    await reconnect.connected;
    const online = await onlinePromise;
    assert.equal(online.status, 'online');
    assert.equal(online.instanceId, 'presence-1');
    assert.notEqual(online.socketId, offline.socketId);
    reconnect.socket.disconnect();

    const aaui2 = connect('aaui');
    // Only one AAUI may be connected at a time.
    aaui.socket.disconnect();
    aaui2.socket.disconnect();
  } finally {
    aaui.socket.disconnect();
    e1.socket.disconnect();
    e2.socket.disconnect();
  }
});

test('AAUI reconnect receives fresh snapshot without waiting for EServer messages', async () => {
  const e = connect('eserver', 'late-eserver');
  await e.connected;
  const first = connect('aaui');
  try {
    const snapshot = event<Snapshot>(first.socket, 'peer:status:snapshot');
    await first.connected;
    assert.ok((await snapshot).instances.some(i => i.instanceId === 'late-eserver'));
  } finally { first.socket.disconnect(); }

  // Wait for disconnect to be processed before new AAUI connection.
  await new Promise(resolve => setTimeout(resolve, 25));
  const second = connect('aaui');
  try {
    const snapshot = event<Snapshot>(second.socket, 'peer:status:snapshot');
    await second.connected;
    assert.ok((await snapshot).instances.some(i => i.instanceId === 'late-eserver'));
  } finally { second.socket.disconnect(); e.socket.disconnect(); }
});
