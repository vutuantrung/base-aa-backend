const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createState, ingest, normalizeVmList, summary, streamState, STATUS_TYPE, VM_TYPE
} = require('../dashboard-state.js');

const at = new Date('2026-11-12T12:00:00.000Z').toISOString();
function message(type, instanceId, data, timestamp = at) {
  return {
    timestamp,
    event: 'RECEIVE peer:message',
    value: {
      from: 'eserver', to: 'aaui', sourceInstanceId: instanceId,
      payload: { type, data }
    }
  };
}
function vm(id) {
  return [{
    id, browserId: id + '-browser', version: '1.0',
    supportingPlatforms: [{
      platform: 'facebook',
      supportingFeatures: ['Automation 1', 'Parser'],
      parserInfo: { version: '1.0', type: ['Post', 'Profile'] }
    }]
  }];
}

test('ingests both streams from multiple independent EServer instances', () => {
  const state = createState();
  ingest(state, message(STATUS_TYPE, 'e-1', { instanceId: 'e-1', sequence: 1 }));
  ingest(state, message(STATUS_TYPE, 'e-2', { instanceId: 'e-2', sequence: 3 }));
  ingest(state, message(VM_TYPE, 'e-1', vm('vm-a')));
  ingest(state, message(VM_TYPE, 'e-2', vm('vm-b')));

  assert.equal(summary(state).instanceCount, 2);
  assert.equal(summary(state).vmCount, 2);
  assert.equal(summary(state).statusCount, 2);
  assert.equal(summary(state).vmUpdates, 2);
  assert.equal(summary(state, 'e-1').vmCount, 1);
  assert.equal(state.instances['e-2'].lastSequence, 3);
  assert.deepEqual(state.instances['e-1'].vms[0].supportingPlatforms[0].parserInfo.type, ['Post', 'Profile']);
});

test('VM inventory is latest snapshot per instance, not appended forever', () => {
  const state = createState();
  ingest(state, message(VM_TYPE, 'e-1', vm('old')));
  ingest(state, message(VM_TYPE, 'e-1', vm('new')));
  assert.equal(state.instances['e-1'].vmCount, 2);
  assert.equal(state.instances['e-1'].vms.length, 1);
  assert.equal(state.instances['e-1'].vms[0].id, 'new');
  assert.equal(summary(state).vmCount, 1);
});

test('malformed VM data does not overwrite the last valid inventory', () => {
  const state = createState();
  ingest(state, message(VM_TYPE, 'e-1', vm('working')));
  ingest(state, message(VM_TYPE, 'e-1', { unexpected: 'not an array' }));
  assert.equal(state.instances['e-1'].vmCount, 1);
  assert.equal(state.instances['e-1'].vms[0].id, 'working');
  assert.equal(normalizeVmList({ incorrect: true }), null);
});

test('non EServer messages do not affect telemetry', () => {
  const state = createState();
  ingest(state, {
    timestamp: at, event: 'RECEIVE peer:message',
    value: { from: 'pserver', sourceInstanceId: 'p', payload: { type: VM_TYPE, data: vm('unrelated') } }
  });
  assert.equal(summary(state).instanceCount, 0);
  assert.equal(state.messages.length, 1);
});

test('freshness distinguishes waiting, receiving and stale', () => {
  const now = Date.parse(at);
  assert.equal(streamState(null, 10000, now), 'waiting');
  assert.equal(streamState(now - 12000, 10000, now), 'healthy');
  assert.equal(streamState(now - 30000, 10000, now), 'stale');
});

test('protects instance dictionary against special instance IDs', () => {
  const state = createState();
  ingest(state, message(STATUS_TYPE, '__proto__', { instanceId: '__proto__', sequence: 1 }));
  assert.equal(Object.prototype.hasOwnProperty.call(state.instances, '__proto__'), true);
  assert.equal(state.instances['__proto__'].statusCount, 1);
});

test('retains at most 200 activity events', () => {
  const state = createState();
  for (let i = 0; i < 230; i++) ingest(state, { timestamp: at, event: 'test', value: i });
  assert.equal(state.messages.length, 200);
  assert.equal(state.messages[0].value, 30);
  assert.equal(state.messages[199].value, 229);
});


