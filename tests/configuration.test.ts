import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConfiguration, type ResolvedConfiguration } from '../src/config/configuration.js';
import type { ApplicationConfig } from '../src/app/create-app.js';
import type { CdcConnectionConfig as LegacyCdcConnectionConfig, VmInfo as LegacyVmInfo } from '../src/infrastructure/socket/cdc-connector.js';
import type { CdcConnectionConfig, VmInfo } from '../src/modules/cdc/contracts.js';
import type { CdcProtocolConfig } from '../src/modules/cdc/cdc-protocol.js';

const defaultVmInfo: VmInfo = {
  udid: 'as-demo-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: []
};

const fullVmInfo: VmInfo = {
  udid: 'vm-1', sdk: '35', model: 'Pixel', abi: 'arm64-v8a', forSearch: true, platforms: ['android', 'ios']
};

const defaultCdcConfig: CdcConnectionConfig = {
  url: 'http://127.0.0.1:3001', path: '/ws', vmInfo: defaultVmInfo
};

const fullCdcConfig: CdcConnectionConfig = {
  url: 'http://cdc.example', path: '/socket', vmInfo: fullVmInfo, apiKey: 'secret'
};

// These assignments compile only while the legacy and canonical import paths stay compatible.
const legacyVmInfo: LegacyVmInfo = fullVmInfo;
const canonicalVmInfo: VmInfo = legacyVmInfo;
const legacyCdcConfig: LegacyCdcConnectionConfig = fullCdcConfig;
const canonicalCdcConfig: CdcConnectionConfig = legacyCdcConfig;
const protocolConfig: CdcProtocolConfig = { vmInfo: fullVmInfo };
const applicationConfig: ApplicationConfig = {
  dbPath: './data/app.db', corsOrigin: 'http://localhost:5173', cdc: defaultCdcConfig
};
const resolvedConfiguration: ResolvedConfiguration = {
  port: 3000,
  host: undefined,
  enableTestPeers: true,
  application: {
    dbPath: './data/app.db', corsOrigin: 'http://localhost:5173', apiKey: undefined,
    enableSqlite: false, enableTestPeers: true, cdc: defaultCdcConfig, shutdownTimeoutMs: 15_000
  }
};

test('configuration resolves standalone defaults and SQLite mode explicitly', () => {
  const configuration = resolveConfiguration({});
  assert.equal(configuration.port, 3000);
  assert.equal(configuration.host, undefined);
  assert.equal(configuration.application.dbPath, './data/app.db');
  assert.equal(configuration.application.enableSqlite, false);
  assert.equal(configuration.application.corsOrigin, 'http://localhost:5173');
  assert.equal(configuration.application.enableTestPeers, false);
  assert.equal(configuration.application.cdc, undefined);
  assert.equal(configuration.application.shutdownTimeoutMs, 15_000);
  assert.equal(resolveConfiguration({ ENABLE_TEST_PEERS: '0' }).enableTestPeers, false);
  assert.deepEqual(defaultVmInfo, { udid: 'as-demo-vm', sdk: '', model: '', abi: '', forSearch: false, platforms: [] });
  assert.deepEqual(resolveConfiguration({ ENABLE_TEST_PEERS: '1' }).application.cdc, defaultCdcConfig);
});

test('configuration centralizes feature flags and preserves environment overrides', () => {
  const configuration = resolveConfiguration({
    PORT: '43870', DB_PATH: ':memory:', ENABLE_SQLITE: '1', ENABLE_TEST_PEERS: '1',
    SOCKET_CORS_ORIGIN: '*', API_KEY: 'secret', CDC_URL: 'http://cdc',
    CDC_SOCKET_PATH: '/socket', VM_UDID: 'vm-1', VM_SDK: '35', VM_MODEL: 'Pixel', VM_ABI: 'arm64-v8a',
    VM_FOR_SEARCH: 'true', VM_PLATFORMS: ' android, ,ios '
  });
  assert.equal(configuration.port, 43870);
  assert.equal(configuration.application.enableSqlite, true);
  assert.equal(configuration.enableTestPeers, true);
  assert.equal(configuration.application.enableTestPeers, true);
  assert.equal(configuration.application.apiKey, 'secret');
  assert.deepEqual(configuration.application.cdc, {
    url: 'http://cdc', path: '/socket', vmInfo: fullVmInfo
  });
});

