import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../src/app/create-app.js';
import { startApplication } from '../src/app/lifecycle.js';
import { resolveConfiguration } from '../src/config/configuration.js';

test('lifecycle HOST binds the shared HTTP and Socket.IO server to loopback and closes it', async () => {
  const application = await startApplication(resolveConfiguration({ HOST: '127.0.0.1', PORT: '0' }));
  try {
    const address = application.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    assert.equal(address.address, '127.0.0.1');
    assert.equal(address.family, 'IPv4');
    assert.ok(application.httpServer.listeners('upgrade').length > 0);
  } finally {
    await application.close();
  }
  assert.equal(application.httpServer.listening, false);
});

test('omitting HOST preserves application.listen(port) and previous wildcard binding behavior', async () => {
  const application = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
  try {
    await application.listen(0);
    const address = application.httpServer.address();
    assert.ok(address && typeof address !== 'string');
    assert.notEqual(address.address, '127.0.0.1');
  } finally {
    await application.close();
  }
  assert.equal(application.httpServer.listening, false);
});
