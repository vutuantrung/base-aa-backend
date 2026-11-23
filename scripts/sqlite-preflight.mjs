import { createRequire } from 'node:module';

console.log(`SQLite profile preflight: Node ${process.version}, ABI ${process.versions.modules ?? 'unknown'}`);
try {
  const require = createRequire(import.meta.url);
  const Database = require('better-sqlite3');
  const database = new Database(':memory:');
  try {
    const result = database.prepare('select 1 as ready').get();
    if (result?.ready !== 1) throw new Error('in-memory query returned an unexpected result');
  } finally {
    database.close();
  }
  console.log('better-sqlite3 loaded; in-memory open/query/close passed');
} catch (error) {
  console.error(`SQLite profile preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
