import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { createApplication } from '../src/app/create-app.js';
import { openDatabase } from '../src/infrastructure/database/sqlite.js';
import { createHttpApp } from '../src/infrastructure/http/http-server.js';
import type {
  AaCatalogRepository, AaConnection, BrowserDetails, ExtensionActivity,
  ExtensionDetails, ExtensionTask
} from '../src/modules/aa-catalog/contracts.js';
import { SqliteAaCatalogRepository } from '../src/modules/aa-catalog/sqlite-catalog.js';

const servers: Server[] = [];

async function startHttp(catalog?: AaCatalogRepository, options: { apiKey?: string; sqliteEnabled?: boolean } = {}) {
  const server = createServer(createHttpApp({
    catalog,
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

function catalogFake(options: { emptyChildren?: boolean } = {}) {
  const aa: AaConnection = {
    id: 'aa-1', userId: 'user-1', status: 'disconnected',
    connectedTime: 10, lastHeartbeatTime: 100, disconnectedTime: 90
  };
  const browser: BrowserDetails = {
    id: 'browser-1', type: 'Chrome', version: '1', userAgent: 'agent', proxy: '', extensionId: 'ext-1'
  };
  const extension: ExtensionDetails = {
    id: 'ext-1', version: 'v1', supportingPlatforms: [
      { facebook: { supportingFeatures: ['Parser'], parserInfo: { version: 'p1', type: ['Post'] } } },
      { tiktok: { supportingFeatures: ['Automation'] } }
    ]
  };
  const activity: ExtensionActivity = {
    id: 'activity-1', name: 'post', createdTime: 1, updatedTime: 2,
    extensionConfigId: 'cfg-1', extraMeta: { nested: { value: true } }, inputs: { title: 'x' },
    platform: 'Facebook', priority: 2, scheduleTime: '1|2|3|4', scheduleType: 'period'
  };
  const task: ExtensionTask = {
    id: 'task-1', activity: { id: 'activity-1', name: 'post' },
    createdTime: 1, updatedTime: 2, endTime: 3, inputs: { nested: ['x'] }, nextTask: '',
    platform: 'facebook', priority: 1, state: 'finished', tabId: 5
  };
  const calls: Array<{ method: string; id?: string }> = [];
  const repository: AaCatalogRepository = {
    currentAa() { calls.push({ method: 'currentAa' }); return aa; },
    allBrowsers() { calls.push({ method: 'allBrowsers' }); return [{ browser }]; },
    browserById(id) { calls.push({ method: 'browserById', id }); return id === browser.id ? { browser } : undefined; },
    extensionById(id) { calls.push({ method: 'extensionById', id }); return id === extension.id ? extension : undefined; },
    activitiesByExtension(id) { calls.push({ method: 'activitiesByExtension', id }); return !options.emptyChildren && id === extension.id ? [activity] : []; },
    tasksByExtension(id) { calls.push({ method: 'tasksByExtension', id }); return !options.emptyChildren && id === extension.id ? [task] : []; }
  };
  return { repository, calls, aa, browser, extension, activity, task };
}

test('AaCatalogRepository is a neutral read-only port consumable by a fake without upsert methods', () => {
  const fake = catalogFake();
  assert.deepEqual(fake.repository.currentAa(), fake.aa);
  assert.deepEqual(fake.repository.allBrowsers(), [{ browser: fake.browser }]);
  assert.deepEqual(fake.repository.browserById(fake.browser.id), { browser: fake.browser });
  assert.deepEqual(fake.repository.extensionById(fake.extension.id), fake.extension);
  assert.deepEqual(fake.repository.activitiesByExtension(fake.extension.id), [fake.activity]);
  assert.deepEqual(fake.repository.tasksByExtension(fake.extension.id), [fake.task]);
  assert.deepEqual(fake.calls.map(call => call.method), [
    'currentAa', 'allBrowsers', 'browserById', 'extensionById', 'activitiesByExtension', 'tasksByExtension'
  ]);
});

test('SQLite catalog preserves query ordering, tie selection, wrappers, nested DTOs, exact extension filters and upserts', () => {
  const database = openDatabase(':memory:');
  try {
    const catalog = new SqliteAaCatalogRepository(database);
    const makeAa = (id: string, connectedTime: number, status: string): AaConnection => ({
      id, userId: `user-${id}`, status, connectedTime, lastHeartbeatTime: 999, disconnectedTime: 0
    });
    assert.equal(catalog.currentAa(), undefined);
    catalog.upsertAa(makeAa('z', 20, 'connected'));
    catalog.upsertAa(makeAa('a', 20, 'disconnected'));
    catalog.upsertAa(makeAa('old', 10, 'connected'));
    assert.equal(catalog.currentAa()?.id, 'a');
    assert.equal(catalog.currentAa()?.status, 'disconnected');

    const browserA: BrowserDetails = {
      id: 'a', type: 'Chrome', version: '1', userAgent: 'agent', proxy: '', extensionId: 'ext'
    };
    const browserB: BrowserDetails = { ...browserA, id: 'b', type: 'Firefox' };
    catalog.upsertBrowser(browserB);
    catalog.upsertBrowser(browserA);
    assert.deepEqual(catalog.allBrowsers(), [{ browser: browserA }, { browser: browserB }]);
    assert.deepEqual(catalog.browserById('a'), { browser: browserA });
    assert.equal(catalog.browserById('missing'), undefined);
    const updatedBrowser = { ...browserA, version: '2' };
    catalog.upsertBrowser(updatedBrowser);
    assert.deepEqual(catalog.browserById('a'), { browser: updatedBrowser });

    const extension: ExtensionDetails = {
      id: 'ext', version: 'v1', supportingPlatforms: [
        { facebook: { supportingFeatures: ['Parser'], parserInfo: { version: '1', type: ['Post'] } } },
        { tiktok: { supportingFeatures: ['Automation'] } }
      ]
    };
    catalog.upsertExtension(extension);
    assert.deepEqual(catalog.extensionById('ext'), extension);
    assert.equal(catalog.extensionById('missing'), undefined);

    const activity: ExtensionActivity = {
      id: 'child', name: 'activity', createdTime: 1, updatedTime: 2,
      extensionConfigId: 'cfg', extraMeta: { nested: { retained: true } }, inputs: { payload: ['x'] },
      platform: 'Threads', priority: 0, scheduleTime: 'raw|schedule', scheduleType: 'alarm'
    };
    const task: ExtensionTask = {
      id: 'child-task', activity: { id: 'child', name: 'activity' },
      createdTime: 1, updatedTime: 2, endTime: 3, inputs: { deep: { value: 1 } }, nextTask: 'next',
      platform: 'threads', priority: 2, state: 'executing', tabId: 8
    };
    const earlierActivity: ExtensionActivity = { ...activity, id: 'a-child' };
    const earlierTask: ExtensionTask = { ...task, id: 'a-task' };
    catalog.upsertActivity('ext', activity);
    catalog.upsertActivity('ext', earlierActivity);
    catalog.upsertTask('ext', task);
    catalog.upsertTask('ext', earlierTask);
    assert.deepEqual(catalog.activitiesByExtension('ext'), [earlierActivity, activity]);
    assert.deepEqual(catalog.tasksByExtension('ext'), [earlierTask, task]);
    assert.deepEqual(catalog.activitiesByExtension('orphan'), []);
    assert.deepEqual(catalog.tasksByExtension('orphan'), []);

    const movedActivity: ExtensionActivity = { ...activity, platform: 'Facebook', name: 'updated' };
    const movedTask: ExtensionTask = { ...task, state: 'finished' };
    catalog.upsertActivity('other-ext', movedActivity);
    catalog.upsertTask('other-ext', movedTask);
    assert.deepEqual(catalog.activitiesByExtension('ext'), [earlierActivity]);
    assert.deepEqual(catalog.tasksByExtension('ext'), [earlierTask]);
    assert.deepEqual(catalog.activitiesByExtension('other-ext'), [movedActivity]);
    assert.deepEqual(catalog.tasksByExtension('other-ext'), [movedTask]);
    catalog.upsertActivity(' ext ', { ...activity, id: 'spaced-child' });
    assert.deepEqual(catalog.activitiesByExtension(' ext '), [{ ...activity, id: 'spaced-child' }]);

    catalog.upsertBrowser({ ...browserA, id: ' raw ' });
    assert.deepEqual(catalog.browserById(' raw '), { browser: { ...browserA, id: ' raw ' } });
    assert.equal(catalog.browserById('raw'), undefined);
    assert.throws(() => catalog.upsertBrowser({ ...browserA, id: '  ' }), { message: 'ID must not be empty' });
    assert.throws(() => catalog.upsertActivity(' ', activity), { message: 'Extension ID must not be empty' });
    assert.throws(() => catalog.upsertTask(' ', task), { message: 'Extension ID must not be empty' });
  } finally {
    database.close();
  }
});

test('catalog rows survive database reopen and malformed JSON continues to propagate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aab-aa-catalog-'));
  const path = join(directory, 'catalog.sqlite');
  try {
    const firstDatabase = openDatabase(path);
    const firstCatalog = new SqliteAaCatalogRepository(firstDatabase);
    const browser: BrowserDetails = {
      id: 'persisted', type: 'Browser', version: '1', userAgent: 'agent', proxy: '', extensionId: 'ext'
    };
    firstCatalog.upsertBrowser(browser);
    firstDatabase.close();

    const reopenedDatabase = openDatabase(path);
    try {
      const catalog = new SqliteAaCatalogRepository(reopenedDatabase);
      assert.deepEqual(catalog.browserById('persisted'), { browser });
      reopenedDatabase.prepare('UPDATE AaBrowser SET payload = ? WHERE id = ?').run('{malformed', 'persisted');
      assert.throws(() => catalog.browserById('persisted'), SyntaxError);
    } finally {
      reopenedDatabase.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('catalog HTTP adapter preserves static route order, response shapes and parent existence policy', async () => {
  const fake = catalogFake();
  const baseUrl = await startHttp(fake.repository);
  const allBrowsers = await fetch(`${baseUrl}/api/browser/all`);
  assert.equal(allBrowsers.status, 200);
  assert.deepEqual(await allBrowsers.json(), [{ browser: fake.browser }]);
  assert.equal(fake.calls.some(call => call.method === 'browserById' && call.id === 'all'), false);

  const rawId = await fetch(`${baseUrl}/api/browser/%20raw%20`);
  assert.equal(rawId.status, 404);
  assert.deepEqual(await rawId.json(), { error: 'browser_not_found' });
  assert.deepEqual(fake.calls.at(-1), { method: 'browserById', id: ' raw ' });

  for (const [path, expected] of [
    ['/api/browser/missing', { error: 'browser_not_found' }],
    ['/api/extension/missing', { error: 'extension_not_found' }]
  ]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), expected);
  }

  const callsBeforeMissingChildren = fake.calls.length;
  for (const path of ['/api/extension/missing/activities', '/api/extension/missing/tasks']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'extension_not_found' });
  }
  assert.deepEqual(fake.calls.slice(callsBeforeMissingChildren), [
    { method: 'extensionById', id: 'missing' },
    { method: 'extensionById', id: 'missing' }
  ]);

  const returnedActivities = await fetch(`${baseUrl}/api/extension/ext-1/activities`);
  assert.equal(returnedActivities.status, 200);
  assert.deepEqual(await returnedActivities.json(), [fake.activity]);
  const returnedTasks = await fetch(`${baseUrl}/api/extension/ext-1/tasks`);
  assert.equal(returnedTasks.status, 200);
  assert.deepEqual(await returnedTasks.json(), [fake.task]);
  assert.deepEqual(fake.calls.slice(-4), [
    { method: 'extensionById', id: 'ext-1' }, { method: 'activitiesByExtension', id: 'ext-1' },
    { method: 'extensionById', id: 'ext-1' }, { method: 'tasksByExtension', id: 'ext-1' }
  ]);

  const emptyChildren = catalogFake({ emptyChildren: true });
  const emptyChildrenUrl = await startHttp(emptyChildren.repository);
  for (const path of ['/api/extension/ext-1/activities', '/api/extension/ext-1/tasks']) {
    const response = await fetch(`${emptyChildrenUrl}${path}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  }

  const noAa: AaCatalogRepository = { ...fake.repository, currentAa: () => undefined };
  const noAaUrl = await startHttp(noAa);
  const missingAa = await fetch(`${noAaUrl}/api/aa`);
  assert.equal(missingAa.status, 404);
  assert.deepEqual(await missingAa.json(), { error: 'aa_not_found' });

  for (const path of ['/api/aa', '/api/browser/all', '/api/extension/ext-1']) {
    const mutation = await fetch(`${baseUrl}${path}`, { method: 'POST' });
    assert.equal(mutation.status, 404);
  }
});

test('catalog route is absent without capability and SQLite gate retains exact auth/path behavior', async () => {
  const withoutCatalog = await startHttp(undefined, { sqliteEnabled: true });
  const unmatched = await fetch(`${withoutCatalog}/api/aa`);
  assert.equal(unmatched.status, 404);

  const disabled = await startHttp(undefined, { apiKey: 'catalog-key', sqliteEnabled: false });
  for (const path of ['/api/aa', '/api/browser', '/api/browser/', '/api/browser/all', '/api/extension/x']) {
    const unauthorized = await fetch(`${disabled}${path}`);
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: 'unauthorized' });
    const authorized = await fetch(`${disabled}${path}`, { headers: { 'x-api-key': 'catalog-key' } });
    assert.equal(authorized.status, 503);
    assert.deepEqual(await authorized.json(), { error: 'SQLITE_DISABLED' });
  }
  const noTrailingSlash = await fetch(`${disabled}/api/extension`, { headers: { 'x-api-key': 'catalog-key' } });
  assert.equal(noTrailingSlash.status, 404);
});

test('application catalogs use isolated databases and are absent when SQLite is disabled', async () => {
  const first = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
  const second = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
  const disabled = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
  try {
    const aa: AaConnection = {
      id: 'aa', userId: 'user', status: 'connected', connectedTime: 1, lastHeartbeatTime: 1, disconnectedTime: 0
    };
    first.catalog.upsertAa(aa);
    assert.deepEqual(first.catalog.currentAa(), aa);
    assert.equal(second.catalog.currentAa(), undefined);
    assert.equal(disabled.catalog, undefined);
  } finally {
    await Promise.all([first.close(), second.close(), disabled.close()]);
  }
});

test('synchronous catalog repository exceptions retain the global HTTP 500 response', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const broken: AaCatalogRepository = {
      currentAa() { throw new Error('catalog failure'); },
      allBrowsers() { return []; },
      browserById() { return undefined; },
      extensionById() { return undefined; },
      activitiesByExtension() { return []; },
      tasksByExtension() { return []; }
    };
    const baseUrl = await startHttp(broken);
    const response = await fetch(`${baseUrl}/api/aa`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'internal server error' });
  } finally {
    console.error = originalError;
  }
});
