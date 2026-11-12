import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';

let collector: HttpServer;
let collectorUrl: string;
let url: string;
let app: ReturnType<typeof createApplication>;
const received: unknown[] = [];

before(async () => {
  collector = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/events') { res.writeHead(404).end(); return; }
    const buffers: Buffer[] = [];
    req.on('data', chunk => buffers.push(Buffer.from(chunk)));
    req.on('end', () => { received.push(JSON.parse(Buffer.concat(buffers).toString())); res.writeHead(204).end(); });
  });
  await new Promise<void>(resolve => collector.listen(0, '127.0.0.1', resolve));
  const address = collector.address();
  if (!address || typeof address === 'string') throw new Error('Missing collector port');
  collectorUrl = `http://127.0.0.1:${address.port}`;
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*',
    webhooks: { collector: { url: `${collectorUrl}/events` } },
    routes: [
      { id: 'local-worker', source: 'worker', event: '*', destinations: [{ transport: 'socket', channel: 'worker' }] },
      { id: 'forward-usage', source: 'worker', event: 'usage', destinations: [
        { transport: 'socket', channel: 'session' }, { transport: 'http', endpointId: 'collector' }
      ] }
    ]
  });
  url = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => {
  if (app) await app.close();
  if (collector) await new Promise<void>((resolve, reject) => collector.close(error => error ? reject(error) : resolve()));
});

test('HTTP -> worker + session socket namespaces + HTTP webhook, with same message ID', async () => {
  const worker = io(`${url}/worker`, { transports: ['websocket'] });
  const session = io(`${url}/session`, { transports: ['websocket'] });
  const connect = (socket: typeof worker) => new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  try {
    await Promise.all([connect(worker), connect(session)]);
    const fromWorker = new Promise<any>(resolve => worker.once('message', resolve));
    const fromSession = new Promise<any>(resolve => session.once('message', resolve));
    const response = await fetch(`${url}/api/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'worker', event: 'usage', payload: { pid: 88, cpu: 12 } })
    });
    assert.equal(response.status, 202);
    const envelope = await response.json();
    assert.equal((await fromWorker).id, envelope.id);
    assert.equal((await fromSession).id, envelope.id);
    assert.equal((received[0] as { id: string }).id, envelope.id);
    assert.equal(received.length, 1);
  } finally { worker.disconnect(); session.disconnect(); }
});

test('Socket -> outbound HTTP webhook and worker namespace', async () => {
  const worker = io(`${url}/worker`, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => { worker.once('connect', resolve); worker.once('connect_error', reject); });
  try {
    const next = new Promise<any>(resolve => worker.once('message', resolve));
    const ack = await worker.timeout(3000).emitWithAck('message', { event: 'usage', payload: { pid: 99 } }) as { ok: boolean; data: { id: string } };
    assert.equal(ack.ok, true);
    assert.equal((await next).id, ack.data.id);
    assert.equal((received[1] as { id: string }).id, ack.data.id);
  } finally { worker.disconnect(); }
});
