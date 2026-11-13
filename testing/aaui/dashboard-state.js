/* Pure, browser-compatible state helpers for the AAUI integration dashboard. */
(function (root) {
  'use strict';
  const STATUS_TYPE = 'sserver.scheduled-update';
  const VM_TYPE = 'eserver.vm-info';
  const MAX_LOGS = 200;
  const MAX_HISTORY = 32;
  const MAX_INSTANCE_LOGS = 10;
  const MAX_TASKS = 50;

  function createState() {
    return {
      connection: 'connecting',
      instances: Object.create(null),
      messages: [],
      tasks: Object.create(null),
      taskOrder: [],
      taskSnapshotError: null,
      totalStatus: 0,
      lastStatusAt: null,
      latestStatus: null,
      lastStatusSequence: null,
      statusHistory: [],
      totalVmInfo: 0,
      httpHealth: null
    };
  }

  function instanceFor(state, id) {
    if (!state.instances[id]) {
      state.instances[id] = {
        id,
        vmCount: 0,
        lastVmAt: null,
        presence: 'unknown',
        presenceAt: null,
        disconnectReason: null,
        socketId: null,
        logs: [],
        vms: [],
        vmHistory: []
      };
    }
    return state.instances[id];
  }

  function appendInstanceLog(instance, record) {
    instance.logs.push(record);
    if (instance.logs.length > MAX_INSTANCE_LOGS) instance.logs.shift();
  }

  function applyPresence(state, value, record, fromSnapshot = false) {
    if (!value || value.peerId !== 'eserver' || typeof value.instanceId !== 'string' || !value.instanceId) return;
    if (value.status !== 'online' && value.status !== 'offline') return;
    const instance = instanceFor(state, value.instanceId);
    // Do not apply a late disconnect from a socket that has already been replaced.
    if (!fromSnapshot && value.status === 'offline' && instance.socketId &&
        value.socketId && instance.socketId !== value.socketId) return;
    const changed = instance.presence !== value.status || instance.socketId !== (value.socketId || null);
    instance.presence = value.status;
    instance.presenceAt = value.timestamp || Date.parse(record.timestamp) || Date.now();
    instance.disconnectReason = value.status === 'offline' ? (value.reason || null) : null;
    instance.socketId = value.status === 'online' ? value.socketId || null : null;
    if (changed) appendInstanceLog(instance, record);
  }

  function applySnapshot(state, value, record) {
    if (!value || value.peerId !== 'eserver' || !Array.isArray(value.instances)) return;
    const onlineIds = new Set();
    for (const entry of value.instances) {
      if (!entry || entry.status !== 'online' || typeof entry.instanceId !== 'string') continue;
      onlineIds.add(entry.instanceId);
      applyPresence(state, { ...entry, peerId: 'eserver' },
        { ...record, event: 'SNAPSHOT peer:status', value: entry }, true);
    }
    for (const instance of Object.values(state.instances)) {
      if (onlineIds.has(instance.id)) continue;
      if (instance.presence !== 'offline') {
        applyPresence(state, {
          peerId: 'eserver', instanceId: instance.id, status: 'offline',
          reason: 'not in current AAB snapshot', timestamp: value.timestamp
        }, { ...record, event: 'SNAPSHOT peer:status', value: {
          peerId: 'eserver', instanceId: instance.id, status: 'offline',
          reason: 'not in current AAB snapshot'
        } }, true);
      }
    }
  }

  function effectivePresence(state, instance) {
    return state.connection !== 'connected' ? 'unknown' : instance.presence;
  }

  function normalizeVmList(value) {
    if (!Array.isArray(value)) return null;
    return value.filter(vm => vm && typeof vm === 'object' && !Array.isArray(vm)).map(vm => ({
      id: typeof vm.id === 'string' ? vm.id : '',
      browserId: typeof vm.browserId === 'string' ? vm.browserId : '',
      version: typeof vm.version === 'string' ? vm.version : '',
      supportingPlatforms: Array.isArray(vm.supportingPlatforms)
        ? vm.supportingPlatforms.filter(p => p && typeof p === 'object').map(p => ({
          platform: typeof p.platform === 'string' ? p.platform : '',
          supportingFeatures: Array.isArray(p.supportingFeatures) ? p.supportingFeatures.filter(s => typeof s === 'string') : [],
          parserInfo: {
            version: typeof p.parserInfo?.version === 'string' ? p.parserInfo.version : '',
            type: Array.isArray(p.parserInfo?.type) ? p.parserInfo.type.filter(s => typeof s === 'string') : []
          }
        })) : []
    }));
  }

  function ingest(state, record) {
    if (!record || typeof record !== 'object') return null;
    const now = Date.parse(record.timestamp) || Date.now();
    const event = record.event || '';
    state.messages.push(record);
    if (state.messages.length > MAX_LOGS) state.messages.shift();

    if (event === 'Socket CONNECT AAB') state.connection = 'connected';
    if (event === 'Socket DISCONNECT' || event === 'Socket CONNECT ERROR') state.connection = 'disconnected';
    if (event === 'HTTP AAB /health') state.httpHealth = record.value;
    if (event === 'RECEIVE task:lifecycle:snapshot') {
      const snapshot = record.value;
      if (snapshot && Array.isArray(snapshot.tasks)) {
        state.taskSnapshotError = snapshot.error || null;
        for (const entry of snapshot.tasks) {
          const task = entry?.task;
          if (!task || typeof task.id !== 'string') continue;
          const existing = state.tasks[task.id];
          // Live task updates may arrive while AAB is reading disk. Never regress.
          if (existing) {
            if (entry.status === 'finished' && existing.status !== 'finished') {
              state.tasks[task.id] = {
                ...existing, ...task, status: 'finished',
                snapshot: true
              };
            }
            continue;
          }
          state.taskOrder.push(task.id);
          state.tasks[task.id] = {
            ...task,
            status: entry.status === 'finished' ? 'finished' : 'received',
            instanceId: entry.instanceId || null,
            forwardStatus: 'unknown',
            delivery: 'received',
            snapshot: true,
            receivedAt: now
          };
        }
        if (state.taskOrder.length > MAX_TASKS) {
          const expired = state.taskOrder.splice(MAX_TASKS);
          for (const id of expired) delete state.tasks[id];
        }
      }
    }

    if (event === 'RECEIVE task:lifecycle' || event === 'TASK IN PROGRESS' || event === 'TASK FINISHED' ||
        event === 'TASK RESULT DELIVERED' || event === 'TASK RESULT ERROR') {
      const task = event === 'RECEIVE task:lifecycle' ? record.value?.task : record.value;
      if (task && typeof task.id === 'string') {
        if (!state.tasks[task.id]) {
          state.taskOrder.unshift(task.id);
          if (state.taskOrder.length > MAX_TASKS) {
            const oldest = state.taskOrder.pop();
            delete state.tasks[oldest];
          }
        }
        const previous = state.tasks[task.id] || {};
        state.tasks[task.id] = {
          ...previous, ...(event === 'TASK IN PROGRESS' || event === 'TASK FINISHED' ? task : {}),
          ...(event === 'RECEIVE task:lifecycle' ? {
            ...task,
            // Business lifecycle remains "received" while forwarding is pending/failed.
            status: record.value.status === 'forwarded' || record.value.status === 'forwardFailed'
              ? (previous.status || 'received') : record.value.status,
            instanceId: record.value.instanceId,
            forwardStatus: record.value.status === 'forwarded' ? 'forwarded' :
              record.value.status === 'forwardFailed' ? 'failed' : previous.forwardStatus || 'pending',
            forwardError: record.value.status === 'forwardFailed' ? record.value.reason : null
          } : {}),
          id: task.id,
          delivery: event === 'RECEIVE task:lifecycle' ? 'received' :
            event === 'TASK RESULT DELIVERED' ? 'delivered' :
            event === 'TASK RESULT ERROR' ? 'failed' : (previous.delivery || 'pending'),
          error: event === 'TASK RESULT ERROR' ? task.error : previous.error || null,
          receivedAt: previous.receivedAt || now
        };
      }
    }
    if (event === 'RECEIVE peer:status') applyPresence(state, record.value, record);
    if (event === 'RECEIVE peer:status:snapshot') applySnapshot(state, record.value, record);

    if (event !== 'RECEIVE peer:message') return null;
    const message = record.value;
    if (!message || typeof message !== 'object') return null;
    const type = message.payload?.type;
    const data = message.payload?.data;

    // F03 is a single SServer stream, not an EServer instance stream.
    if (message.from === 'sserver' && type === STATUS_TYPE &&
        data && typeof data === 'object' && !Array.isArray(data)) {
      state.totalStatus += 1;
      state.lastStatusAt = now;
      state.latestStatus = data;
      state.lastStatusSequence = Number.isFinite(data.sequence) ? data.sequence : null;
      state.statusHistory.push(now);
      if (state.statusHistory.length > MAX_HISTORY) state.statusHistory.shift();
      return { type: 'status', source: 'sserver' };
    }

    // F04 remains EServer-only. SServer messages never create EServer cards.
    if (message.from !== 'eserver' || type !== VM_TYPE) return null;
    const id = typeof message.sourceInstanceId === 'string' && message.sourceInstanceId
      ? message.sourceInstanceId
      : (typeof data?.instanceId === 'string' && data.instanceId ? data.instanceId : 'unknown-instance');
    const instance = instanceFor(state, id);
    appendInstanceLog(instance, record);
    if (type === VM_TYPE) {
      const vms = normalizeVmList(data);
      if (!vms) return null;
      state.totalVmInfo += 1;
      instance.vmCount += 1;
      instance.lastVmAt = now;
      instance.vms = vms;
      instance.vmHistory.push(now);
      if (instance.vmHistory.length > MAX_HISTORY) instance.vmHistory.shift();
      return { type: 'vm', instanceId: id };
    }
    return null;
  }

  function ageLabel(timestamp, now = Date.now()) {
    if (!timestamp) return 'No data';
    const diff = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (diff < 2) return 'Just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    return Math.floor(diff / 3600) + 'h ago';
  }

  function streamState(lastAt, expectedMs, now = Date.now()) {
    if (!lastAt) return 'waiting';
    return now - lastAt <= expectedMs * 2.5 ? 'healthy' : 'stale';
  }

  function summary(state, selected = 'all', now = Date.now()) {
    const list = Object.values(state.instances).filter(item => selected === 'all' || item.id === selected);
    return {
      instanceCount: list.length,
      onlineCount: list.filter(item => effectivePresence(state, item) === 'online').length,
      offlineCount: list.filter(item => effectivePresence(state, item) === 'offline').length,
      vmCount: list.reduce((sum, item) => sum + item.vms.length, 0),
      statusCount: state.totalStatus,
      vmUpdates: list.reduce((sum, item) => sum + item.vmCount, 0),
      activeCount: streamState(state.lastStatusAt, 10000, now) === 'healthy' ? 1 : 0,
      lastStatusAt: state.lastStatusAt || 0,
      lastVmAt: Math.max(0, ...list.map(item => item.lastVmAt || 0))
    };
  }

  const api = { STATUS_TYPE, VM_TYPE, createState, ingest, normalizeVmList, ageLabel, streamState, summary, effectivePresence };
  root.AAUIState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
