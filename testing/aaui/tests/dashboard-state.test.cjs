const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createState, ingest, normalizeVmList, summary, streamState, STATUS_TYPE, VM_TYPE
} = require('../dashboard-state.js');

const at = new Date('2026-11-12T12:00:00.000Z').toISOString();
function message(type, instanceId, data, timestamp = at) {
  const isStatus = type === STATUS_TYPE;
  return {
    timestamp,
    event: 'RECEIVE peer:message',
    value: {
      from: isStatus ? 'sserver' : 'eserver',
      to: 'aaui',
      ...(isStatus ? {} : { sourceInstanceId: instanceId }),
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

test('ingests SServer status stream separately from multiple EServer VM streams', () => {
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
  assert.equal(state.lastStatusSequence, 3);
  assert.equal(state.instances['e-2'].statusCount, 0);
  assert.equal(Object.keys(state.instances).length, 2);
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

test('SServer status cannot create EServer instance cards from its instanceId', () => {
  const state = createState();
  ingest(state, message(STATUS_TYPE, '__proto__', { instanceId: '__proto__', sequence: 1 }));
  assert.equal(Object.prototype.hasOwnProperty.call(state.instances, '__proto__'), false);
  assert.equal(state.totalStatus, 1);
  assert.equal(Object.keys(state.instances).length, 0);
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

test('SServer status does not pollute 10-log EServer histories', () => {
  const state = createState();
  for (let i = 0; i < 130; i++) ingest(state, message(STATUS_TYPE, 'sserver', { sequence: i }));
  for (let i = 0; i < 15; i++) ingest(state, message(VM_TYPE, 'e-2', vm('vm-' + i)));
  assert.equal(state.instances['e-2'].logs.length, 10);
  assert.equal(state.instances['e-2'].logs[0].value.payload.data[0].id, 'vm-5');
  assert.equal(state.instances['e-2'].logs[9].value.payload.data[0].id, 'vm-14');
  assert.equal(state.totalStatus, 130);
  assert.equal(state.lastStatusSequence, 129);
  assert.equal(state.statusHistory.length, 32);
  assert.equal(state.messages.length, 145);
});


test('task lifecycle updates UI state without mixing EServer instance logs', () => {
  const state = createState();
  const task = { id: 'task-123', config: 'mock config', status: 'inProgress',
    createdTime: 1000, updatedTime: 1000 };
  ingest(state, { timestamp: at, event: 'TASK IN PROGRESS', value: task });
  assert.equal(state.tasks[task.id].status, 'inProgress');
  assert.equal(state.tasks[task.id].delivery, 'pending');
  assert.equal(state.taskOrder.length, 1);
  ingest(state, { timestamp: at, event: 'TASK FINISHED', value: { ...task, status: 'finished', updatedTime: 7000 } });
  assert.equal(state.tasks[task.id].status, 'finished');
  ingest(state, { timestamp: at, event: 'TASK RESULT DELIVERED', value: { id: task.id, messageId: 'msg-1' } });
  assert.equal(state.tasks[task.id].delivery, 'delivered');
  assert.equal(state.taskOrder.length, 1);
  assert.equal(Object.keys(state.instances).length, 0);
});

test('AAUI retains only the 50 most recently observed task cards', () => {
  const state = createState();
  for (let i = 0; i < 65; i++) {
    ingest(state, { timestamp: at, event: 'TASK IN PROGRESS',
      value: { id: 'task-' + i, status: 'inProgress', config: 'demo',
        createdTime: i, updatedTime: i } });
  }
  assert.equal(state.taskOrder.length, 50);
  assert.equal(state.taskOrder[0], 'task-64');
  assert.equal(state.tasks['task-0'], undefined);
  assert.ok(state.tasks['task-15']);
});


test('received lifecycle from AAB appears on AAUI without altering EServer logs', () => {
  const state = createState();
  const task = {
    id: 'task-123-received', status: 'inProgress', config: 'demo',
    createdTime: 1794500000000, updatedTime: 1794500000000
  };
  ingest(state, {
    timestamp: at, event: 'RECEIVE task:lifecycle',
    value: { status: 'received', event: 'task.received', instanceId: 'e-1', task }
  });
  assert.equal(state.tasks[task.id].status, 'received');
  assert.equal(state.tasks[task.id].instanceId, 'e-1');
  assert.equal(state.tasks[task.id].delivery, 'received');
  assert.equal(state.taskOrder.length, 1);
  assert.equal(Object.keys(state.instances).length, 0);
});

test('AAB receipt is distinct from EServer forwarding success/failure', () => {
  const state = createState();
  const task = { id: 'task-receipt', status: 'inProgress', config: 'demo',
    createdTime: 19126349235123, updatedTime: 19126349235123 };
  const event = (status, reason) => ({
    timestamp: at, event: 'RECEIVE task:lifecycle',
    value: { task, status, instanceId: 'e-1', reason }
  });
  ingest(state, event('received'));
  assert.equal(state.tasks[task.id].status, 'received');
  assert.equal(state.tasks[task.id].forwardStatus, 'pending');
  ingest(state, event('forwardFailed', 'EServer is offline'));
  assert.equal(state.tasks[task.id].status, 'received');
  assert.equal(state.tasks[task.id].forwardStatus, 'failed');
  assert.equal(state.tasks[task.id].forwardError, 'EServer is offline');
  ingest(state, event('forwarded'));
  assert.equal(state.tasks[task.id].status, 'received');
  assert.equal(state.tasks[task.id].forwardStatus, 'forwarded');
  assert.equal(state.tasks[task.id].forwardError, null);
});

test('AAUI reconnect rehydrates tasks from AAB file snapshot', () => {
  const state = createState();
  const task = {
    id: 'task-history-1', status: 'inProgress', config: 'curl-task',
    createdTime: 19126349235123, updatedTime: 19126349235223
  };
  ingest(state, { timestamp: at, event: 'RECEIVE task:lifecycle:snapshot',
    value: { timestamp: Date.parse(at), tasks: [{ task, status: 'received', event: 'task.snapshot' }] }
  });
  assert.equal(state.taskOrder.length, 1);
  assert.equal(state.tasks[task.id].status, 'received');
  assert.equal(state.tasks[task.id].snapshot, true);
  assert.equal(state.tasks[task.id].forwardStatus, 'unknown');
  ingest(state, { timestamp: at, event: 'RECEIVE task:lifecycle',
    value: { task, status: 'forwarded', instanceId: 'e-1' }
  });
  assert.equal(state.tasks[task.id].forwardStatus, 'forwarded');
  ingest(state, { timestamp: at, event: 'RECEIVE task:lifecycle:snapshot',
    value: { timestamp: Date.parse(at), tasks: [{ task, status: 'received' }] }
  });
  assert.equal(state.taskOrder.length, 1);
  assert.equal(state.tasks[task.id].forwardStatus, 'forwarded');
});

test('rejects spoofed F03 status sent by EServer or incorrect payload type', () => {
  const state = createState();
  const spoofed = message(STATUS_TYPE, 'e-1', { sequence: 1 });
  spoofed.value.from = 'eserver';
  ingest(state, spoofed);
  ingest(state, message('eserver.scheduled-update', 'e-1', { sequence: 2 }));
  assert.equal(state.totalStatus, 0);
  assert.equal(summary(state).statusCount, 0);
  assert.equal(Object.keys(state.instances).length, 0);
});

test('F03 SServer status remains global when filtering EServer instances', () => {
  const state = createState();
  ingest(state, message(STATUS_TYPE, 'sserver', { sequence: 5 }));
  ingest(state, message(VM_TYPE, 'e-1', vm('only-vm')));
  assert.equal(summary(state, 'e-1').statusCount, 1);
  assert.equal(summary(state, 'e-1').vmCount, 1);
  assert.equal(state.lastStatusSequence, 5);
});
