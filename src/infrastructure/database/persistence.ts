import type Database from 'better-sqlite3';
import { openDatabase } from './sqlite.js';

/** Owns the technical database handle and its resource lifecycle. */
export function openPersistence(dbPath: string, enabled: boolean): { database: Database.Database | undefined; close: () => void } {
  const database = enabled ? openDatabase(dbPath) : undefined;
  let closed = false;
  return {
    database,
    close: () => {
      if (closed) return;
      closed = true;
      database?.close();
    }
  };
}
