import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConfiguration } from '../src/config/configuration.js';

test('configuration resolves standalone defaults and SQLite mode explicitly', () => {
  const configuration = resolveConfiguration({});
  assert.equal(configuration.port, 3000);
  assert.equal(configuration.application.dbPath, './data/app.db');
  assert.equal(configuration.application.enableSqlite, false);
  assert.equal(configuration.application.corsOrigin, 'http://localhost:5173');
  assert.equal(configuration.application.enableTestPeers, false);
  assert.equal(configuration.application.pserver, undefined);
});

test('configuration centralizes feature flags and preserves environment overrides', () => {
  const configuration = resolveConfiguration({
    PORT: '43870', DB_PATH: ':memory:', ENABLE_SQLITE: '1', ENABLE_TEST_PEERS: '1',
    SOCKET_CORS_ORIGIN: '*', API_KEY: 'secret', PSERVER_URL: 'http://pserver',
    VM_PLATFORMS: 'android, ios '
  });
  assert.equal(configuration.port, 43870);
  assert.equal(configuration.application.enableSqlite, true);
  assert.equal(configuration.enableTestPeers, true);
  assert.equal(configuration.application.enableTestPeers, true);
  assert.equal(configuration.application.apiKey, 'secret');
  assert.deepEqual(configuration.application.pserver?.vmInfo.platforms, ['android', 'ios']);
});

test('configuration rejects invalid ports', () => {
  assert.throws(() => resolveConfiguration({ PORT: '65536' }), { message: 'Invalid PORT' });
});
