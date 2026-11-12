import type Database from 'better-sqlite3';

export type Session = { id: number; name: string };
export interface SessionRepository {
  list(): Session[];
  get(id: number): Session | undefined;
  create(name: string): Session;
}
export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: Database.Database) {}
  list(): Session[] { return this.db.prepare('SELECT id, name FROM Session ORDER BY id').all() as Session[]; }
  get(id: number): Session | undefined { return this.db.prepare('SELECT id, name FROM Session WHERE id = ?').get(id) as Session | undefined; }
  create(name: string): Session {
    const result = this.db.prepare('INSERT INTO Session(name) VALUES (?)').run(name);
    return { id: Number(result.lastInsertRowid), name };
  }
}
