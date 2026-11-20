# R6.1 — Foundation & Infrastructure Extraction Report

**Repository:** `base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68`  
**Implementation baseline:** `5d1df4ff83f9ca0f617d3e66b55361205df3f7a6`  
**Runtime used for verification:** Node.js 22.23.5

## 1. Executive Summary

R6.1 establishes the requested M01, M02, M17 and M18 boundaries. Configuration is now resolved from an explicit environment input and can be tested without starting the application. The entrypoint delegates startup and shutdown to application lifecycle functions and retains OS signal handling. A persistence runtime owns the optional SQLite handle and closes it idempotently. A small diagnostics interface covers lifecycle messages and errors.

Standalone SQLite remains disabled unless `ENABLE_SQLITE=1`; programmatic `createApplication` still defaults SQLite to enabled. Existing repository schemas, domain repositories, JSON stores, socket/PServer wiring and public `createApplication` overloads are preserved.

## 2. Before/After Source Structure

Before, `src/main.ts` parsed all environment values, assembled PServer and VM settings, created the application, registered the demo transformation, started listening, emitted the startup message and installed signal handlers. `createApplication` also directly owned database creation and close.

After:

```text
src/
├── app/
│   ├── create-app.ts             # composition root; public API unchanged
│   └── lifecycle.ts              # start/stop orchestration
├── config/
│   └── configuration.ts         # environment → resolved configuration
├── infrastructure/
│   └── database/
│       ├── persistence.ts        # SQLite handle lifecycle
│       └── sqlite.ts             # lazy driver load and schema initialization
├── observability/
│   └── diagnostics.ts            # minimal diagnostics capability
└── main.ts                       # environment handoff and OS signals
```

## 3. Extracted Module Boundaries

- **M01 Configuration:** `resolveConfiguration(environment)` performs existing port validation, defaults, VM parsing, and centralized SQLite/test-peer feature flag resolution. It does not load `.env` or access runtime services.
- **M02 Application Lifecycle:** `startApplication` composes and starts the application; `stopApplication` closes it and reports shutdown failures. Signal registration remains in `main.ts`.
- **M17 Persistence Infrastructure:** `openPersistence` conditionally opens SQLite and owns its idempotent close. `openDatabase` retains lazy `better-sqlite3` loading, directory creation, pragmas and the existing schema. Session, usage and AA catalog repositories remain in their domain modules. Task and resource-selection JSON stores remain as-is.
- **M18 Observability:** `Diagnostics` and `consoleDiagnostics` provide a minimal injectable boundary for lifecycle startup and shutdown messages. Existing communication and messaging diagnostics remain at their current integration points.

## 4. Responsibility Mapping

| Responsibility | Owner after R6.1 |
|---|---|
| Environment variable interpretation and validation | `src/config/configuration.ts` |
| App composition and `createApplication` public contract | `src/app/create-app.ts` |
| Startup sequence and shutdown reporting | `src/app/lifecycle.ts` |
| OS signal handling | `src/main.ts` |
| SQLite loading, schema and low-level setup | `src/infrastructure/database/sqlite.ts` |
| Database resource lifecycle | `src/infrastructure/database/persistence.ts` |
| Session / usage / catalog data responsibilities | `src/modules/session`, `src/modules/process-usage`, `src/modules/aa-catalog` |
| Task and resource-selection JSON persistence | Existing peer-messaging stores |
| Lifecycle diagnostics | `src/observability/diagnostics.ts` |

## 5. Public Interfaces

- `Environment`: read-only string environment map with optional values.
- `ResolvedConfiguration`: resolved port, application configuration and centralized `enableTestPeers` flag.
- `resolveConfiguration(environment: Environment): ResolvedConfiguration`.
- `startApplication(configuration, diagnostics?): Promise<ApplicationInstance>`.
- `stopApplication(application, diagnostics?): Promise<void>`.
- `Diagnostics`: `info(message)` and `error(message, error)` methods.
- `openPersistence(dbPath, enabled)`: returns the optional database handle and idempotent `close()`.
- Existing `createApplication` overloads and synchronous return semantics are unchanged, including the SQLite-enabled default.

## 6. Dependency Direction

`main` depends on configuration, lifecycle and diagnostics. Lifecycle depends on configuration types, application composition and diagnostics. Configuration depends only on infrastructure configuration types (type-only import); it has no runtime dependency on application services. Application composition depends on infrastructure adapters, persistence and domain repositories. Persistence depends on the low-level SQLite initializer. No runtime import cycle was introduced.

## 7. Changed Files

- `src/main.ts`
- `src/app/create-app.ts`
- `src/app/lifecycle.ts`
- `src/config/configuration.ts`
- `src/infrastructure/database/persistence.ts`
- `src/observability/diagnostics.ts`
- `tests/configuration.test.ts`
- `R6_1_FOUNDATION_INFRASTRUCTURE_REPORT.md`

## 8. Verification Results

All commands were run with Node.js 22.23.5. The initially installed optional native binding was missing; rebuilding the already-installed `better-sqlite3` dependency succeeded, after which the regression suite passed.

| Verification | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 48 tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |
| Compiled standalone startup, SQLite disabled | PASS — server started on port 43873; timeout used to stop it |
| Compiled standalone startup, SQLite enabled | PASS — server started on port 43873 with a temporary `/tmp` database; timeout used to stop it |
| Configuration defaults, overrides, feature flags and invalid port | PASS — focused tests added |

Local port binding was blocked inside the sandbox, so the two compiled startup checks were run with the required elevated local-bind permission. The temporary SQLite database was under `/tmp`; no repository data files were created.

## 9. Remaining Technical Debt

- Communication and messaging diagnostics still use direct `console` calls across socket, HTTP, peer-gateway and PServer connector code. Those are later integration points, outside this extraction's scope.
- Persistence is intentionally a technical boundary only. Domain repositories remain domain-owned, and workflow/task state has not been moved into a generic repository layer.
- `better-sqlite3` remains an optional native dependency and must have a binding built for the selected Node runtime when SQLite is enabled.

## 10. R6.2 Readiness

**Ready for R6.2.** The target foundation boundaries are explicit, the entrypoint is thin, standalone and programmatic SQLite defaults retain their prior behavior, all regression and playground tests pass, and compiled startup succeeds in both SQLite modes. Communication and messaging diagnostics remain identified integration points for later work.
