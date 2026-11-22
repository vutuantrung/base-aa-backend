import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplication, ApplicationShutdownTimeoutError } from '../src/app/create-app.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return address.port;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}


test('one-shot lifecycle shares same-port startup and close results and rejects restart', async () => {
  const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
  const [firstPort, secondPort] = await Promise.all([app.listen(0), app.listen(0)]);
  assert.equal(firstPort, secondPort);
  assert.equal(await app.listen(0), firstPort);
  await assert.rejects(app.listen(firstPort + 1), /different port/);
  await Promise.all([app.close(), app.close()]);
  await assert.rejects(app.listen(0), /draining|stopping|stopped/);
});

test('close before listen is terminal and idempotent', async () => {
  const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
  await Promise.all([app.close(), app.close()]);
  await assert.rejects(app.listen(0), /draining|stopping|stopped/);
});

test('EADDRINUSE rolls back optional peer recovery locks and runner startup', async () => {
  const priorTasks = process.env.AAB_TASK_STORE_DIR;
  const priorSelections = process.env.AAB_SELECTION_STORE_DIR;
  const root = await mkdtemp(join(tmpdir(), 'aab-lifecycle-bind-failure-'));
  const taskDir = join(root, 'tasks');
  const selectionDir = join(root, 'selections');
  process.env.AAB_TASK_STORE_DIR = taskDir;
  process.env.AAB_SELECTION_STORE_DIR = selectionDir;
  const occupied = createServer();
  const port = await listen(occupied);
  const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true });
  try {
    await assert.rejects(app.listen(port), { code: 'EADDRINUSE' });
    await assert.rejects(readFile(join(taskDir, '.r7.5-outbox', '.writer.lock')));
    await assert.rejects(readFile(join(selectionDir, '.r7.5-outbox', '.writer.lock')));
  } finally {
    await app.close();
    await close(occupied);
    if (priorTasks === undefined) delete process.env.AAB_TASK_STORE_DIR;
    else process.env.AAB_TASK_STORE_DIR = priorTasks;
    if (priorSelections === undefined) delete process.env.AAB_SELECTION_STORE_DIR;
    else process.env.AAB_SELECTION_STORE_DIR = priorSelections;
    await rm(root, { recursive: true, force: true });
  }
});

test('close during optional-peer recovery fences the late listener start and releases acquired locks', async () => {
  const priorTasks = process.env.AAB_TASK_STORE_DIR;
  const priorSelections = process.env.AAB_SELECTION_STORE_DIR;
  const root = await mkdtemp(join(tmpdir(), 'aab-lifecycle-start-close-'));
  const taskDir = join(root, 'tasks');
  const selectionDir = join(root, 'selections');
  process.env.AAB_TASK_STORE_DIR = taskDir;
  process.env.AAB_SELECTION_STORE_DIR = selectionDir;
  const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true });
  try {
    const starting = app.listen(0);
    const closing = app.close();
    await assert.rejects(starting, /interrupted|draining|stopping/);
    await closing;
    assert.equal(app.httpServer.listening, false);
    await assert.rejects(readFile(join(taskDir, '.r7.5-outbox', '.writer.lock')));
    await assert.rejects(readFile(join(selectionDir, '.r7.5-outbox', '.writer.lock')));
  } finally {
    await app.close();
    if (priorTasks === undefined) delete process.env.AAB_TASK_STORE_DIR;
    else process.env.AAB_TASK_STORE_DIR = priorTasks;
    if (priorSelections === undefined) delete process.env.AAB_SELECTION_STORE_DIR;
    else process.env.AAB_SELECTION_STORE_DIR = priorSelections;
    await rm(root, { recursive: true, force: true });
  }
});

