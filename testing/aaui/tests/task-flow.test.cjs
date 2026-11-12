const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TASK_STATUS, TASK_REQUEST_TYPE, TASK_RESULT_TYPE, PROCESSING_TIME_MS,
  isTask, createTask, finishTask, createTaskProcessor
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
  assert.equal(PROCESSING_TIME_MS, 5000);
});

test('task processor transitions from inProgress to finished after configured delay', async () => {
  const started = [];
  const finished = [];
  const task = createTask('hello');
  const completed = new Promise(resolve => {
    const processor = createTaskProcessor({
      delayMs: 30,
      onStart: item => started.push(item),
      onFinish: item => { finished.push(item); processor.stop(); resolve(); }
    });
    assert.equal(processor.receive(task), true);
    assert.equal(processor.receive(task), false);
    assert.equal(processor.size, 1);
  });
  assert.equal(started.length, 1);
  assert.equal(started[0].status, 'inProgress');
  assert.equal(finished.length, 0);
  await completed;
  assert.equal(finished.length, 1);
  assert.equal(finished[0].status, 'finished');
  assert.equal(finished[0].id, task.id);
});

test('processor cancellation prevents an unsent task result', async () => {
  let completed = 0;
  const processor = createTaskProcessor({
    delayMs: 20,
    onFinish: () => { completed++; }
  });
  assert.equal(processor.receive(createTask('stop')), true);
  processor.stop();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(completed, 0);
  assert.equal(processor.size, 0);
});

test('invalid task status and non-string config are rejected', () => {
  assert.throws(() => createTask({ bad: 'object' }), /string/);
  assert.equal(isTask({ ...createTask('x'), status: 'unknown' }), false);
});