test('configuration rejects ports outside safe integer range 0 through 65535', () => {
  for (const PORT of ['-1', '65536', '1.5', 'abc', '9007199254740992']) {
    assert.throws(() => resolveConfiguration({ PORT }), { message: 'Invalid PORT' });
  }
  assert.equal(resolveConfiguration({ PORT: '0' }).port, 0);
  assert.equal(resolveConfiguration({ PORT: '65535' }).port, 65535);
});

test('configuration accepts explicit IPv4 and IPv6 HOST literals without changing PORT behavior', () => {
  assert.equal(resolveConfiguration({ HOST: '127.0.0.1' }).host, '127.0.0.1');
  assert.equal(resolveConfiguration({ HOST: '0.0.0.0' }).host, '0.0.0.0');
  assert.equal(resolveConfiguration({ HOST: '::1' }).host, '::1');
  assert.equal(resolveConfiguration({ HOST: '2001:db8::1' }).host, '2001:db8::1');
  assert.equal(resolveConfiguration({ HOST: '127.0.0.1', PORT: '43870' }).port, 43870);
  assert.equal(resolveConfiguration({ PORT: '0' }).port, 0);
  assert.equal(resolveConfiguration({}).port, 3000);
});

test('configuration rejects explicitly empty, whitespace, non-IP and padded HOST values', () => {
  for (const HOST of ['', ' ', '\t', ' localhost ', 'localhost', '127.0.0.1 ']) {
    assert.throws(() => resolveConfiguration({ HOST }), { message: 'Invalid HOST' });
  }
});

test('shutdown budget defaults to fifteen seconds and validates the bounded millisecond setting', () => {
  assert.equal(resolveConfiguration({ SHUTDOWN_TIMEOUT_MS: '25000' }).application.shutdownTimeoutMs, 25_000);
  for (const SHUTDOWN_TIMEOUT_MS of ['0', '-1', '1.5', '120001', 'not-a-number']) {
    assert.throws(() => resolveConfiguration({ SHUTDOWN_TIMEOUT_MS }), /Invalid SHUTDOWN_TIMEOUT_MS/);
  }
});

test('Cdc feature gate and exact flag strings are preserved', () => {
  assert.equal(resolveConfiguration({ ENABLE_TEST_PEERS: 'true' }).application.cdc, undefined);
  assert.equal(resolveConfiguration({ ENABLE_TEST_PEERS: '1' }).application.cdc?.url, 'http://127.0.0.1:3001');
  assert.equal(resolveConfiguration({ ENABLE_SQLITE: 'true' }).application.enableSqlite, false);
  assert.equal(resolveConfiguration({ ENABLE_SQLITE: '1' }).application.enableSqlite, true);
  assert.equal(resolveConfiguration({ VM_FOR_SEARCH: '1', ENABLE_TEST_PEERS: '1' }).application.cdc?.vmInfo.forSearch, false);
});

test('CLI feature gates accept only the exact string 1', () => {
  for (const [value, enabled] of [
    [undefined, false], ['0', false], ['true', false], [' 1', false], ['1 ', false], ['TRUE', false], ['1', true]
  ] as const) {
    const configuration = resolveConfiguration(value === undefined ? {} : { ENABLE_TEST_PEERS: value, ENABLE_SQLITE: value });
    assert.equal(configuration.enableTestPeers, enabled, `ENABLE_TEST_PEERS=${String(value)}`);
    assert.equal(configuration.application.enableTestPeers, enabled, `nested enableTestPeers=${String(value)}`);
    assert.equal(configuration.application.cdc !== undefined, enabled, `Cdc config=${String(value)}`);
    assert.equal(configuration.application.enableSqlite, enabled, `ENABLE_SQLITE=${String(value)}`);
  }
});

test('Cdc contracts remain structurally compatible across public boundaries', () => {
  assert.equal(canonicalVmInfo.udid, fullVmInfo.udid);
  assert.equal(canonicalCdcConfig.url, fullCdcConfig.url);
  assert.equal(protocolConfig.vmInfo, fullVmInfo);
  assert.equal(applicationConfig.cdc?.url, defaultCdcConfig.url);
  assert.equal(resolvedConfiguration.application.cdc?.url, defaultCdcConfig.url);
});
