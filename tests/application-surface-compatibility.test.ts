import assert from 'node:assert/strict';
import { test } from 'node:test';
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
  enableTestPeers: false,
  application: {
    dbPath: ':memory:', corsOrigin: '*', apiKey: undefined,
    enableSqlite: false, enableTestPeers: false, pserver: undefined, shutdownTimeoutMs: 15_000
  }
};
const compatibleApplication: ApplicationInstance = createApplication(configuration.application);

void [concreteSessions, concreteUsage, concreteCatalog, broadSessions, broadUsage, broadCatalog, compatibleApplication];

const pserverConfig = {
  url: 'http://127.0.0.1:1',
  vmInfo: { udid: 'compat-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] }
};
const exampleProbe = { from: 'pserver', to: 'aaui', payload: { type: 'demo.modified-param', version: '1.0', data: {} },
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

test('PServer connector exists only when peer gateway and PServer config are both supplied', async () => {
  const disabledPeers = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, pserver: pserverConfig });
  const missingPserver = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true });
  const enabled = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false, enableTestPeers: true, pserver: pserverConfig });
  try {
    assert.equal(disabledPeers.pserverConnector, undefined);
    assert.equal(missingPserver.pserverConnector, undefined);
    assert.deepEqual(missingPserver.transformations.resolve(exampleProbe), []);
    assert.ok(enabled.pserverConnector);
    assert.equal(enabled.pserverConnector.connected, false);
  } finally {
    await Promise.all([disabledPeers.close(), missingPserver.close(), enabled.close()]);
  }
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
    assert.equal(visibleWhenListening[0]?.id, 'demo-pserver-to-aaui-modified-param');
    assert.equal(visibleWhenListening[0]?.priority, 10);
    assert.equal(app.pserverConnector, undefined);
  } finally {
    await app.close();
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
