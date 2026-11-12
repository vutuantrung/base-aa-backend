const { randomUUID } = require('node:crypto');

const TASK_REQUEST_TYPE = 'demo.task.request';
const TASK_RESULT_TYPE = 'demo.task.result';
const PROCESSING_TIME_MS = 5_000;
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

/** Shared mock task lifecycle; scheduling and delivery are handled by the caller. */
function createTaskProcessor({ delayMs = PROCESSING_TIME_MS, onStart, onFinish, onError = console.error }) {
  const pending = new Map();
  let closed = false;

  function receive(task) {
    if (closed || !isTask(task, TASK_STATUS.inProgress) || pending.has(task.id)) return false;
    const timer = setTimeout(() => {
      pending.delete(task.id);
      if (closed) return;
      const finished = finishTask(task);
      try {
        Promise.resolve(onFinish(finished)).catch(onError);
      } catch (error) {
        onError(error);
      }
    }, delayMs);
    pending.set(task.id, timer);
    onStart?.(task);
    return true;
  }

  return {
    receive,
    stop() {
      closed = true;
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    },
    get size() { return pending.size; }
  };
}

module.exports = {
  TASK_REQUEST_TYPE,
  TASK_RESULT_TYPE,
  PROCESSING_TIME_MS,
  MAX_TASKS,
  TASK_STATUS,
  isTask,
  createTask,
  finishTask,
  createTaskProcessor
};
