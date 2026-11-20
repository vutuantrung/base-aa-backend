import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { createHttpApp } from '../src/infrastructure/http/http-server.js';
import type { NewMessage } from '../src/shared/contracts/message.js';

const sent: NewMessage[] = [];
const http = createServer(createHttpApp({
  sqliteEnabled: false,
  apiKey: 'test-key',
  sender: {
    async execute(message) {
      sent.push(message);
      return { id: 'message-1', ...message, timestamp: '2026-01-01T00:00:00.000Z' };
    }
  }
}));
let baseUrl: string;

before(async () => {
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP test port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (http.listening) await new Promise<void>((resolve, reject) => http.close(error => error ? reject(error) : resolve()));
});

test('health is public and API authentication precedes SQLite availability', async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });

  const unauthorized = await fetch(`${baseUrl}/api/sessions`);
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { error: 'unauthorized' });

  const disabled = await fetch(`${baseUrl}/api/sessions`, { headers: { 'x-api-key': 'test-key' } });
  assert.equal(disabled.status, 503);
  assert.deepEqual(await disabled.json(), { error: 'SQLITE_DISABLED' });
});

test('message validation and response remain available while SQLite is disabled', async () => {
  const invalid = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' }, body: JSON.stringify({ channel: 'unknown' })
  });
  assert.equal(invalid.status, 400);

  const response = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'test-key' },
    body: JSON.stringify({ channel: 'worker', event: 'test', payload: { value: 1 } })
  });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    id: 'message-1', channel: 'worker', event: 'test', payload: { value: 1 }, timestamp: '2026-01-01T00:00:00.000Z'
  });
  assert.deepEqual(sent, [{ channel: 'worker', event: 'test', payload: { value: 1 } }]);
});
