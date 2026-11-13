/* AAUI dashboard; no Node integration or external browser dependencies. */
'use strict';
const {
  createState, ingest, ageLabel, streamState, summary, effectivePresence,
  STATUS_TYPE, VM_TYPE
} = window.AAUIState;

const state = createState();
let page = 'overview';
let selectedInstance = 'all';
let searchTerm = '';
let eventFilter = 'all';
const seen = new Set();

const $ = id => document.getElementById(id);
const element = (tag, className = '', content) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (content !== undefined && content !== null) result.textContent = String(content);
  return result;
};
function add(parent, ...children) {
  for (const child of children) {
    if (child !== undefined && child !== null) parent.append(child);
  }
  return parent;
}
function empty(title, description, icon = '◌') {
  const wrapper = element('div', 'empty');
  add(wrapper,
    element('div', 'empty-icon', icon),
    element('strong', '', title),
    element('p', '', description));
  return wrapper;
}
function pill(label, stateName) {
  return element('span', 'pill' + (stateName ? ' ' + stateName : ''), label);
}
function chip(label, variant = '') {
  return element('span', 'chip' + (variant ? ' ' + variant : ''), label);
}
function detail(label, value) {
  const item = element('div');
  add(item, element('span', '', label), element('strong', '', value));
  return item;
}
function currentInstances() {
  return Object.values(state.instances).filter(item => selectedInstance === 'all' || item.id === selectedInstance);
}
function updateSelector() {
  const select = $('instance-filter');
  const previous = selectedInstance;
  select.replaceChildren();
  select.add(new Option('All EServer instances', 'all'));
  for (const instance of Object.values(state.instances).sort((a, b) => a.id.localeCompare(b.id))) {
    select.add(new Option(instance.id, instance.id));
  }
  if (previous !== 'all' && !state.instances[previous]) selectedInstance = 'all';
  select.value = selectedInstance;
}

function streamInfo(kind) {
  const isStatus = kind === 'status';
  if (isStatus) {
    return { times: state.statusHistory, lastAt: state.lastStatusAt || 0, expected: 10000 };
  }
  const items = currentInstances();
  const times = items.flatMap(item => item.vmHistory);
  const lastAt = Math.max(0, ...items.map(item => item.lastVmAt || 0));
  return { times, lastAt, expected: 20000 };
}
function renderStream(kind) {
  const info = streamInfo(kind);
  const instances = currentInstances();
  const allOffline = instances.length > 0 && instances.every(item => effectivePresence(state, item) === 'offline');
  const health = state.connection !== 'connected' ? 'unknown' :
    kind === 'status' ? streamState(info.lastAt, info.expected) :
    allOffline ? 'offline' : streamState(info.lastAt, info.expected);
  const indicator = $(kind + '-stream-pill');
  indicator.className = 'pill' + (health === 'waiting' || health === 'unknown' ? '' : ' ' + health);
  indicator.textContent = health === 'healthy' ? 'Receiving' : health === 'stale' ? 'Stale' : health === 'offline' ? 'Stopped' : health === 'unknown' ? 'Unknown' : 'Waiting';
  $(kind + '-last').textContent = ageLabel(info.lastAt);
  const count = kind === 'status' ? state.totalStatus :
    currentInstances().reduce((sum, instance) => sum + instance.vmCount, 0);
  $(kind + '-stream-count').textContent = count + ' received';

  const chart = $(kind + '-stream-chart');
  chart.replaceChildren();
  const now = Date.now();
  const bins = 20;
  const bucketMs = info.expected;
  const counts = Array.from({ length: bins }, () => 0);
  for (const time of info.times) {
    const offset = Math.floor((now - time) / bucketMs);
    if (offset >= 0 && offset < bins) counts[bins - 1 - offset] += 1;
  }
  const max = Math.max(1, ...counts);
  for (const count of counts) {
    const bar = element('div', 'bar' + (count > 0 ? ' filled ' + kind : ''));
    bar.style.height = count ? (25 + Math.round(count / max * 75)) + '%' : '13%';
    bar.title = count + ' arrivals';
    chart.append(bar);
  }
}

function renderSummary() {
  const stats = summary(state, selectedInstance);
  $('stat-instances').textContent = stats.onlineCount;
  $('stat-presence-note').textContent = stats.instanceCount + ' known · ' + stats.offlineCount + ' offline';
  $('stat-vms').textContent = stats.vmCount;
  $('stat-status').textContent = stats.statusCount;
  $('stat-vm-updates').textContent = stats.vmUpdates;
  $('instance-count').textContent = stats.instanceCount + (stats.instanceCount === 1 ? ' instance' : ' instances');
  renderStream('status');
  renderStream('vm');
  const connected = state.connection === 'connected';
  $('sidebar-dot').className = 'status-dot ' + (connected ? 'connected' : state.connection === 'disconnected' ? 'disconnected' : '');
  $('sidebar-connection').textContent = connected ? 'Connected to AAB' : state.connection === 'disconnected' ? 'Disconnected' : 'Connecting to AAB';
  $('health').title = state.httpHealth ? 'Latest HTTP check: ' + JSON.stringify(state.httpHealth) : 'Check AAB HTTP health';
}

