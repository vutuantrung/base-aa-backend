import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { io } from 'socket.io-client';
import { createApplication, type ApplicationInstance } from '../src/app/create-app.js';
import { startApplication, stopApplication } from '../src/app/lifecycle.js';
import type { ResolvedConfiguration } from '../src/config/configuration.js';
import { SqliteAaCatalogRepository } from '../src/modules/aa-catalog/sqlite-catalog.js';
import { SqliteProcessUsageRepository } from '../src/modules/process-usage/process-usage.js';
import { SqliteSessionRepository } from '../src/modules/session/session.js';

const omittedSqlite = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
const enabledSqlite = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: true });
const disabledSqlite = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
const dynamicSqliteEnabled = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: true });
const dynamicSqliteDisabled = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
const concreteSessions: SqliteSessionRepository = enabledSqlite.sessions;
const concreteUsage: SqliteProcessUsageRepository = enabledSqlite.usage;
const concreteCatalog: SqliteAaCatalogRepository = enabledSqlite.catalog;
const broadSessions: SqliteSessionRepository | undefined = disabledSqlite.sessions;
const broadUsage: SqliteProcessUsageRepository | undefined = disabledSqlite.usage;
const broadCatalog: SqliteAaCatalogRepository | undefined = dynamicSqliteDisabled.catalog;
const configuration: ResolvedConfiguration = {
  port: 0,
  host: undefined,
  enableTestPeers: false,
  application: {
    dbPath: ':memory:', corsOrigin: '*', apiKey: undefined,
    enableSqlite: false, enableTestPeers: false, cdc: undefined, shutdownTimeoutMs: 15_000
  }
};
const compatibleApplication: ApplicationInstance = createApplication(configuration.application);

void [concreteSessions, concreteUsage, concreteCatalog, broadSessions, broadUsage, broadCatalog, compatibleApplication];

const cdcConfig = {
  url: 'http://127.0.0.1:1',
  vmInfo: { udid: 'compat-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] }
};
const exampleProbe = { from: 'cdc', to: 'aa', payload: { type: 'demo.modified-param', version: '1.0', data: {} },
  version: '1.0', kind: 'event', channel: 'worker', event: 'message', id: 'compatibility-probe', timestamp: 0 } as const;

test('SQLite overloads and runtime values preserve concrete and optional repository handles', async () => {
  const applications = [omittedSqlite, enabledSqlite, disabledSqlite, dynamicSqliteEnabled, dynamicSqliteDisabled];
  try {
    for (const app of [omittedSqlite, enabledSqlite, dynamicSqliteEnabled]) {
      assert.ok(app.sessions);
      assert.ok(app.usage);
      assert.ok(app.catalog);
    }
    for (const app of [disabledSqlite, dynamicSqliteDisabled]) {
      assert.equal(app.sessions, undefined);
      assert.equal(app.usage, undefined);
      assert.equal(app.catalog, undefined);
    }

    const session = enabledSqlite.sessions.create('compatibility');
    assert.deepEqual(enabledSqlite.sessions.get(session.id), session);
    assert.deepEqual(enabledSqlite.sessions.list(), [session]);
    assert.deepEqual(omittedSqlite.sessions.list(), []);

    const usage = enabledSqlite.usage.create({ pid: 42, cpu: 0.25, memory: 128 });
    assert.deepEqual(enabledSqlite.usage.list(), [usage]);
    assert.deepEqual(omittedSqlite.usage.list(), []);
  } finally {
    await Promise.all(applications.map(app => app.close()));
  }
});

test('Cdc connector exists only when peer gateway and Cdc config are both supplied', async () => {
  const disabledPeers = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, cdc: cdcConfig });
  const missingCdc = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true });
  const enabled = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true, cdc: cdcConfig });
  try {
    assert.equal(disabledPeers.cdcConnector, undefined);
    assert.equal(missingCdc.cdcConnector, undefined);
    assert.deepEqual(missingCdc.transformations.resolve(exampleProbe), []);
    assert.ok(enabled.cdcConnector);
    assert.equal(enabled.cdcConnector.connected, false);
  } finally {
    await Promise.all([disabledPeers.close(), missingCdc.close(), enabled.close()]);
  }
});

