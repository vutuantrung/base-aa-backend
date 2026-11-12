import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(dbPath: string): Database.Database {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS Session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ProcessUsage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid INTEGER NOT NULL,
      cpu REAL NOT NULL CHECK(cpu >= 0),
      memory INTEGER NOT NULL CHECK(memory >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_process_usage_pid ON ProcessUsage(pid);
    CREATE TABLE IF NOT EXISTS AaConnection (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS AaBrowser (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS AaExtension (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS AaActivity (id TEXT PRIMARY KEY, extension_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS AaTask (id TEXT PRIMARY KEY, extension_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_aa_activity_extension ON AaActivity(extension_id);
    CREATE INDEX IF NOT EXISTS idx_aa_task_extension ON AaTask(extension_id);
  `);
  return db;
}
