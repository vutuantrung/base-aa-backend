import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/app/create-app.js';
import { createMockCdc } from './support/mock-cdc.js';

let cdc: Awaited<ReturnType<typeof createMockCdc>>;
let app: ReturnType<typeof createApplication>;
before(async () => {
  cdc = await createMockCdc();
  app = createApplication({
    dbPath: ':memory:', corsOrigin: '*', enableTestPeers: true,
    cdc: { url: cdc.url, path: '/ws',
      vmInfo: { udid: 'test-vm', sdk: '33', model: 'Pixel', abi: 'arm64-v8a', forSearch: true, platforms: ['facebook'] } }
  });
  await app.listen(0);
  await cdc.waitForArrival();
  for (let attempt = 0; attempt < 100 && !app.cdcConnector?.connected; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (!app.cdcConnector?.connected) throw new Error('Cdc session not ready');
});
after(async () => { if (app) await app.close(); if (cdc) await cdc.close(); });

test('AS connects on /ws and registers VM session', () => {
  assert.ok(cdc.connected?.connected);
  assert.ok(cdc.sessionId);
  assert.equal(app.cdcConnector?.sessionId, cdc.sessionId);
  assert.equal(app.cdcConnector?.connected, true);
});

test('AS validates received task session_id and vm_udid', async () => {
  const source = cdc.connected;
  assert.ok(source);
  const logs: string[] = [];
  const warns: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  console.warn = (...args: unknown[]) => { warns.push(args.map(String).join(' ')); };
  try {
    source.emit('activity:task:dispatch', { session_id: cdc.sessionId, vm_udid: 'test-vm', task_id: 'valid' });
    source.emit('activity:task:dispatch', { session_id: 'wrong', vm_udid: 'test-vm' });
    source.emit('activity:task:dispatch', { session_id: cdc.sessionId, vm_udid: 'wrong' });
    await new Promise(resolve => setTimeout(resolve, 100));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  assert.ok(logs.some(line => line.includes('ACTIVITY_TASK VALIDATED')));
  assert.ok(warns.some(line => line.includes('Session mismatch')));
  assert.ok(warns.some(line => line.includes('VM mismatch')));
});