function instanceCard(instance) {
  const card = element('article', 'panel instance-card');
  const head = element('div', 'instance-head');
  const name = element('div', 'instance-name');
  const nameText = element('div');
  add(nameText, element('strong', '', instance.id), element('span', '', 'EServer instance'));
  add(name, element('span', 'server-icon', '▥'), nameText);
  const presence = effectivePresence(state, instance);
  add(head, name, pill(
    presence === 'online' ? 'Online' : presence === 'offline' ? 'Offline' : 'Unknown',
    presence === 'online' ? 'healthy' : presence === 'offline' ? 'offline' : ''
  ));
  const metrics = element('div', 'instance-metrics');
  add(metrics, detail('VM info', instance.vmCount), detail('VMs', instance.vms.length));
  const extra = element('div', 'instance-detail');
  const streamLabel = (lastAt, interval) => presence === 'offline' ? 'Stopped'
    : presence === 'unknown' ? 'Unknown'
    : streamState(lastAt, interval) === 'healthy' ? 'Receiving'
    : streamState(lastAt, interval) === 'stale' ? 'Stale' : 'Waiting';
  add(extra, chip('VM stream · ' + streamLabel(instance.lastVmAt, 20000)));
  extra.append(chip('VM last · ' + ageLabel(instance.lastVmAt)));
  if (instance.disconnectReason && presence === 'offline') extra.append(chip('Disconnect · ' + instance.disconnectReason));
  extra.append(chip('Logs · ' + instance.logs.length));

  return add(card, head, metrics, extra);
}
function renderOverviewInstances() {
  const root = $('instances-overview');
  root.replaceChildren();
  const instances = currentInstances().sort((a, b) => a.id.localeCompare(b.id));
  if (!instances.length) {
    root.append(empty('Waiting for EServer data', 'Connect EServer instances for VM info every 20s. SServer sends status every 10s independently.'));
    return;
  }
  for (const instance of instances) root.append(instanceCard(instance));
}

function vmCard(instance, vm) {
  const card = element('article', 'panel vm-card');
  const head = element('div', 'vm-card-head');
  const identity = element('div');
  add(identity,
    element('div', 'vm-id', vm.id || 'Unnamed VM'),
    element('div', 'vm-sub', 'Browser · ' + (vm.browserId || '—')));
  add(head, identity, chip('v' + (vm.version || '—')));
  const subtitle = element('div', 'instance-detail');
  add(subtitle, chip('EServer · ' + instance.id), chip('Updated ' + ageLabel(instance.lastVmAt)));
  const platforms = element('div', 'vm-platforms');
  for (const platform of vm.supportingPlatforms) {
    const container = element('div', 'platform-card');
    const label = element('div', 'platform-head');
    add(label, element('span', 'platform-name', platform.platform || 'Unknown platform'),
      element('span', 'platform-sub', 'Parser v' + (platform.parserInfo.version || '—')));
    const features = element('div', 'chips');
    for (const feature of platform.supportingFeatures) features.append(chip(feature, 'feature'));
    const types = element('div', 'chips');
    for (const type of platform.parserInfo.type) types.append(chip(type, 'parser'));
    add(container, label, element('div', 'platform-label', 'Supporting features'), features,
      element('div', 'platform-label', 'Parser capabilities'), types);
    platforms.append(container);
  }
  return add(card, head, subtitle, platforms);
}
function renderInventory() {
  const root = $('vm-inventory');
  root.replaceChildren();
  let matched = 0;
  for (const instance of currentInstances().sort((a, b) => a.id.localeCompare(b.id))) {
    for (const vm of instance.vms) {
      const searchable = [instance.id, vm.id, vm.browserId, vm.version,
        ...vm.supportingPlatforms.flatMap(platform => [
          platform.platform, ...platform.supportingFeatures, ...platform.parserInfo.type
        ])].join(' ').toLowerCase();
      if (!searchable.includes(searchTerm)) continue;
      root.append(vmCard(instance, vm));
      matched++;
    }
  }
  if (!matched) root.append(empty(searchTerm ? 'No matching VMs' : 'No VM information yet',
    searchTerm ? 'Try another VM ID, browser ID or capability.' : 'EServer sends a new VM inventory every 20 seconds after connecting.'));
}

