import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApplication } from '../src/app/create-app.js';
import { openDatabase } from '../src/infrastructure/database/sqlite.js';
import type { NewProcessUsage, ProcessUsage, ProcessUsageRepository } from '../src/modules/process-usage/contracts.js';
import { SqliteProcessUsageRepository } from '../src/modules/process-usage/process-usage.js';
import * as legacyUsageModule from '../src/modules/process-usage/process-usage.js';

test('neutral process-usage contract accepts a synchronous fake and legacy exports preserve adapter identity', () => {
  const rows: ProcessUsage[] = [];
  const repository: ProcessUsageRepository = {
    list(pid) { return pid === undefined ? rows : rows.filter(row => row.pid === pid); },
    create(value) {
      const row = { id: rows.length + 1, ...value };
      rows.push(row);
      return row;
    }
  };
  const input: NewProcessUsage = { pid: 9, cpu: 0.5, memory: 0 };
  assert.deepEqual(repository.create(input), { id: 1, ...input });
  assert.deepEqual(repository.list(9), [{ id: 1, ...input }]);
  assert.equal(legacyUsageModule.SqliteProcessUsageRepository, SqliteProcessUsageRepository);
  const oldTypePath: legacyUsageModule.ProcessUsageRepository = repository;
  assert.equal(oldTypePath.list().length, 1);
});

test('SQLite repository preserves empty lists, generated IDs, descending order, repeated PID filtering and raw values', () => {
  const database = openDatabase(':memory:');
  try {
    const repository = new SqliteProcessUsageRepository(database);
    assert.deepEqual(repository.list(), []);

    const extraInput = { pid: 0, cpu: 0, memory: 0, extra: 'returned at runtime' };
    const first = repository.create(extraInput);
    const second = repository.create({ pid: 9, cpu: 4.25, memory: 0 });
    const third = repository.create({ pid: 9, cpu: 0, memory: 12 });
    const rawDirectInput = { pid: -3, cpu: 0.75, memory: 1.5 };
    const fourth = repository.create(rawDirectInput);
    assert.deepEqual(first, { id: 1, ...extraInput });
    assert.deepEqual(second, { id: 2, pid: 9, cpu: 4.25, memory: 0 });
    assert.deepEqual(third, { id: 3, pid: 9, cpu: 0, memory: 12 });
    assert.deepEqual(fourth, { id: 4, ...rawDirectInput });
    assert.deepEqual(repository.list(), [fourth, third, second, { id: 1, pid: 0, cpu: 0, memory: 0 }]);
    assert.deepEqual(repository.list(9), [third, second]);
    assert.deepEqual(repository.list(0), [{ id: 1, pid: 0, cpu: 0, memory: 0 }]);
    assert.deepEqual(repository.list(-3), [fourth]);
    assert.deepEqual(repository.list(12345), []);
  } finally {
    database.close();
  }
});

test('SQLite repository preserves existing CPU and memory constraints', () => {
  const database = openDatabase(':memory:');
  try {
    const repository = new SqliteProcessUsageRepository(database);
    assert.throws(() => repository.create({ pid: 1, cpu: -0.1, memory: 1 }));
    assert.throws(() => repository.create({ pid: 1, cpu: 0, memory: -1 }));
    assert.deepEqual(repository.list(), []);
  } finally {
    database.close();
  }
});

test('process-usage rows persist after the SQLite database is closed and reopened', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aab-process-usage-'));
  const path = join(directory, 'usage.sqlite');
  try {
    const firstDatabase = openDatabase(path);
    const saved = new SqliteProcessUsageRepository(firstDatabase).create({ pid: 52, cpu: 0.25, memory: 0 });
    firstDatabase.close();

    const reopenedDatabase = openDatabase(path);
    try {
      assert.deepEqual(new SqliteProcessUsageRepository(reopenedDatabase).list(52), [saved]);
    } finally {
      reopenedDatabase.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('application instances isolate process-usage state and omit the repository when SQLite is disabled', async () => {
  const first = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
  const second = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
  const disabled = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
  try {
    const row = first.usage.create({ pid: 20, cpu: 0, memory: 0 });
    assert.deepEqual(first.usage.list(), [row]);
    assert.deepEqual(second.usage.list(), []);
    assert.equal(disabled.usage, undefined);
  } finally {
    await Promise.all([first.close(), second.close(), disabled.close()]);
  }
});
