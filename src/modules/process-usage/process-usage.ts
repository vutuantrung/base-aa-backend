import type Database from 'better-sqlite3';
import type { NewProcessUsage, ProcessUsage, ProcessUsageRepository } from './contracts.js';

export type { NewProcessUsage, ProcessUsage, ProcessUsageRepository } from './contracts.js';

export class SqliteProcessUsageRepository implements ProcessUsageRepository {
  constructor(private readonly db: Database.Database) {}
  list(pid?: number): ProcessUsage[] {
    const query = pid === undefined
      ? this.db.prepare('SELECT id, pid, cpu, memory FROM ProcessUsage ORDER BY id DESC')
      : this.db.prepare('SELECT id, pid, cpu, memory FROM ProcessUsage WHERE pid = ? ORDER BY id DESC');
    return query.all(...(pid === undefined ? [] : [pid])) as ProcessUsage[];
  }
  create(value: NewProcessUsage): ProcessUsage {
    const result = this.db.prepare('INSERT INTO ProcessUsage(pid, cpu, memory) VALUES (?, ?, ?)').run(value.pid, value.cpu, value.memory);
    return { id: Number(result.lastInsertRowid), ...value };
  }
}
