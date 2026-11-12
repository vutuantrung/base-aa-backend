const { randomUUID } = require('node:crypto');

const TASK_REQUEST_TYPE = 'demo.task.request';
const TASK_RESULT_TYPE = 'demo.task.result';
const MAX_TASKS = 100;
const TASK_STATUS = Object.freeze({ inProgress: 'inProgress', finished: 'finished' });

function isTask(value, status) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    typeof value.id === 'string' && /^task-[a-zA-Z0-9-]{1,100}$/.test(value.id) &&
    (status ? value.status === status : Object.values(TASK_STATUS).includes(value.status)) &&
    typeof value.config === 'string' &&
    Number.isSafeInteger(value.createdTime) && Number.isSafeInteger(value.updatedTime) &&
    value.updatedTime >= value.createdTime;
}

function createTask(config = '') {
  if (typeof config !== 'string') throw new TypeError('config must be a string');
  const createdTime = Date.now() - Math.floor(Math.random() * 1000);
  return {
    id: 'task-' + randomUUID(),
    status: TASK_STATUS.inProgress,
    config,
    createdTime,
    updatedTime: createdTime
  };
}

function finishTask(task) {
  if (!isTask(task, TASK_STATUS.inProgress)) throw new TypeError('Invalid inProgress task');
  return { ...task, status: TASK_STATUS.finished, updatedTime: Math.max(Date.now(), task.updatedTime + 1) };
}

module.exports = {
  TASK_REQUEST_TYPE,
  TASK_RESULT_TYPE,
  MAX_TASKS,
  TASK_STATUS,
  isTask,
  createTask,
  finishTask
};