test('duplicate route IDs fail construction and the acquired SQLite database can be reopened', async () => {
  const root = await mkdtemp(join(tmpdir(), 'as-r79d-duplicate-route-'));
  const dbPath = join(root, 'app.db');
  const route = { id: 'duplicate', source: 'worker' as const, event: 'message',
    destinations: [{ transport: 'socket' as const, channel: 'worker' as const }] };

  try {
    assert.throws(() => createApplication({ dbPath, corsOrigin: '*', routes: [route, route] }), {
      name: 'Error', message: 'Duplicate route: duplicate'
    });

    const database = new Database(dbPath);
    try {
      const sessionTable = database.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?')
        .get('table', 'Session') as { name: string } | undefined;
      assert.equal(sessionTable?.name, 'Session');
    } finally {
      database.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('blank Cdc UDID fails construction with the public connector validation error', () => {
  assert.throws(() => createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    cdc: { url: 'http://127.0.0.1:1', vmInfo: { udid: '  ', sdk: '', model: '', abi: '', forSearch: false, platforms: [] } }
  }), { name: 'Error', message: 'CDC VM UDID is required' });
});

test('startApplication registers the example after onCreated and before listen using the top-level flag', async () => {
  const topLevelOnly: ResolvedConfiguration = {
    ...configuration,
    enableTestPeers: true,
    application: { ...configuration.application, enableTestPeers: false }
  };
  let createdApp: ApplicationInstance | undefined;
  let visibleWhenCreated: ReturnType<ApplicationInstance['transformations']['resolve']> = [];
  let visibleWhenListening: ReturnType<ApplicationInstance['transformations']['resolve']> = [];
  const app = await startApplication(topLevelOnly, { info() {}, error() {} }, application => {
    createdApp = application;
    visibleWhenCreated = application.transformations.resolve(exampleProbe);
    const listen = application.listen;
    application.listen = port => {
      visibleWhenListening = application.transformations.resolve(exampleProbe);
      return listen(port);
    };
  });
  try {
    assert.equal(createdApp, app);
    assert.deepEqual(visibleWhenCreated, []);
    assert.equal(visibleWhenListening.length, 1);
    assert.equal(visibleWhenListening[0]?.id, 'demo-cdc-to-aa-modified-param');
    assert.equal(visibleWhenListening[0]?.priority, 10);
    assert.equal(app.cdcConnector, undefined);
  } finally {
    await app.close();
  }
});

test('startApplication keeps nested peer mode enabled when top-level demo registration is disabled', async () => {
  const priorTasks = process.env.AS_TASK_STORE_DIR;
  const priorSelections = process.env.AS_SELECTION_STORE_DIR;
  const root = await mkdtemp(join(tmpdir(), 'as-r710b-mode-mismatch-'));
  process.env.AS_TASK_STORE_DIR = join(root, 'tasks');
  process.env.AS_SELECTION_STORE_DIR = join(root, 'selections');
  const nestedOnly: ResolvedConfiguration = {
    ...configuration,
    enableTestPeers: false,
    application: { ...configuration.application, enableTestPeers: true, cdc: undefined }
  };
  let visibleWhenCreated: ReturnType<ApplicationInstance['transformations']['resolve']> = [];
  let app: ApplicationInstance | undefined;
  let peer: ReturnType<typeof io> | undefined;
  try {
    app = await startApplication(nestedOnly, { info() {}, error() {} }, application => {
      visibleWhenCreated = application.transformations.resolve(exampleProbe);
    });
    assert.deepEqual(visibleWhenCreated, []);
    assert.deepEqual(app.transformations.resolve(exampleProbe), []);
    assert.equal(app.cdcConnector, undefined);

    const address = app.httpServer.address();
    assert.ok(address && typeof address === 'object');
    peer = io(`http://127.0.0.1:${address.port}/peers`, {
      transports: ['websocket'], reconnection: false, auth: { peerId: 'aa' }
    });
    await new Promise<void>((resolve, reject) => {
      peer?.once('connect', resolve);
      peer?.once('connect_error', reject);
    });
    assert.equal(peer.connected, true);
  } finally {
    peer?.disconnect();
    if (app) await app.close();
    if (priorTasks === undefined) delete process.env.AS_TASK_STORE_DIR;
    else process.env.AS_TASK_STORE_DIR = priorTasks;
    if (priorSelections === undefined) delete process.env.AS_SELECTION_STORE_DIR;
    else process.env.AS_SELECTION_STORE_DIR = priorSelections;
    await rm(root, { recursive: true, force: true });
  }
});

test('application listen returns the bound ephemeral port and close releases it', async () => {
  const app = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
  const port = await app.listen(0);
  try {
    assert.ok(port > 0);
    const address = app.httpServer.address();
    assert.ok(address && typeof address === 'object');
    assert.equal(address.port, port);
  } finally {
    await app.close();
  }
  assert.equal(app.httpServer.listening, false);
});

test('startApplication accepts resolved configuration and stopApplication accepts close-only input', async () => {
  let visibleWhenCreated: ReturnType<ApplicationInstance['transformations']['resolve']> = [];
  const app = await startApplication(configuration, { info() {}, error() {} }, application => {
    visibleWhenCreated = application.transformations.resolve(exampleProbe);
  });
  assert.deepEqual(visibleWhenCreated, []);
  assert.deepEqual(app.transformations.resolve(exampleProbe), []);
  await stopApplication({ close: async () => {} }, { info() {}, error() {} });
  await app.close();
});
