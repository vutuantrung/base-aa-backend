import type Database from 'better-sqlite3';
import type {
  AaCatalogRepository, AaConnection, BrowserDetails,
  BrowserResult, ExtensionActivity, ExtensionDetails, ExtensionTask
} from './contracts.js';

/**
 * Each entity uses its own storage table; JSON payload preserves the file's nested API DTO.
 * Upsert methods are internal integration points for future socket ingestion use cases.
 */
export class SqliteAaCatalogRepository implements AaCatalogRepository {
  constructor(private readonly db: Database.Database) {}

  private read<T>(table: 'AaConnection' | 'AaBrowser' | 'AaExtension', id: string): T | undefined {
    const row = this.db.prepare(`SELECT payload FROM ${table} WHERE id = ?`).get(id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as T : undefined;
  }
  private list<T>(table: 'AaBrowser' | 'AaActivity' | 'AaTask', extensionId?: string): T[] {
    const sql = extensionId === undefined
      ? `SELECT payload FROM ${table} ORDER BY id`
      : `SELECT payload FROM ${table} WHERE extension_id = ? ORDER BY id`;
    const rows = this.db.prepare(sql).all(...(extensionId === undefined ? [] : [extensionId])) as Array<{ payload: string }>;
    return rows.map(row => JSON.parse(row.payload) as T);
  }
  private save(table: 'AaConnection' | 'AaBrowser' | 'AaExtension' | 'AaActivity' | 'AaTask',
               id: string, data: unknown, extensionId?: string): void {
    if (!id.trim()) throw new Error('ID must not be empty');
    if (table === 'AaActivity' || table === 'AaTask') {
      if (!extensionId?.trim()) throw new Error('Extension ID must not be empty');
      this.db.prepare(`INSERT INTO ${table}(id, extension_id, payload) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET extension_id = excluded.extension_id, payload = excluded.payload`)
        .run(id, extensionId, JSON.stringify(data));
    } else {
      this.db.prepare(`INSERT INTO ${table}(id, payload) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`).run(id, JSON.stringify(data));
    }
  }

  /** Most recent connection by connectedTime, since GET /api/aa has no ID parameter. */
  currentAa(): AaConnection | undefined {
    const rows = this.db.prepare('SELECT payload FROM AaConnection').all() as Array<{payload: string}>;
    return rows.map(row => JSON.parse(row.payload) as AaConnection)
      .sort((a,b) => b.connectedTime - a.connectedTime || a.id.localeCompare(b.id))[0];
  }
  allBrowsers(): BrowserResult[] { return this.list<BrowserDetails>('AaBrowser').map(browser => ({ browser })); }
  browserById(id: string): BrowserResult | undefined {
    const browser = this.read<BrowserDetails>('AaBrowser', id);
    return browser ? { browser } : undefined;
  }
  extensionById(id: string): ExtensionDetails | undefined { return this.read<ExtensionDetails>('AaExtension', id); }
  activitiesByExtension(id: string): ExtensionActivity[] { return this.list<ExtensionActivity>('AaActivity', id); }
  tasksByExtension(id: string): ExtensionTask[] { return this.list<ExtensionTask>('AaTask', id); }

  upsertAa(value: AaConnection): void { this.save('AaConnection', value.id, value); }
  upsertBrowser(value: BrowserDetails): void { this.save('AaBrowser', value.id, value); }
  upsertExtension(value: ExtensionDetails): void { this.save('AaExtension', value.id, value); }
  upsertActivity(extensionId: string, value: ExtensionActivity): void {
    this.save('AaActivity', value.id, value, extensionId);
  }
  upsertTask(extensionId: string, value: ExtensionTask): void {
    this.save('AaTask', value.id, value, extensionId);
  }
}
