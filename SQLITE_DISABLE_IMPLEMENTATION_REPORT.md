# SQLite Disable Implementation Report

## Changes

- Added `ENABLE_SQLITE` handling to standalone startup. SQLite is disabled unless the value is exactly `1`.
- Kept `createApplication()` SQLite-enabled by default for existing programmatic callers and SQLite tests. Callers can pass `enableSqlite: false` to disable it.
- Made `better-sqlite3` load only when `openDatabase()` is called. An unavailable dependency now produces a clear startup error when SQLite is explicitly enabled.
- Skipped database opening, repositories, schemas, and close calls when SQLite is disabled.
- Added authenticated HTTP 503 responses with `{ "error": "SQLITE_DISABLED" }` for session, process usage, and AA catalog APIs.
- Moved `better-sqlite3` to `optionalDependencies` while retaining its development types.
- Updated `scripts/package-for-arm.sh` to remove the optional SQLite dependency from the AAB deployment manifest and regenerate its matching lockfile.

Changed implementation files: `package.json`, `package-lock.json`, `scripts/package-for-arm.sh`, `src/app/create-app.ts`, `src/infrastructure/database/sqlite.ts`, `src/infrastructure/http/http-server.ts`, and `src/main.ts`.

## Configuration

- Standalone AAB: `ENABLE_SQLITE=0` or unset disables SQLite; `ENABLE_SQLITE=1` enables it.
- Programmatic composition: `createApplication({ ..., enableSqlite: false })` disables it. Omitting `enableSqlite` preserves the previous SQLite-enabled behavior.
- With SQLite enabled, install the optional `better-sqlite3` package for the target runtime.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: did not complete successfully. SQLite test workers terminated with Node 24 native `InternalCallbackScope::Close()` assertions; the same failure reproduced with test concurrency set to one.
- `npm --prefix testing run test:playground`: 4 tests passed; `aaui/tests/dashboard-state.test.cjs` failed.
- Isolated disabled install: `npm ci --omit=optional` succeeded and `better-sqlite3` was absent. Built AAB started with `ENABLE_SQLITE=0`; `/health` returned 200; `/api/sessions`, `/api/process-usage`, `/api/aa`, and `/api/browser/all` returned 503 with `SQLITE_DISABLED`; no database file was created.
- In the isolated install, `ENABLE_SQLITE=1` failed at startup with the intended `better-sqlite3 is unavailable` error.
- ARM package simulation: removing the optional dependency and regenerating the lockfile succeeded; `npm ci` succeeded with no `better-sqlite3` installed.
- SQLite storage smoke check with the installed native dependency opened an in-memory database, found the initialized schema, and closed it successfully. Full SQLite test-suite confirmation remains limited by the Node native test-worker assertion above.

## Packaging compatibility and limitations

The ARM AAB package excludes the native SQLite dependency and has a lockfile generated from the matching package manifest for `npm ci`. The general repository manifest retains SQLite as an optional dependency so non-ARM users can explicitly enable it.

The requested full backend suite and playground suite have the failures listed above. The playground suite does not verify backend generic or peer messaging or PServer registration; those behaviors were not changed by this implementation, but a passing end-to-end confirmation was not obtained in this run.
