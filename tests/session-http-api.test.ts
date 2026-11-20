import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { afterEach, test } from 'node:test';
import { createHttpApp } from '../src/infrastructure/http/http-server.js';
import type { Session, SessionRepository } from '../src/modules/session/contracts.js';

const servers: Server[] = [];

async function startServer(sessions?: SessionRepository, options: { apiKey?: string; sqliteEnabled?: boolean } = {}) {
  const server = createServer(createHttpApp({
    sessions,
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

test('HTTP session routes preserve list/get/create validation and response behavior', async () => {
  const sessions: Session[] = [{ id: 1, name: 'existing' }];
  const createInputs: string[] = [];
  const repository: SessionRepository = {
    list: () => sessions,
    get: id => sessions.find(session => session.id === id),
    create: name => {
      createInputs.push(name);
      const session = { id: 2, name };
      sessions.push(session);
      return session;
    }
  };
  const baseUrl = await startServer(repository);

  const listed = await fetch(`${baseUrl}/api/sessions`);
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [{ id: 1, name: 'existing' }]);

  const found = await fetch(`${baseUrl}/api/sessions/1`);
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), { id: 1, name: 'existing' });
  const coercible = await fetch(`${baseUrl}/api/sessions/1e0`);
  assert.equal(coercible.status, 200);
  assert.deepEqual(await coercible.json(), { id: 1, name: 'existing' });

  for (const id of ['0', '-1', '1.5', '9007199254740992']) {
    const response = await fetch(`${baseUrl}/api/sessions/${id}`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid id' });
  }
  const missing = await fetch(`${baseUrl}/api/sessions/99`);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not found' });

  const created = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '  normalized  ', ignored: true })
  });
  assert.equal(created.status, 201);
  assert.deepEqual(await created.json(), { id: 2, name: 'normalized' });
  assert.deepEqual(createInputs, ['normalized']);

  for (const name of ['   ', 'x'.repeat(201)]) {
    const invalid = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name })
    });
    assert.equal(invalid.status, 400);
    const body = await invalid.json();
    assert.deepEqual(Object.keys(body), ['error']);
    assert.deepEqual(Object.keys(body.error).sort(), ['fieldErrors', 'formErrors']);
    assert.ok(Array.isArray(body.error.fieldErrors.name));
    assert.ok(body.error.fieldErrors.name.length > 0);
  }
});

test('direct createHttpApp calls preserve undefined optional-session repository behavior', async () => {
  const baseUrl = await startServer(undefined, { sqliteEnabled: true });
  const listed = await fetch(`${baseUrl}/api/sessions`);
  assert.equal(listed.status, 200);
  assert.equal(await listed.text(), '');

  const created = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'valid' })
  });
  assert.equal(created.status, 201);
  assert.equal(await created.text(), '');

  const absent = await fetch(`${baseUrl}/api/sessions/1`);
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { error: 'not found' });
});
