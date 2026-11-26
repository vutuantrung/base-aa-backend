import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createApplication } from '../src/app/create-app.js';
import { openDatabase } from '../src/infrastructure/database/sqlite.js';
import type { Session, SessionRepository } from '../src/modules/session/contracts.js';
import { SqliteSessionRepository } from '../src/modules/session/session.js';
import * as legacySessionModule from '../src/modules/session/session.js';

test('neutral session repository contract accepts a fake implementation', () => {
  let saved: Session = { id: 4, name: 'fake' };
  const repository: SessionRepository = {
    list: () => [saved],
    get: id => id === saved.id ? saved : undefined,
    create: name => { saved = { id: saved.id + 1, name }; return saved; }
  };

  assert.deepEqual(repository.list(), [{ id: 4, name: 'fake' }]);
  assert.deepEqual(repository.get(4), { id: 4, name: 'fake' });
  assert.deepEqual(repository.create('created'), { id: 5, name: 'created' });
  assert.equal(repository.get(4), undefined);
});

test('legacy session module re-exports the canonical type contract and adapter identity', () => {
  assert.equal(legacySessionModule.SqliteSessionRepository, SqliteSessionRepository);
  const database = openDatabase(':memory:');
  try {
    const repository: legacySessionModule.SessionRepository = new legacySessionModule.SqliteSessionRepository(database);
    assert.deepEqual(repository.list(), []);
  } finally {
    database.close();
  }
});

test('SQLite session repository lists, gets and creates parameterized raw names with generated IDs', () => {
  const database = openDatabase(':memory:');
  try {
    const repository = new SqliteSessionRepository(database);
    assert.deepEqual(repository.list(), []);
    assert.equal(repository.get(1), undefined);

    const quotedName = " name ' OR 1=1 -- ";
    const first = repository.create(quotedName);
    const second = repository.create(quotedName);
    const third = repository.create('another');
    assert.deepEqual(first, { id: 1, name: quotedName });
    assert.deepEqual(second, { id: 2, name: quotedName });
    assert.deepEqual(third, { id: 3, name: 'another' });
    assert.deepEqual(repository.get(2), second);
    assert.equal(repository.get(999), undefined);
    assert.deepEqual(repository.list(), [first, second, third]);
  } finally {
    database.close();
  }
});

test('SQLite sessions remain available after database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'as-session-repository-'));
  const path = join(directory, 'sessions.sqlite');
  try {
    const firstDatabase = openDatabase(path);
    const created = new SqliteSessionRepository(firstDatabase).create('persisted');
    firstDatabase.close();

    const reopenedDatabase = openDatabase(path);
    try {
      const repository = new SqliteSessionRepository(reopenedDatabase);
      assert.deepEqual(repository.get(created.id), created);
      assert.deepEqual(repository.list(), [created]);
    } finally {
      reopenedDatabase.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('application instances own isolated session repositories and SQLite-disabled sessions stay absent', async () => {
  const first = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
  const second = createApplication({ dbPath: ':memory:', corsOrigin: '*' });
  const disabled = createApplication({ dbPath: ':memory:', corsOrigin: '*', enableSqlite: false });
  try {
    const firstSession = first.sessions.create('first');
    assert.deepEqual(first.sessions.list(), [firstSession]);
    assert.deepEqual(second.sessions.list(), []);
    assert.equal(disabled.sessions, undefined);
  } finally {
    await Promise.all([first.close(), second.close(), disabled.close()]);
  }
});