test('same-directory second application fails closed without releasing the first runner lock', async () => {
  const priorTasks = process.env.AAB_TASK_STORE_DIR;
  const priorSelections = process.env.AAB_SELECTION_STORE_DIR;
  const root = await mkdtemp(join(tmpdir(), 'aab-lifecycle-shared-runner-'));
  process.env.AAB_TASK_STORE_DIR = join(root, 'tasks');
  process.env.AAB_SELECTION_STORE_DIR = join(root, 'selections');
  const first = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true });
  const second = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true });
  try {
    await first.listen(0);
    await assert.rejects(second.listen(0), /runner already owns this state directory/);
    assert.ok((await readFile(join(root, 'tasks', '.r7.5-outbox', '.writer.lock'), 'utf8')).length > 0);
  } finally {
    await second.close();
    await first.close();
    if (priorTasks === undefined) delete process.env.AAB_TASK_STORE_DIR;
    else process.env.AAB_TASK_STORE_DIR = priorTasks;
    if (priorSelections === undefined) delete process.env.AAB_SELECTION_STORE_DIR;
    else process.env.AAB_SELECTION_STORE_DIR = priorSelections;
    await rm(root, { recursive: true, force: true });
  }
});

test('draining keeps health readable, rejects applicable HTTP work, and waits for admitted M09 branch', async () => {
  const requestReceived = deferred();
  const releaseWebhook = deferred();
  const webhook = createServer(async (_req, res) => {
    requestReceived.resolve();
    await releaseWebhook.promise;
    res.writeHead(204).end();
  });
  const webhookPort = await listen(webhook);
  const app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableSqlite: true,
    routes: [{ id: 'held-webhook', source: 'worker', event: 'hold', destinations: [{ transport: 'http', endpointId: 'local' }] }],
    webhooks: { local: { url: `http://127.0.0.1:${webhookPort}/hook` } }
  });
  const appPort = await app.listen(0);
  try {
    const pendingMessage = fetch(`http://127.0.0.1:${appPort}/api/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'worker', event: 'hold', payload: { x: 1 } })
    });
    await requestReceived.promise;
    const shutdown = app.close();
    const health = await fetch(`http://127.0.0.1:${appPort}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const blocked = await fetch(`http://127.0.0.1:${appPort}/api/process-usage`);
    assert.equal(blocked.status, 503);
    assert.deepEqual(await blocked.json(), { error: 'APPLICATION_DRAINING' });
    const invalidFirst = await fetch(`http://127.0.0.1:${appPort}/api/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad'
    });
    assert.notEqual(invalidFirst.status, 503);
    releaseWebhook.resolve();
    assert.equal((await pendingMessage).status, 202);
    await shutdown;
  } finally {
    releaseWebhook.resolve();
    await app.close().catch(() => undefined);
    await close(webhook);
  }
});

test('one total close deadline rejects without claiming a hung admitted operation is canceled', async () => {
  const requestReceived = deferred();
  const releaseWebhook = deferred();
  const webhook = createServer(async (_req, res) => {
    requestReceived.resolve();
    await releaseWebhook.promise;
    res.writeHead(204).end();
  });
  const webhookPort = await listen(webhook);
  const app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, shutdownTimeoutMs: 25,
    routes: [{ id: 'held-webhook', source: 'worker', event: 'hold', destinations: [{ transport: 'http', endpointId: 'local' }] }],
    webhooks: { local: { url: `http://127.0.0.1:${webhookPort}/hook` } }
  });
  const appPort = await app.listen(0);
  try {
    const pending = fetch(`http://127.0.0.1:${appPort}/api/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channel: 'worker', event: 'hold', payload: null })
    });
    await requestReceived.promise;
    const firstClose = app.close();
    const secondClose = app.close();
    await assert.rejects(firstClose, ApplicationShutdownTimeoutError);
    await assert.rejects(secondClose, ApplicationShutdownTimeoutError);
    assert.equal(app.httpServer.listening, true);
    const serverClosed = once(app.httpServer, 'close');
    releaseWebhook.resolve();
    assert.equal((await pending).status, 202);
    await serverClosed;
  } finally {
    releaseWebhook.resolve();
    await close(webhook);
  }
});

