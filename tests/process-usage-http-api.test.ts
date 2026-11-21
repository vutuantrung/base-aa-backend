import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { afterEach, test } from 'node:test';
import { createHttpApp } from '../src/infrastructure/http/http-server.js';
import type { NewProcessUsage, ProcessUsage, ProcessUsageRepository } from '../src/modules/process-usage/contracts.js';

const servers: Server[] = [];

async function startServer(usage?: ProcessUsageRepository, options: { apiKey?: string; sqliteEnabled?: boolean } = {}) {
  const server = createServer(createHttpApp({
    usage,
    sender: { async execute(message) { return { id: 'message', ...message, timestamp: '2026-01-01T00:00:00.000Z' }; } },
    ...options
  }));
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP test port');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  const openServers = servers.splice(0);
  await Promise.all(openServers.map(server => server.listening
    ? new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    : Promise.resolve()));
});

function fakeRepository() {
  const rows: ProcessUsage[] = [
    { id: 1, pid: 1, cpu: 0.25, memory: 10 },
    { id: 2, pid: 2, cpu: 0, memory: 0 }
  ];
  const listed: Array<number | undefined> = [];
  const created: NewProcessUsage[] = [];
  const repository: ProcessUsageRepository = {
    list(pid) {
      listed.push(pid);
      return pid === undefined ? rows : rows.filter(row => row.pid === pid);
    },
    create(value) {
      created.push(value);
      const row = { id: rows.length + 1, ...value };
      rows.push(row);
      return row;
    }
  };
  return { repository, listed, created };
}

test('GET process-usage preserves optional filtering, Number coercion and invalid PID rejection', async () => {
  const fake = fakeRepository();
  const baseUrl = await startServer(fake.repository);

  const all = await fetch(`${baseUrl}/api/process-usage`);
  assert.equal(all.status, 200);
  assert.deepEqual(await all.json(), [
    { id: 1, pid: 1, cpu: 0.25, memory: 10 },
    { id: 2, pid: 2, cpu: 0, memory: 0 }
  ]);
  const coerced = await fetch(`${baseUrl}/api/process-usage?pid=1e0`);
  assert.equal(coerced.status, 200);
  assert.deepEqual(await coerced.json(), [{ id: 1, pid: 1, cpu: 0.25, memory: 10 }]);
  const noMatches = await fetch(`${baseUrl}/api/process-usage?pid=99`);
  assert.equal(noMatches.status, 200);
  assert.deepEqual(await noMatches.json(), []);
  assert.deepEqual(fake.listed, [undefined, 1, 99]);

  for (const pid of ['0', '-1', '1.5', '9007199254740992', 'not-a-number', '']) {
    const invalid = await fetch(`${baseUrl}/api/process-usage?pid=${encodeURIComponent(pid)}`);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: 'invalid pid' });
  }
  assert.deepEqual(fake.listed, [undefined, 1, 99]);
});

test('POST process-usage validates HTTP fields, strips unknown keys and preserves valid fractional/zero values', async () => {
  const fake = fakeRepository();
  const baseUrl = await startServer(fake.repository);

  for (const value of [
    { pid: 3, cpu: 0.125, memory: 0, ignored: 'stripped', id: 900 },
    { pid: 3, cpu: 0, memory: 2 }
  ]) {
    const response = await fetch(`${baseUrl}/api/process-usage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value)
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.deepEqual(result, { id: fake.created.length + 2, pid: value.pid, cpu: value.cpu, memory: value.memory });
  }
  assert.deepEqual(fake.created, [
    { pid: 3, cpu: 0.125, memory: 0 },
    { pid: 3, cpu: 0, memory: 2 }
  ]);

  for (const value of [
    { pid: 0, cpu: 1, memory: 1 },
    { pid: 1.5, cpu: 1, memory: 1 },
    { pid: 1, cpu: -0.1, memory: 1 },
    { pid: 1, cpu: '1', memory: 1 },
    { pid: 1, cpu: 1, memory: -1 },
    { pid: 1, cpu: 1, memory: 1.5 }
  ]) {
    const invalid = await fetch(`${baseUrl}/api/process-usage`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value)
    });
    assert.equal(invalid.status, 400);
    const body = await invalid.json();
    assert.deepEqual(Object.keys(body), ['error']);
    assert.deepEqual(Object.keys(body.error).sort(), ['fieldErrors', 'formErrors']);
    assert.ok(Object.values(body.error.fieldErrors).some(errors => Array.isArray(errors) && errors.length > 0));
  }
  assert.equal(fake.created.length, 2);
});

test('direct createHttpApp calls with usage absent preserve successful empty responses and HTTP validation', async () => {
  const baseUrl = await startServer(undefined, { sqliteEnabled: true });
  const listed = await fetch(`${baseUrl}/api/process-usage`);
  assert.equal(listed.status, 200);
  assert.equal(await listed.text(), '');

  const created = await fetch(`${baseUrl}/api/process-usage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pid: 2, cpu: 0, memory: 0 })
  });
  assert.equal(created.status, 201);
  assert.equal(await created.text(), '');

  const invalid = await fetch(`${baseUrl}/api/process-usage?pid=0`);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: 'invalid pid' });
});

test('repository exceptions retain global HTTP 500 response mapping', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const repository: ProcessUsageRepository = {
      list() { throw new Error('database unavailable'); },
      create() { throw new Error('database unavailable'); }
    };
    const baseUrl = await startServer(repository);
    const response = await fetch(`${baseUrl}/api/process-usage`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'internal server error' });
  } finally {
    console.error = originalError;
  }
});