function recordCategory(record) {
  if (record.event === 'RECEIVE peer:status' || record.event === 'SNAPSHOT peer:status') return 'presence';
  if (record.event !== 'RECEIVE peer:message') return 'system';
  if (record.value?.payload?.type === STATUS_TYPE) return 'status';
  if (record.value?.payload?.type === VM_TYPE) return 'vm';
  return 'system';
}
function matchesInstance(record) {
  if (selectedInstance === 'all') return true;
  if (record.event === 'RECEIVE peer:status') return record.value?.instanceId === selectedInstance;
  if (record.event === 'RECEIVE peer:status:snapshot') return record.value?.instances?.some(entry => entry.instanceId === selectedInstance) ?? false;
  if (record.event !== 'RECEIVE peer:message') return false;
  if (record.value?.from === 'sserver') return false;
  return (record.value?.sourceInstanceId || record.value?.payload?.data?.instanceId) === selectedInstance;
}
function activityRow(record) {
  const category = recordCategory(record);
  const row = element('details', 'activity-row');
  row.dataset.key = [record.timestamp, record.event, JSON.stringify(record.value)].join('|');
  const heading = element('summary');
  const mark = element('span', 'event-mark ' + (category === 'system' ? '' : category),
    category === 'status' ? '↗' : category === 'vm' ? '▣' : category === 'presence' ? '◉' : '·');
  const info = element('span', 'event-title');
  const type = record.value?.payload?.type;
  const name = category === 'status' ? 'Status update received' :
    category === 'vm' ? 'VM inventory received' :
    category === 'presence' ? 'Connection ' + (record.value?.status || 'changed') : record.event;
  const desc = (record.value?.instanceId || record.value?.sourceInstanceId || record.value?.from || '') +
    (type ? ' · ' + type : '');
  add(info, element('strong', '', name), element('span', '', desc || 'System event'));
  add(heading, mark, info, element('span', 'event-time', new Date(record.timestamp).toLocaleTimeString()));
  add(row, heading, element('pre', 'event-detail', JSON.stringify(record.value, null, 2)));
  return row;
}
function renderActivity() {
  const root = $('activity-list');
  const openRecords = new Set(Array.from(root.querySelectorAll('details[open]'), entry => entry.dataset.key));
  root.replaceChildren();
  const records = state.messages.filter(record =>
    (eventFilter === 'all' || recordCategory(record) === eventFilter) && matchesInstance(record)).slice().reverse();
  if (!records.length) {
    root.append(empty('No events to display', 'Incoming messages and connection events will appear here.'));
    return;
  }
  for (const record of records) {
    const row = activityRow(record);
    row.open = openRecords.has(row.dataset.key);
    root.append(row);
  }
}

function renderInstanceLogs() {
  const root = $('instance-logs');
  const openRecords = new Set(Array.from(root.querySelectorAll('details.activity-row[open]'), row => row.dataset.key));
  root.replaceChildren();
  const instances = currentInstances().sort((a, b) => a.id.localeCompare(b.id));
  if (!instances.length) {
    root.append(empty('No EServer instances yet', 'AAB will send a presence snapshot as soon as AAUI connects.'));
    return;
  }
  for (const instance of instances) {
    const card = element('article', 'panel instance-log-card');
    const head = element('div', 'instance-log-heading');
    const name = element('div');
    add(name, element('strong', '', instance.id),
      element('p', '', instance.logs.length + ' log entries · latest ' + ageLabel(instance.presenceAt)));
    const presence = effectivePresence(state, instance);
    add(head, name, pill(presence === 'online' ? 'Online' : presence === 'offline' ? 'Offline' : 'Unknown',
      presence === 'online' ? 'healthy' : presence === 'offline' ? 'offline' : ''));
    const list = element('div', 'instance-log-list');
    if (!instance.logs.length) {
      list.append(element('p', 'instance-log-empty', 'No events for this instance yet.'));
    } else {
      for (const record of instance.logs.slice().reverse()) {
        const row = activityRow(record);
        row.open = openRecords.has(row.dataset.key);
        list.append(row);
      }
    }
    card.append(head, list);
    root.append(card);
  }
}

