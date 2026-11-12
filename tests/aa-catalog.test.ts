import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/app/create-app.js';

const app = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
let base: string;
before(async () => {
  app.catalog.upsertAa({ id: 'aa-1', userId: 'user-1', status: 'connected',
    connectedTime: 100, lastHeartbeatTime: 110, disconnectedTime: 0 });
  app.catalog.upsertBrowser({ id: 'browser-1', type: 'Chrome', version: '1',
    userAgent: 'agent', proxy: '', extensionId: 'extension-1' });
  app.catalog.upsertExtension({ id: 'extension-1', version: '1.0', supportingPlatforms: [
    { facebook: { supportingFeatures: ['Automation', 'Parser'], parserInfo: { version: '1', type: ['Post'] } } }
  ] });
  app.catalog.upsertActivity('extension-1', { id: 'activity-1', name: 'post', createdTime: 100,
    updatedTime: 200, extensionConfigId: 'config-1', extraMeta: {}, inputs: {},
    platform: 'Facebook', priority: 1, scheduleTime: '1|2|3|4', scheduleType: 'period' });
  app.catalog.upsertTask('extension-1', { id: 'task-1', activity: { id: 'activity-1', name: 'post' },
    createdTime: 100, updatedTime: 200, endTime: 300, inputs: {}, nextTask: '',
    platform: 'facebook', priority: 1, state: 'finished', tabId: 5 });
  base = `http://127.0.0.1:${await app.listen(0)}`;
});
after(async () => { await app.close(); });

test('GET /api/aa', async () => {
  const response = await fetch(`${base}/api/aa`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 'aa-1', userId: 'user-1', status: 'connected',
    connectedTime: 100, lastHeartbeatTime: 110, disconnectedTime: 0 });
});
test('GET /api/browser/all and /api/browser/:id preserve browser wrapper', async () => {
  const all = await fetch(`${base}/api/browser/all`).then(r=>r.json());
  assert.equal(all.length, 1);
  assert.equal(all[0].browser.id, 'browser-1');
  const byId = await fetch(`${base}/api/browser/browser-1`).then(r=>r.json());
  assert.deepEqual(byId, all[0]);
});
test('GET extension, activities, tasks preserve supplied casing and nested fields', async () => {
  const extension = await fetch(`${base}/api/extension/extension-1`).then(r=>r.json());
  assert.equal(extension.supportingPlatforms[0].facebook.parserInfo.type[0], 'Post');
  const activities = await fetch(`${base}/api/extension/extension-1/activities`).then(r=>r.json());
  assert.equal(activities[0].platform, 'Facebook');
  const tasks = await fetch(`${base}/api/extension/extension-1/tasks`).then(r=>r.json());
  assert.equal(tasks[0].platform, 'facebook');
  assert.equal(tasks[0].activity.id, 'activity-1');
});
test('Unknown singular records return 404 and missing child extension returns 404', async () => {
  for (const path of ['/api/browser/nope', '/api/extension/nope', '/api/extension/nope/tasks']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});
