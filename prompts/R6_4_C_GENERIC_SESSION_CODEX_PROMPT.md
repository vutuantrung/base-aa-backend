# R6.4.C — Generic Session Boundary Extraction

## 1. Checkpoint and scope

Repository: `vutuantrung/base-aa-backend`; branch `main`.
Architecture baseline: `82b6cb68e2016594d42731c2ae022ce43b638557`.
Implementation baseline: `3660e8602d381e3ec4ec1fa6e2134300c941b572`.
Baseline verification: Node.js 22.23.5, 112 backend + 32 playground = 144 individual tests (reported by R6.4.B).

Read AGENTS.md, available R6 reports, architecture notes, API documentation, and actual source before editing. Verify HEAD and worktree; preserve existing user changes and prompt files. Report missing R0–R5 decision records rather than inventing decisions. Continue Breadth-first Architectural Decomposition. Scope is M14 only; M15 Process Usage and M16 AA Catalog remain separate checkpoints. Generic Session is application data, not M04 PServer session registration/readiness, nor the M09 session channel. M14 APP/DEMO classification remains TBD. Do not work on ARM.

## 2. Audit before implementation

Inspect `src/modules/session/session.ts`, `src/infrastructure/http/http-api-router.ts`, `http-server.ts`, `http-middleware.ts`, `src/infrastructure/database/sqlite.ts`, `persistence.ts`, `src/app/create-app.ts`, and all session consumers/tests/docs. Use rg to identify direct and type-only imports, public paths and app handles. Distinguish actual operations (list/get/create) from hypothetical CRUD (no update/delete exists). Current module exports `Session = {id:number; name:string}`, synchronous `SessionRepository` and concrete `SqliteSessionRepository`. HTTP ingress already uses a structural repository capability. Report responsibilities and dependencies before/after.

## 3. Target boundary

- M14 owns the Session model and technology-neutral repository contract. Separate those definitions from `better-sqlite3` implementation so consumers can import the neutral contract without a dependency on the concrete adapter or database types. Use a small `contracts.ts` or similarly clear file, keeping existing `session.ts` exports as a compatibility entrypoint if needed. Preserve type identities and signatures. The concrete implementation can remain a task-specific module adapter or move to an appropriate existing infrastructure location; choose the smallest coherent change and explain it. Do not create an extra generic repository framework.
- M07 retains HTTP parsing, normalization, validation, status/response mapping, auth, middleware and error handling. An optional dedicated session route adapter is acceptable if it makes the M14 integration clearer, but do not split all HTTP routes in this checkpoint. Reuse the existing contract; no mandatory SessionService pass-through or duplicate schema. If no extra application use case is warranted, document that explicitly.
- M17 owns database open/close, schema initialization, WAL, foreign keys, optional SQLite availability. Do not let M14 open its own database or create schema; keep the same instance supplied by composition. M02 remains composition owner.
- Keep `ApplicationInstance.sessions` and `createApplication` overloads (SQLite-enabled/default and disabled) compatible, including concrete public repository type if exposed. Preserve synchronous methods and synchronous application construction. No second state store, cache, connection or singleton. Keep original imports working; update internal callers to canonical paths where appropriate without broad churn.

## 4. Exact compatibility invariants

Database: `Session` table remains `id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL`. List uses `SELECT id, name FROM Session ORDER BY id`; get uses parameterized ID lookup, returns undefined if absent; create uses parameterized insert, returns `{id:Number(lastInsertRowid),name}`. Preserve existing ordering, identity generation, duplicate names permitted, raw repository input behavior (no new validation/trim at repository level), row shape, persistence across restart, and existing records. No migrations, schema/index changes, SQL semantics changes, timestamps, pagination, update/delete or new endpoints. No eager runtime loading of optional `better-sqlite3` if SQLite disabled.

HTTP: `GET /api/sessions` returns list; `GET /api/sessions/:id` converts using Number and accepts positive safe integers only (retain exact existing coercion); invalid returns 400 `{error:'invalid id'}`, absent returns 404 `{error:'not found'}`; `POST /api/sessions` uses existing Zod object with trimmed name 1–200 and existing unknown-key handling; invalid returns 400 `{error: parsed.error.flatten()}`, valid returns 201 created record. Retain direct `createHttpApp` optional capability semantics (including undefined repository when passed directly), global 500 handler and error body, JSON limit, headers, route ordering and matching. API key check precedes SQLite-disabled gate (401 first; authorized disabled routes return 503 `{error:'SQLITE_DISABLED'}`). Public `/health` and generic `/api/messages` remain usable when SQLite disabled. Do not change stand-alone env defaults, application programmatic default (SQLite true), or enabled/disabled lifecycle. Preserve usage and catalog route behavior and all messaging/workflow integration.

## 5. Tests and acceptance

Add focused deterministic tests appropriate to the actual change: neutral contract can be consumed by a fake repository; actual SQLite repository list/get/create (empty, ordering, nonexistent, generated IDs, duplicate names, parameterized name including quotes and raw name behavior); compatibility import identity; existing database reopen where feasible; application instance isolation; HTTP success/invalid ID/404/name trim/length/validation error and auth-before-disabled gate. Exercise exact response shapes and existing direct optional-capability behavior where relevant. Reuse existing tests instead of duplicating coverage; test pure contracts without network where possible. Use temporary databases or :memory: and close resources. No production services. Do not weaken or delete existing test assertions. Report unique added cases separately from reruns.

Run Node.js 22.23.5 `npm run typecheck`, `npm run build`, `npm test -- --test-concurrency=1`, `npm --prefix testing run test:playground`, `git diff --check`. If local bind is blocked, report and rerun with permitted local listener access if available. Verify compiled startup in both SQLite modes if affected; distinguish executed checks from skipped/unavailable ones. Preserve all 144 baseline individual tests. No dependency/lockfile changes unless absolutely needed and explicitly reported; no commit/push.

## 6. Deferred scope

Do not redesign M09–M13, M15/M16, M17 persistence lifecycle, common snapshot adapters, raw workflow dispatcher, retries/outbox, fsync, ACK semantics, handshake/reconnect races, PServer stale registration ACK or production integration. Preserve existing feature flags. R7 handles dependency enforcement, contract consolidation, lifecycle/reliability, unused MessageBus and other cleanup. Do not resolve APP/DEMO classification without explicit decision. Avoid unrelated cleanup and unnecessary layers. Use intent-revealing methods, Extract Method where appropriate, existing typing conventions and minimal abstractions.

## 7. Deliverable

Implement within scope, then create `R6_4_C_GENERIC_SESSION_REPORT.md` in repository root. Include verified branch/HEAD, before/after responsibility map, source tree and consumers, neutral contract vs adapter ownership, runtime composition and state ownership, exact API/database compatibility, public exports and overload compatibility, changed files, unique test counts and command results, blockers, discretionary decisions, deferred debt and R6.4.D readiness. Clearly state whether any service layer was needed and why. Do not claim M15/M16 extraction or R6 completion. Stop after report, leaving commit/push to user.
