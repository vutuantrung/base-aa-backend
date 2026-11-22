import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { JsonTaskFileStore } from '../src/modules/task-workflow/task-file-store.js';
import { JsonResourceSelectionStore } from '../src/modules/resource-selection/resource-selection-store.js';
import { createMockPServer } from './support/mock-pserver.js';

let root: string;
let app: ReturnType<typeof createApplication>;
let pserver: Awaited<ReturnType<typeof createMockPServer>>;
let base: string;

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, message: string, timeoutMs = 4000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

function connectPeer(peerId: string, instanceId?: string): { socket: Socket; connected: Promise<void> } {
  const socket = io(`${base}/peers`, { transports: ['websocket'], reconnection: false,
    auth: { peerId, token: 'test', ...(instanceId ? { instanceId } : {}) } });
  return { socket, connected: new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  }) };
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'aab-r76-peer-drain-'));
  process.env.AAB_TASK_STORE_DIR = join(root, 'tasks');
  process.env.AAB_SELECTION_STORE_DIR = join(root, 'selections');
  pserver = await createMockPServer();
  app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true, apiKey: 'test',
    pserver: { url: pserver.url, vmInfo: { udid: 'drain-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] } } });
  base = `http://127.0.0.1:${await app.listen(0)}`;
  await withTimeout(pserver.arrival.then(() => undefined), 'AAB did not connect to local PServer');
  await withTimeout((async () => {
    while (!app.pserverConnector?.connected) await new Promise<void>(resolve => setImmediate(resolve));
  })(), 'PServer peer session did not become ready');
});

after(async () => {
  if (app) await app.close().catch(() => undefined);
  if (pserver) await pserver.close();
  delete process.env.AAB_TASK_STORE_DIR;
  delete process.env.AAB_SELECTION_STORE_DIR;
  if (root) await rm(root, { recursive: true, force: true });
});

test('live peer ingress and outbound ACK settle before drain cleanup; new business ingress is rejected', async () => {
  const eserver = connectPeer('eserver', 'drain-e1');
  const aaui = connectPeer('aaui');
  await Promise.all([
    withTimeout(eserver.connected, 'EServer did not authenticate/connect'),
    withTimeout(aaui.connected, 'AAUI did not authenticate/connect')
  ]);

  const pserverSocket = pserver.connected;
  assert.ok(pserverSocket, 'local PServer session socket missing');
  const outboundEntered = deferred();
  const releaseOutboundAck = deferred();
  const ingressEntered = deferred();
  const releaseIngressAck = deferred();
  let outboundAckSent = false;
  let ingressAckSent = false;
  let outboundEmissions = 0;
  let ingressEmissions = 0;
  const outboundHandler = (message: unknown, ack?: (value: unknown) => void) => {
    outboundEmissions += 1;
    outboundEntered.resolve();
    void releaseOutboundAck.promise.then(() => { outboundAckSent = true; ack?.({ ok: true }); });
  };
  const ingressHandler = (message: unknown, ack?: (value: unknown) => void) => {
    ingressEmissions += 1;
    ingressEntered.resolve();
    void releaseIngressAck.promise.then(() => { ingressAckSent = true; ack?.({ ok: true }); });
  };
  pserverSocket.on('peer:message', outboundHandler);
  eserver.socket.on('peer:message', ingressHandler);

  const selectionAck = aaui.socket.timeout(5000).emitWithAck('peer:message', {
    id: randomUUID(), kind: 'request', from: 'aaui', to: 'pserver',
    payload: { type: 'demo.resource-selection', data: {
      browserProfileId: 'browser-1', proxyId: 'proxy-1', accountId: 'account-1'
    } }
  });
  const task = { id: `task-${randomUUID()}`, status: 'inProgress', config: 'drain-test', createdTime: Date.now(), updatedTime: Date.now() };
  const ingressAck = pserverSocket.timeout(5000).emitWithAck('peer:message', {
    kind: 'request', from: 'pserver', to: 'eserver', toInstanceId: 'drain-e1',
    payload: { type: 'demo.task.request', data: task }
  });

  try {
    await withTimeout(outboundEntered.promise, 'outbound PServer ACK barrier was not entered');
    await withTimeout(ingressEntered.promise, 'inbound EServer ACK barrier was not entered');
    const shutdown = app.close();
    const rejected = await withTimeout(aaui.socket.timeout(2000).emitWithAck('peer:message', {
      kind: 'request', from: 'aaui', to: 'pserver',
      payload: { type: 'demo.resource-selection', data: {
        browserProfileId: 'browser-new', proxyId: 'proxy-new', accountId: 'account-new'
      } }
    }), 'post-cutoff peer ingress did not ACK');
    assert.deepEqual(rejected, { ok: false, code: 'DELIVERY_FAILED', error: 'APPLICATION_DRAINING' });

    releaseIngressAck.resolve();
    const ingressResult = await withTimeout(ingressAck, 'admitted PServer ingress ACK did not settle');
    assert.equal(ingressResult.ok, true);
    assert.equal(ingressAckSent, true);
    releaseOutboundAck.resolve();
    const selectionResult = await withTimeout(selectionAck, 'outbound peer ACK did not settle');
    assert.equal(selectionResult.ok, true);
    assert.equal(outboundAckSent, true);
    await withTimeout(shutdown, 'application did not clean up after peer ACK barriers');
    const taskStore = new JsonTaskFileStore(join(root, 'tasks'));
    const selectionStore = new JsonResourceSelectionStore(join(root, 'selections'));
    await Promise.all([taskStore.reliability.initialize(), selectionStore.reliability.initialize()]);
    const [taskRecord, selectionRecords] = await Promise.all([
      taskStore.reliability.get(`F08:${task.id}`), selectionStore.reliability.list()
    ]);
    assert.equal(taskRecord?.state, 'delivered');
    assert.equal(selectionRecords.length, 1);
    assert.equal(selectionRecords[0]?.state, 'delivered');
    assert.equal(ingressEmissions, 1);
    assert.equal(outboundEmissions, 1);
    await Promise.all([taskStore.reliability.close(), selectionStore.reliability.close()]);
    await assert.rejects(readFile(join(root, 'tasks', '.r7.5-outbox', '.writer.lock')));
    await assert.rejects(readFile(join(root, 'selections', '.r7.5-outbox', '.writer.lock')));
  } finally {
    releaseIngressAck.resolve();
    releaseOutboundAck.resolve();
    pserverSocket.off('peer:message', outboundHandler);
    eserver.socket.off('peer:message', ingressHandler);
    eserver.socket.disconnect();
    aaui.socket.disconnect();
  }
});
