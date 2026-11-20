# R6.4.D — Process Usage Boundary Report

**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Implementation baseline:** `0d4369c286ced60d920b45d69cbaef5f01d8b376`  
**Verification runtime:** Node.js `v22.23.5`

## 1. Verified Baseline and Summary

- Verified branch `main` at the required implementation HEAD. The only initial worktree item was the untracked `prompts/R6_4_D_PROCESS_USAGE_CODEX_PROMPT.md`; it was preserved.
- The requested baseline matched. Read `AGENTS.md`, available R6 reports (including R6.4.C), `README.md`, `docs/HTTP_API_DESIGN.md`, and the relevant source and tests. R0–R5 architecture decision records were not present; no missing decisions were inferred.
- M15 now owns the transport- and storage-neutral `ProcessUsage`, `NewProcessUsage`, and synchronous `ProcessUsageRepository` definitions in `src/modules/process-usage/contracts.ts`.
- M07 imports that port directly for HTTP capabilities. M17 still owns database schema/open/close and lazy optional-driver loading. M02 still creates the repository and exposes the same public app handle. The SQLite adapter remains at its existing source and public import path.
- Process Usage remains unclassified as APP versus DEMO. M14 Session, M16 AA Catalog, M17, and unrelated modules were not changed. No ARM work was done.

## 2. Responsibility Inventory Before and After

| Responsibility | Before | After |
|---|---|---|
| `ProcessUsage`, `NewProcessUsage`, and synchronous repository contract | Defined beside SQLite code in `modules/process-usage/process-usage.ts` | Defined in neutral M15 `modules/process-usage/contracts.ts`, re-exported from the prior module path |
| SQLite query/insert and row mapping | `SqliteProcessUsageRepository` in `process-usage.ts` | Same class/file/constructor/methods and SQL; implements M15 contract |
| HTTP query parsing, body validation and status/response mapping | M07 `http-api-router.ts` | Unchanged; imports only the neutral M15 port type |
| HTTP auth and SQLite-disabled gate | M07 `http-middleware.ts` | Unchanged |
| Database schema, index, WAL, foreign keys, optional driver open/close | M17 `infrastructure/database/{sqlite,persistence}.ts` | Unchanged |
| Concrete repository creation and app handles | M02 `app/create-app.ts` | Unchanged; one adapter receives the existing optional M17 database handle |

### Source structure

```text
src/
├── modules/process-usage/
│   ├── contracts.ts          # M15 data types and consumer-facing port
│   └── process-usage.ts      # SQLite repository adapter + compatibility exports
├── infrastructure/
│   ├── database/
│   │   ├── sqlite.ts         # M17 schema, index, pragmas and lazy native load
│   │   └── persistence.ts    # M17 optional database lifecycle
│   └── http/
│       ├── http-api-router.ts # M07 parsing, validation and response mapping
│       ├── http-server.ts     # M07 HTTP application composition
│       └── http-middleware.ts # M07 authentication and SQLite feature gate
└── app/create-app.ts        # M02 runtime composition and public app handles
```

## 3. Consumers, Public Contracts and Compatibility

Source audit found the concrete adapter created only by `src/app/create-app.ts`. That composition passes it to `createHttpApp` and exposes it through `ApplicationInstance.usage`. `http-server.ts` and `http-api-router.ts` consume `ProcessUsageRepository` structurally. `tests/integration.test.ts` exercises process-usage creation and filtered listing through the composed application. The README documents the module and API; `docs/HTTP_API_DESIGN.md` explicitly records the existing ProcessUsage schema as unchanged. No example, playground, or other application consumer of the repository was found.

The M15 contract preserves these exact public shapes and synchronous signatures:

```ts
type ProcessUsage = { id: number; pid: number; cpu: number; memory: number };
type NewProcessUsage = Omit<ProcessUsage, 'id'>;
interface ProcessUsageRepository {
  list(pid?: number): ProcessUsage[];
  create(value: NewProcessUsage): ProcessUsage;
}
```

Existing imports from `src/modules/process-usage/process-usage.ts` continue to export the three types and the same `SqliteProcessUsageRepository` class. Its constructor and runtime identity are unchanged. M07 now type-imports `ProcessUsageRepository` from `contracts.ts` and has no dependency on the adapter or SQLite types.

`ApplicationInstance.usage` remains `SqliteProcessUsageRepository | undefined`; all synchronous `createApplication` overloads and defaults are unchanged. No extra repository, connection, cache, or singleton was created.

## 4. Dependency Direction, State Ownership and Runtime Wiring

The neutral M15 contracts import no SQLite, Express, application, or adapter modules. `process-usage.ts` depends on the neutral contracts and the `better-sqlite3` type only. M07 depends on the neutral contract type. M02 composes the adapter with the M17 database handle and supplies it to the HTTP API. M17 remains the sole database lifecycle/schema owner.

When SQLite is enabled, `openPersistence` opens one database and M02 creates one `SqliteProcessUsageRepository` over that handle. When disabled, the app's `usage` handle remains `undefined`, and M17 closes only the database it opened. The adapter's `better-sqlite3` import is type-only; the concrete driver is dynamically required by M17 only when `openDatabase` is called. No extra runtime driver loading was added.

No Session/M14 or AA Catalog/M16 source was changed. The HTTP API router retains its existing route order relative to catalog routes and the other endpoints.

## 5. Exact SQLite and HTTP Behavior

### SQLite repository

Adapter logic is unchanged apart from type imports/exports and the `implements` reference. It still uses:

- unfiltered: `SELECT id, pid, cpu, memory FROM ProcessUsage ORDER BY id DESC`;
- filtered: `SELECT id, pid, cpu, memory FROM ProcessUsage WHERE pid = ? ORDER BY id DESC`;
- a branch specifically on `pid === undefined`, with parameter binding;
- insert: `INSERT INTO ProcessUsage(pid, cpu, memory) VALUES (?, ?, ?)`;
- return value: `{ id: Number(result.lastInsertRowid), ...value }`.

Tests cover empty results, generated IDs, descending order, repeated PIDs, exact PID filtering and no matches, PID `0` for direct repository calls, zero CPU/memory, fractional CPU, and the original spread behavior for an extra direct-call property. The immediate `create()` result preserves extra input properties, while later SQL reads return only persisted columns. Direct calls can persist negative PID and fractional memory because the existing schema does not constrain them; tests preserve this distinction from HTTP validation. Negative CPU and negative memory remain rejected by the existing `CHECK` constraints.

The unchanged M17 schema is `id INTEGER PRIMARY KEY AUTOINCREMENT`, `pid INTEGER NOT NULL`, `cpu REAL NOT NULL CHECK(cpu >= 0)`, `memory INTEGER NOT NULL CHECK(memory >= 0)`, plus index `idx_process_usage_pid` on `pid`. It does not impose a positive PID check or an integer-only memory check. No schema/index/migration changes were made. Temporary file-backed DB tests close and reopen the database and clean up their directory.

### HTTP API

M07 source behavior is unchanged. Tests verify:

- `GET /api/process-usage` without `pid` calls `list(undefined)`; supplied values pass through the existing `Number(req.query.pid)` conversion. Positive safe integers are accepted, including coercible `1e0`; no matches return status 200 with `[]`. Zero, negative, fractional, unsafe, nonnumeric, and empty values return exactly 400 `{error:'invalid pid'}` without calling the repository.
- `POST /api/process-usage` retains the existing Zod rules: positive integer PID, finite nonnegative CPU, and nonnegative integer memory. JSON numbers are not string-coerced. CPU fractions and zero CPU/memory remain valid. Unknown keys are stripped. Invalid bodies remain 400 `{error: parsed.error.flatten()}` and valid bodies return status 201 with the created row.
- Repository exceptions still use the global 500 mapping `{error:'internal server error'}`.
- Direct `createHttpApp` calls with `usage` absent and no disabled gate retain the existing misleading success behavior: list returns 200 with an empty body and valid create returns 201 with an empty body. Invalid requests still fail validation. This remains deferred R7.3 debt; this checkpoint does not change it.
- The existing `http-gateway.test.ts` continues to verify API-key authentication precedes the SQLite-disabled gate: 401 when unauthorized, 503 `{error:'SQLITE_DISABLED'}` when authorized but disabled.

Health, `/api/messages`, sessions, catalog/usage route order, JSON limit, headers, middleware order, standalone opt-in and programmatic SQLite-enabled default remain untouched.

## 6. Changed Files

- `src/modules/process-usage/contracts.ts` — new neutral M15 contracts.
- `src/modules/process-usage/process-usage.ts` — re-exports contract types and imports them for the unchanged adapter implementation.
- `src/infrastructure/http/http-api-router.ts` — type-only contract import now uses M15 canonical path.
- `src/infrastructure/http/http-server.ts` — type-only contract import now uses M15 canonical path.
- `tests/process-usage-repository.test.ts` — five tests for fake contract, compatibility, SQLite behavior/constraints, reopen, and app isolation/disabled mode.
- `tests/process-usage-http-api.test.ts` — four tests for GET, POST, absent optional usage, and global error mapping.
- `R6_4_D_PROCESS_USAGE_REPORT.md` — this report.

`src/app/create-app.ts`, M17 database source, M14 session files, M16 catalog files, README, API docs, dependencies, and lockfiles were not modified. The untracked task prompt remains preserved.

## 7. Verification Evidence

Baseline was 119 backend plus 32 playground individual tests (151). Nine unique backend tests were added, bringing the final count to 128 backend plus 32 playground (160 total). Focused reruns are not counted again.

| Check | Result |
|---|---|
| Node.js | `v22.23.5` explicitly selected |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 128 tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 individual cases across five test-file suites, 0 failures |
| Compiled startup, `ENABLE_SQLITE=0`, `PORT=0` | PASS — listened on an ephemeral loopback port; terminated by SIGTERM after the smoke window |
| Compiled startup, `ENABLE_SQLITE=1`, temporary DB, `PORT=0` | PASS — listened on an ephemeral loopback port under Node 22; terminated by SIGTERM after the smoke window |
| `git diff --check` | PASS |

HTTP tests used loopback ephemeral ports with local fakes. SQLite tests used in-memory or temporary local databases. No external or production services were used. Startup smoke commands were explicitly run with Node 22.23.5. No Node 24 compatibility is claimed.

## 8. Discretionary Decisions, Deferred Debt and R6.4.E Readiness

- The implementation follows the minimal M14 pattern: a neutral `contracts.ts`, existing adapter file/class retained, legacy exports re-exported, and only M07 contract imports updated. No service layer or generalized repository framework was introduced because there is no additional process-usage workflow policy to own.
- Process Usage remains unclassified as APP versus DEMO. The API/repository split does not imply a classification decision.
- Direct HTTP construction with no repository can still report empty successful responses; this is existing R7.3 debt and remains intentionally unchanged. SQLite schema limitations, including no positive PID or integer-memory constraint, are likewise preserved.
- M16 AA Catalog has not been extracted. R6 is not complete. M15's neutral contract and preserved runtime composition provide a foundation for R6.4.E while leaving M16 and later reliability/dependency work deferred.
