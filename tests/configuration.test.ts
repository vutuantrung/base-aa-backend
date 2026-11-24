import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConfiguration, type ResolvedConfiguration } from '../src/config/configuration.js';
import type { ApplicationConfig } from '../src/app/create-app.js';
import type { PServerConnectionConfig as LegacyPServerConnectionConfig, VmInfo as LegacyVmInfo } from '../src/infrastructure/socket/pserver-connector.js';
import type { PServerConnectionConfig, VmInfo } from '../src/modules/pserver/contracts.js';
import type { PServerProtocolConfig } from '../src/modules/pserver/pserver-protocol.js';

const defaultVmInfo: VmInfo = {
  udid: 'aab-demo-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: []
};

const fullVmInfo: VmInfo = {
  udid: 'vm-1', sdk: '35', model: 'Pixel', abi: 'arm64-v8a', forSearch: true, platforms: ['android', 'ios']
};

const defaultPServerConfig: PServerConnectionConfig = {
  url: 'http://127.0.0.1:3001', path: '/ws', vmInfo: defaultVmInfo
};

const fullPServerConfig: PServerConnectionConfig = {
  url: 'http://pserver.example', path: '/socket', vmInfo: fullVmInfo, apiKey: 'secret'
};

// These assignments compile only while the legacy and canonical import paths stay compatible.
const legacyVmInfo: LegacyVmInfo = fullVmInfo;
const canonicalVmInfo: VmInfo = legacyVmInfo;
const legacyPServerConfig: LegacyPServerConnectionConfig = fullPServerConfig;
const canonicalPServerConfig: PServerConnectionConfig = legacyPServerConfig;
const protocolConfig: PServerProtocolConfig = { vmInfo: fullVmInfo };
const applicationConfig: ApplicationConfig = {
  dbPath: './data/app.db', corsOrigin: 'http://localhost:5173', pserver: defaultPServerConfig
};
const resolvedConfiguration: ResolvedConfiguration = {
  port: 3000,
  enableTestPeers: true,
  application: {
    dbPath: './data/app.db', corsOrigin: 'http://localhost:5173', apiKey: undefined,
    enableSqlite: false, enableTestPeers: true, pserver: defaultPServerConfig, shutdownTimeoutMs: 15_000
  }
};

test('configuration resolves standalone defaults and SQLite mode explicitly', () => {
  const configuration = resolveConfiguration({});
  assert.equal(configuration.port, 3000);
  assert.equal(configuration.application.dbPath, './data/app.db');
  assert.equal(configuration.application.enableSqlite, false);
  assert.equal(configuration.application.corsOrigin, 'http://localhost:5173');
  assert.equal(configuration.application.enableTestPeers, false);
  assert.equal(configuration.application.pserver, undefined);
  assert.equal(configuration.application.shutdownTimeoutMs, 15_000);
  assert.equal(resolveConfiguration({ ENABLE_TEST_PEERS: '0' }).enableTestPeers, false);
  assert.deepEqual(defaultVmInfo, { udid: 'aab-demo-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] });
  assert.deepEqual(resolveConfiguration({ ENABLE_TEST_PEERS: '1' }).application.pserver, defaultPServerConfig);
});

test('configuration centralizes feature flags and preserves environment overrides', () => {
  const configuration = resolveConfiguration({
    PORT: '43870', DB_PATH: ':memory:', ENABLE_SQLITE: '1', ENABLE_TEST_PEERS: '1',
    SOCKET_CORS_ORIGIN: '*', API_KEY: 'secret', PSERVER_URL: 'http://pserver',
    PSERVER_SOCKET_PATH: '/socket', VM_UDID: 'vm-1', VM_SDK: '35', VM_MODEL: 'Pixel', VM_ABI: 'arm64-v8a',
    VM_FOR_SEARCH: 'true', VM_PLATFORMS: ' android, ,ios '
  });
  assert.equal(configuration.port, 43870);
  assert.equal(configuration.application.enableSqlite, true);
  assert.equal(configuration.enableTestPeers, true);
  assert.equal(configuration.application.enableTestPeers, true);
  assert.equal(configuration.application.apiKey, 'secret');
  assert.deepEqual(configuration.application.pserver, {
    url: 'http://pserver', path: '/socket', vmInfo: fullVmInfo
  });
});

test('configuration rejects ports outside safe integer range 0 through 65535', () => {
  for (const PORT of ['-1', '65536', '1.5', 'abc', '9007199254740992']) {
    assert.throws(() => resolveConfiguration({ PORT }), { message: 'Invalid PORT' });
  }
  assert.equal(resolveConfiguration({ PORT: '0' }).port, 0);
  assert.equal(resolveConfiguration({ PORT: '65535' }).port, 65535);
});

test('shutdown budget defaults to fifteen seconds and validates the bounded millisecond setting', () => {
  assert.equal(resolveConfiguration({ SHUTDOWN_TIMEOUT_MS: '25000' }).application.shutdownTimeoutMs, 25_000);
  for (const SHUTDOWN_TIMEOUT_MS of ['0', '-1', '1.5', '120001', 'not-a-number']) {
    assert.throws(() => resolveConfiguration({ SHUTDOWN_TIMEOUT_MS }), /Invalid SHUTDOWN_TIMEOUT_MS/);
  }
});

test('PServer feature gate and exact flag strings are preserved', () => {
  assert.equal(resolveConfiguration({ ENABLE_TEST_PEERS: 'true' }).application.pserver, undefined);
  assert.equal(resolveConfiguration({ ENABLE_TEST_PEERS: '1' }).application.pserver?.url, 'http://127.0.0.1:3001');
  assert.equal(resolveConfiguration({ ENABLE_SQLITE: 'true' }).application.enableSqlite, false);
  assert.equal(resolveConfiguration({ ENABLE_SQLITE: '1' }).application.enableSqlite, true);
  assert.equal(resolveConfiguration({ VM_FOR_SEARCH: '1', ENABLE_TEST_PEERS: '1' }).application.pserver?.vmInfo.forSearch, false);
});

test('CLI feature gates accept only the exact string 1', () => {
  for (const [value, enabled] of [
    [undefined, false], ['0', false], ['true', false], [' 1', false], ['1 ', false], ['TRUE', false], ['1', true]
  ] as const) {
    const configuration = resolveConfiguration(value === undefined ? {} : { ENABLE_TEST_PEERS: value, ENABLE_SQLITE: value });
    assert.equal(configuration.enableTestPeers, enabled, `ENABLE_TEST_PEERS=${String(value)}`);
    assert.equal(configuration.application.enableTestPeers, enabled, `nested enableTestPeers=${String(value)}`);
    assert.equal(configuration.application.pserver !== undefined, enabled, `PServer config=${String(value)}`);
    assert.equal(configuration.application.enableSqlite, enabled, `ENABLE_SQLITE=${String(value)}`);
  }
});

test('PServer contracts remain structurally compatible across public boundaries', () => {
  assert.equal(canonicalVmInfo.udid, fullVmInfo.udid);
  assert.equal(canonicalPServerConfig.url, fullPServerConfig.url);
  assert.equal(protocolConfig.vmInfo, fullVmInfo);
  assert.equal(applicationConfig.pserver?.url, defaultPServerConfig.url);
  assert.equal(resolvedConfiguration.application.pserver?.url, defaultPServerConfig.url);
});