function renderTasks() {
  const root = $('task-grid');
  if (!root) return;
  root.replaceChildren();
  const tasks = state.taskOrder.map(id => state.tasks[id]).filter(Boolean);
  const received = tasks.filter(task => task.status === 'received').length;
  $('task-summary').textContent = received + ' received · ' + tasks.length + ' total';
  if (!tasks.length) {
    root.append(empty(state.taskSnapshotError ? 'Task history unavailable' : 'No tasks received yet',
      state.taskSnapshotError ||
      'Trigger POST /demo/tasks on PServer. AAUI will also recover persisted tasks on connect.'));
    return;
  }
  for (const task of tasks) {
    const card = element('article', 'panel task-card');
    const heading = element('div', 'task-head');
    add(heading, element('strong', 'task-id', task.id),
      pill(task.status === 'received' ? 'Received' : task.status || 'Unknown',
        task.status === 'received' ? 'healthy' : ''));
    const meta = element('div', 'task-meta');
    add(meta,
      chip('EServer · ' + (task.instanceId || '—')),
      chip('Created · ' + (task.createdTime ? new Date(task.createdTime).toLocaleString() : '—')),
      chip('Updated · ' + (task.updatedTime ? new Date(task.updatedTime).toLocaleString() : '—')));
    add(card, heading, element('div', 'task-label', 'CONFIG'),
      element('div', 'task-config', task.config || '—'), meta,
      element('div', 'task-delivery', task.status === 'finished'
        ? (task.snapshot
          ? '✓ Finished result persisted at AAB (delivery confirmation not available in snapshot)'
          : '✓ EServer finished; result delivered to PServer')
        : task.forwardStatus === 'unknown'
          ? '✓ Received and persisted by AAB (forwarding history unavailable after reconnect)'
          : task.forwardStatus === 'forwarded'
          ? '✓ AAB saved task; EServer acknowledged delivery'
          : task.forwardStatus === 'failed'
            ? '⚠ AAB saved task; EServer delivery failed: ' + (task.forwardError || 'unknown')
            : '✓ Received and persisted by AAB; forwarding pending'));
    root.append(card);
  }
}

function render() {
  updateSelector();
  renderSummary();
  renderOverviewInstances();
  renderInventory();
  renderTasks();
  renderInstanceLogs();
  renderActivity();
}

function navigate(next) {
  page = next;
  for (const button of document.querySelectorAll('[data-page]')) {
    button.classList.toggle('active', button.dataset.page === page);
  }
  for (const section of document.querySelectorAll('[data-section]')) {
    section.classList.toggle('hidden', section.dataset.section !== page);
  }
  const titles = { overview: ['System Overview', 'SServer status every 10s and EServer VM info every 20s.', 'Overview'],
    inventory: ['VM Inventory', 'Explore VMs and supported platform capabilities.', 'VM Inventory'],
    activity: ['Event Activity', 'Inspect live events and raw payloads for troubleshooting.', 'Event Activity'],
    'instance-logs': ['Instance Logs', 'Independent connection and data logs for every EServer instance.', 'Instance Logs'],
    tasks: ['Task Monitoring', 'Track PServer tasks received by AAB and assigned to EServer.', 'Task Monitoring'] };
  const item = titles[page];
  $('page-title').textContent = item[0];
  $('page-description').textContent = item[1];
  $('breadcrumb-current').textContent = item[2];
}

for (const button of document.querySelectorAll('[data-page]')) {
  button.addEventListener('click', () => navigate(button.dataset.page));
}
$('instance-filter').addEventListener('change', event => {
  selectedInstance = event.target.value;
  render();
});
$('vm-search').addEventListener('input', event => {
  searchTerm = event.target.value.trim().toLowerCase();
  renderInventory();
});
$('event-filter').addEventListener('change', event => {
  eventFilter = event.target.value;
  renderActivity();
});
$('clear-logs').addEventListener('click', () => {
  state.messages.length = 0;
  renderActivity();
});
$('clear-instance-logs').addEventListener('click', () => {
  for (const instance of Object.values(state.instances)) instance.logs.length = 0;
  renderInstanceLogs();
});
$('health').addEventListener('click', () => { void window.aaui.checkHttp(); });
$('refresh-tasks').addEventListener('click', async () => {
  const button = $('refresh-tasks');
  button.disabled = true;
  try {
    const result = await window.aaui.refreshTasks();
    if (!result?.ok) {
      state.taskSnapshotError = result?.error || 'Task refresh request failed';
      renderTasks();
    }
  } catch (error) {
    state.taskSnapshotError = error instanceof Error ? error.message : String(error);
    renderTasks();
  } finally {
    button.disabled = false;
  }
});

function receive(record) {
  if (!record) return;
  const key = [record.timestamp, record.event, JSON.stringify(record.value)].join('|');
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 400) seen.delete(seen.values().next().value);
  ingest(state, record);
  render();
}

// Register before requesting the initial log snapshot to reduce missed events.
window.aaui.onLog(receive);
window.aaui.getLogs().then(records => {
  for (const record of records) receive(record);
}).catch(error => {
  console.error('Cannot load AAUI log history:', error);
});
setInterval(renderSummary, 1000);
render();
