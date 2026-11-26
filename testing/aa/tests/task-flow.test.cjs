const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TASK_STATUS, TASK_REQUEST_TYPE, TASK_RESULT_TYPE,
  isTask, createTask, finishTask
} = require('../../shared/task-flow.cjs');

test('task mock follows required format and allowed statuses', () => {
  const task = createTask('{"mode":"demo"}');
  assert.deepEqual(Object.keys(task).sort(), ['id', 'status', 'config', 'createdTime', 'updatedTime'].sort());
  assert.match(task.id, /^task-[0-9a-f-]{36}$/);
  assert.equal(task.status, TASK_STATUS.inProgress);
  assert.equal(task.config, '{"mode":"demo"}');
  assert.equal(isTask(task, 'inProgress'), true);
  const done = finishTask(task);
  assert.equal(done.status, TASK_STATUS.finished);
  assert.equal(done.id, task.id);
  assert.equal(done.config, task.config);
  assert.equal(done.createdTime, task.createdTime);
  assert.ok(done.updatedTime > task.updatedTime);
  assert.equal(isTask(done, 'finished'), true);
  assert.equal(TASK_REQUEST_TYPE, 'demo.task.request');
  assert.equal(TASK_RESULT_TYPE, 'demo.task.result');
});

test('task remains inProgress until an explicit completion is applied', () => {
  const task = createTask('hello');
  assert.equal(task.status, 'inProgress');
  // Receipt never changes the business task status.
  const receivedAck = { ok: true, status: 'received' };
  assert.equal(receivedAck.status, 'received');
  assert.equal(task.status, 'inProgress');
  const completed = finishTask(task);
  assert.equal(completed.status, 'finished');
  assert.equal(task.status, 'inProgress');
  assert.equal(completed.id, task.id);
});

test('invalid task status and non-string config are rejected', () => {
  assert.throws(() => createTask({ bad: 'object' }), /string/);
  assert.equal(isTask({ ...createTask('x'), status: 'unknown' }), false);
});
