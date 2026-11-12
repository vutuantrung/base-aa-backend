import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/app/create-app.js';
import { createMockPServer } from './support/mock-pserver.js';

let pserver: Awaited<ReturnType<typeof createMockPServer>>;
let app: ReturnType<typeof createApplication>;
before(async () => {
  pserver = await createMockPServer();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    pserver: { url: pserver.url, path: '/ws',
      vmInfo: { udid: 'test-vm', sdk: '33', model: 'Pixel', abi: 'arm64-v8a', forSearch: true, platforms: ['facebook'] } }
  });
  await app.listen(0);
  await pserver.arrival;
  for (let attempt = 0; attempt < 100 && !app.pserverConnector?.connected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!app.pserverConnector?.connected) throw new Error('PServer session not ready');
});
after(async () => { if (app) await app.close(); if (pserver) await pserver.close(); });

test('AAB connects on /ws and registers VM session', () => {
  assert.ok(pserver.connected?.connected);
  assert.ok(pserver.sessionId);
  assert.equal(app.pserverConnector?.sessionId, pserver.sessionId);
  assert.equal(app.pserverConnector?.connected, true);
});

test('AAB validates received task session_id and vm_udid', async () => {
  const source = pserver.connected;
  assert.ok(source);
  const logs: string[] = [];
  const warns: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try {
    source.emit('activity:task:dispatch', { session_id: pserver.sessionId, vm_udid: 'test-vm', task_id: 'valid' });
    source.emit('activity:task:dispatch', { session_id: 'wrong', vm_udid: 'test-vm' });
    source.emit('activity:task:dispatch', { session_id: pserver.sessionId, vm_udid: 'wrong' });
    await new Promise(resolve => setTimeout(resolve, 100));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  assert.ok(logs.some(line => line.includes('ACTIVITY_TASK VALIDATED')));
  assert.ok(warns.some(line => line.includes('Session mismatch')));
  assert.ok(warns.some(line => line.includes('VM mismatch')));
});
