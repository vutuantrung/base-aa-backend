import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createApplication } from '../src/app/create-app.js';
import { HttpMessageClient, SocketMessageClient } from '../src/shared/transport/connectable-client.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
let url: string;
before(async () => { url = `http://127.0.0.1:${await app.listen(0)}`; });
after(async () => { await app.close(); });

test('HTTP session and process usage persistence', async () => {
  const created = await fetch(`${url}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'demo' }) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).name, 'demo');
  const usage = await fetch(`${url}/api/process-usage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid: 123, cpu: 11.5, memory: 4096 }) });
  assert.equal(usage.status, 201);
  const listed = await fetch(`${url}/api/process-usage?pid=123`).then(r => r.json());
  assert.equal(listed.length, 1);
});

test('HTTP-to-Socket forward and Socket-to-Socket fanout', async () => {
  const socket = io(`${url}/session`, { transports: ['websocket'] });
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  try {
    const inbound = new Promise<any>(resolve => socket.once('message', resolve));
    const httpClient = new HttpMessageClient(url);
    const sent = await httpClient.send({ channel: 'session', event: 'test', payload: { x: 1 } });
    assert.equal((await inbound).id, sent.id);
    const socketClient = new SocketMessageClient(url);
    const next = new Promise<any>(resolve => socket.once('message', resolve));
    const second = await socketClient.send({ channel: 'session', event: 'second', payload: 42 });
    assert.equal((await next).id, second.id);
    await socketClient.close();
  } finally { socket.disconnect(); }
});