test('presence snapshot exposes EServers before any application messages', () => {
  const state = createState();
  ingest(state, { timestamp: at, event: 'Socket CONNECT AAB', value: 'socket-aa' });
  ingest(state, {
    timestamp: at, event: 'RECEIVE peer:status:snapshot',
    value: { peerId: 'eserver', timestamp: Date.parse(at), instances: [
      { peerId: 'eserver', instanceId: 'e-1', status: 'online', socketId: 'socket-e1', timestamp: Date.parse(at) },
      { peerId: 'eserver', instanceId: 'e-2', status: 'online', socketId: 'socket-e2', timestamp: Date.parse(at) }
    ] }
  });
  assert.equal(summary(state).instanceCount, 2);
  assert.equal(summary(state).onlineCount, 2);
  assert.equal(summary(state).statusCount, 0);
  assert.equal(state.instances['e-1'].logs.length, 1);
});

test('disconnect event marks only its EServer offline and logs the reason', () => {
  const state = createState();
  ingest(state, { timestamp: at, event: 'Socket CONNECT AAB', value: 'socket-aa' });
  for (const id of ['e-1', 'e-2']) {
    ingest(state, { timestamp: at, event: 'RECEIVE peer:status', value: {
      peerId: 'eserver', instanceId: id, status: 'online', socketId: id, timestamp: Date.parse(at)
    } });
  }
  ingest(state, { timestamp: at, event: 'RECEIVE peer:status', value: {
    peerId: 'eserver', instanceId: 'e-1', status: 'offline',
    socketId: 'e-1', reason: 'transport close', timestamp: Date.parse(at)
  } });
  assert.equal(state.instances['e-1'].presence, 'offline');
  assert.equal(state.instances['e-1'].disconnectReason, 'transport close');
  assert.equal(state.instances['e-2'].presence, 'online');
  assert.equal(summary(state).onlineCount, 1);
  assert.equal(state.instances['e-1'].logs.length, 2);
});

test('late disconnect from a previous socket does not mark a reconnected EServer offline', () => {
  const state = createState();
  ingest(state, { timestamp: at, event: 'Socket CONNECT AAB', value: 'socket-aa' });
  ingest(state, { timestamp: at, event: 'RECEIVE peer:status', value: {
    peerId: 'eserver', instanceId: 'e-1', status: 'online', socketId: 'new'
  } });
  ingest(state, { timestamp: at, event: 'RECEIVE peer:status', value: {
    peerId: 'eserver', instanceId: 'e-1', status: 'offline', socketId: 'old'
  } });
  assert.equal(state.instances['e-1'].presence, 'online');
  assert.equal(state.instances['e-1'].logs.length, 1);
});

test('AAUI disconnect makes all EServer connection statuses unknown until snapshot', () => {
  const state = createState();
  const online = {
    peerId: 'eserver', instanceId: 'e-1', status: 'online', socketId: 'esock'
  };
  ingest(state, { timestamp: at, event: 'Socket CONNECT AAB', value: 'aaui-1' });
  ingest(state, { timestamp: at, event: 'RECEIVE peer:status', value: online });
  assert.equal(summary(state).onlineCount, 1);
  ingest(state, { timestamp: at, event: 'Socket DISCONNECT', value: 'transport close' });
  assert.equal(summary(state).onlineCount, 0);
  assert.equal(state.instances['e-1'].presence, 'online'); // Last known, but not trusted while AAUI is offline
  ingest(state, { timestamp: at, event: 'Socket CONNECT AAB', value: 'aaui-2' });
  ingest(state, { timestamp: at, event: 'RECEIVE peer:status:snapshot', value: {
    peerId: 'eserver', timestamp: Date.parse(at), instances: []
  } });
  assert.equal(state.instances['e-1'].presence, 'offline');
  assert.equal(summary(state).offlineCount, 1);
});

test('logs from individual EServer instances are isolated and bounded', () => {
  const state = createState();
  for (let i = 0; i < 130; i++) ingest(state, message(STATUS_TYPE, 'e-1', { sequence: i }));
  ingest(state, message(VM_TYPE, 'e-2', vm('other-vm')));
  assert.equal(state.instances['e-1'].logs.length, 100);
  assert.equal(state.instances['e-1'].logs[0].value.payload.data.sequence, 30);
  assert.equal(state.instances['e-2'].logs.length, 1);
  assert.equal(state.messages.length, 131);
});
