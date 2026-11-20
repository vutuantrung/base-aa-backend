# R6.4.E — AA Catalog Boundary Report

**Repository:** `vutuantrung/base-aa-backend`
**Branch:** `main`
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`
**Implementation baseline:** `a1d0fbd217ffd45d4323ae2c6520d008658d6d33`
**Verification runtime:** Node.js `v22.23.5`

## 1. Verified Baseline and Summary

- Verified branch `main` at the required implementation HEAD. The only initial worktree item was the untracked `prompts/R6_4_E_AA_CATALOG_CODEX_PROMPT.md`; it was preserved.
- The baseline matched. Read `AGENTS.md`, available R6 reports (including R6.4.C and R6.4.D), `README.md`, `docs/HTTP_API_DESIGN.md`, and the catalog, HTTP, SQLite and composition source. No R0–R5 architecture decisions or `api-data.json` source file were present; this report does not invent their contents. The existing HTTP design document describes `api-data.json` as its historical source of truth.
- The prior architecture inventory assigns M16 AA Catalog to APP. No other APP/DEMO classification was inferred here.
- M16 already had a neutral read-only contract in `modules/aa-catalog/contracts.ts`, a SQLite adapter implementing it, and M07 importing the contract by type-only import. The catalog router was already a separate M07 adapter, and M02 already composed one catalog adapter over the M17 database handle. No production-source extraction was justified.
- This checkpoint adds seven unique deterministic boundary/compatibility tests and this report. It does not claim that all 18 module boundaries or the broader R6/R7/R8 verification are complete.

## 2. Responsibility Inventory Before and After

| Responsibility | Before | After |
|---|---|---|
| Catalog entities and read-only repository contract | M16 `modules/aa-catalog/contracts.ts` | Unchanged; existing contract verified as neutral and consumer-facing |
| SQLite JSON persistence, query semantics and five upsert methods | M16 `modules/aa-catalog/sqlite-catalog.ts` | Unchanged; tested against the existing persistence behavior |
| HTTP route binding, parent-existence policy, status and response mapping | M07 `infrastructure/http/aa-catalog-router.ts` | Unchanged; behavior characterized with structural fakes |
| API router mounting, authentication and disabled-path gate | M07 `http-api-router.ts`, `http-server.ts`, `http-middleware.ts` | Unchanged |
| Database schema/index/open/close and optional SQLite lifecycle | M17 `infrastructure/database/sqlite.ts` and `persistence.ts` | Unchanged |
| Per-app adapter construction and public concrete handle | M02 `app/create-app.ts` | Unchanged; one adapter over the existing app-owned database handle |

### Source structure and dependency direction

```text
src/
├── modules/aa-catalog/
│   ├── contracts.ts       # M16 DTOs and read-only AaCatalogRepository port
│   └── sqlite-catalog.ts  # M16 SQLite implementation plus internal upsert methods
├── infrastructure/
│   ├── http/
│   │   ├── aa-catalog-router.ts # M07 HTTP bindings and existence/404 policy
│   │   ├── http-api-router.ts   # mounts catalog router when capability exists
│   │   └── http-server.ts       # HTTP app/middleware composition
│   └── database/
│       ├── sqlite.ts      # M17 schema, indexes, pragmas, lazy native load
│       └── persistence.ts # M17 database lifecycle
└── app/create-app.ts    # M02 composition and public catalog handle
```

M16 contracts import no HTTP, app, SQLite, or adapter modules. The SQLite adapter imports contract types and a type-only `better-sqlite3` database type. M07 imports `AaCatalogRepository` with `import type`; it does not depend on the SQLite adapter. M02 supplies the adapter to M07 and owns the composition. M17 remains the single owner of the database handle, schema, index, WAL/foreign-key setup and close lifecycle. There are no new dependency cycles or duplicate catalog state.

## 3. Actual Consumers and Read/Write Ownership

Concrete runtime composition consumer: `src/app/create-app.ts` constructs one `SqliteAaCatalogRepository(db)` when the M17 database exists, passes it into `createHttpApp`, and exposes it as `ApplicationInstance.catalog`. M07's `http-server.ts`, `http-api-router.ts`, and `aa-catalog-router.ts` consume only the `AaCatalogRepository` read capability.

The concrete adapter has five synchronous upsert methods: `upsertAa`, `upsertBrowser`, `upsertExtension`, `upsertActivity`, and `upsertTask`. The only direct source call sites found are in `tests/aa-catalog.test.ts`; README documents the exposed `app.catalog.upsert*` methods as internal population hooks. No production ingestion workflow, synchronizer, or other typed writer consumer exists. The methods remain concrete on the adapter and public concrete app handle, separate from the read port.

Adding a neutral `AaCatalogWriter` here would create a contract for a hypothetical ingestion consumer without changing or serving an actual consumer. The read/write distinction is already visible: M07 receives only the read-only `AaCatalogRepository`, while writes remain adapter-specific internal integration methods. A writer port can be introduced when an actual application use case needs to consume those methods. No pass-through service, repository framework, second adapter, or HTTP write endpoint was added.

Catalog `ExtensionTask` is an M16 API DTO and remains distinct from M12 Task Workflow. An `AaConnection` catalog DTO is persisted read data and remains distinct from M06's live peer identity/directory. Activity platform casing (`Facebook | Tiktok | Threads`) remains distinct from task platform casing (`facebook | tiktok | threads`). No field or casing normalization was introduced.

## 4. Public Contracts and Runtime Compatibility

The existing `AaCatalogRepository` remains unchanged and read-only:

- `currentAa(): AaConnection | undefined`
- `allBrowsers(): BrowserResult[]`
- `browserById(id: string): BrowserResult | undefined`
- `extensionById(id: string): ExtensionDetails | undefined`
- `activitiesByExtension(id: string): ExtensionActivity[]`
- `tasksByExtension(id: string): ExtensionTask[]`

All entity DTOs, nested fields, `BrowserResult` wrapper, platform-keyed `supportingPlatforms`, optional `parserInfo`, unknown nested records, priority/state/schedule unions, field names and types remain as currently declared. No runtime validation, flattened DTO, broader repository mutation contract, or public import/signature change was made.

`SqliteAaCatalogRepository` remains at its existing import path, keeps its constructor, read/upsert method signatures and runtime identity. `ApplicationInstance.catalog` remains concrete (`SqliteAaCatalogRepository | undefined`), and `createApplication` overloads and synchronous construction are untouched. SQLite-disabled apps still have `catalog === undefined`; enabled/default programmatic composition still uses the one database instance supplied by M17. Standalone SQLite remains opt-in.

## 5. Query and Persistence Semantics Verified

The adapter source and tests preserve the current implementation:

- `currentAa()` reads the stored payloads and chooses greatest `connectedTime`; ties choose ascending `id.localeCompare`. It does not filter by connection status or prefer heartbeat time. A disconnected record with the greatest/tied time can be returned. Empty storage yields `undefined`.
- Browser list and child entity lists use ascending relational `id` order. `allBrowsers()` and `browserById()` both retain `{browser: ...}` wrappers. Missing singular rows yield `undefined`; empty lists yield `[]`.
- Child reads use the exact supplied extension ID, including when the parent is missing. HTTP—not the repository—first checks parent existence before querying child records.
- Upserts remain parameterized and conflict on the entity ID. Updating an activity/task ID updates its payload and relational `extension_id`, allowing reassignment between extensions; no composite key or referential constraint was added.
- Nonblank raw IDs are not trimmed: surrounding whitespace remains part of the key. Blank ID still throws `ID must not be empty`; blank activity/task extension ID still throws `Extension ID must not be empty`. Direct orphan child writes/reads remain possible.
- JSON payload handling remains `JSON.stringify`/`JSON.parse`. Nested DTO round trips and casing are covered; malformed stored JSON continues to propagate its parse error. No automatic repair, validation layer, migration, or normalization was introduced.
- Records survive close/reopen. Schema and indexes were not changed; no query optimization, pagination, transaction or cache was added.

Tests exercise same-ID browser replacement, activity/task re-assignment, sorted reads, exact filters, raw whitespace keys, blank rejection, child records under absent parents, malformed JSON propagation, and a temporary-file database reopen. This verification does not claim future query-volume performance; `currentAa()` still loads and sorts all stored AA records in memory.

## 6. HTTP Compatibility and Optional Capability Findings

The six existing routes and M07 policy remain unchanged:

- `GET /api/aa`: missing value returns 404 `{error:'aa_not_found'}`.
- `GET /api/browser/all` is registered before `/browser/:id`; it returns browser wrappers. Missing browser returns 404 `{error:'browser_not_found'}`.
- `GET /api/extension/:id`: missing extension returns 404 `{error:'extension_not_found'}`.
- `GET /api/extension/:id/activities` and `/tasks`: each first checks `extensionById(String(req.params.id))`; absent parent returns 404 `{error:'extension_not_found'}` without calling the child query; an existing parent with no children returns 200 `[]`.
- Existing IDs use `String(req.params.id)` without trimming or normalization. Synchronous repository exceptions continue to reach the global 500 `{error:'internal server error'}` handler.
- There are no catalog mutation HTTP endpoints. The catalog router is mounted only when `catalog` is truthy, before remaining API routes.

The existing middleware order remains auth first, then SQLite-disabled gating, then API router. New tests characterize exact gate coverage for `/aa`, `/browser`, `/browser/…`, and `/extension/…`: unauthorized requests get 401, authorized gated requests get 503 `{error:'SQLITE_DISABLED'}`. `/extension` without the slash remains outside that gate and falls through to 404; no path coverage was corrected. Direct `createHttpApp` with no catalog and SQLite enabled retains unmatched-route 404 rather than manufacturing empty catalog success. Existing health, messages, session/usage routes, JSON parser/limit, headers and global errors are unchanged.

## 7. Changed Files and Verification

Changed files:

- `tests/aa-catalog-boundary.test.ts` — seven unique focused tests; no production source changed.
- `R6_4_E_AA_CATALOG_REPORT.md` — this report.

The test file covers a read-only fake with no upsert methods, catalog query/DTO/upsert behavior, reopen and malformed JSON, HTTP response/existence policy, route precedence, absent capability and exact auth/disabled path behavior, app isolation/disabled catalog, and global 500 mapping. Existing `tests/aa-catalog.test.ts` and `tests/http-gateway.test.ts` remain unchanged and passed.

Baseline was 128 backend + 32 playground individual cases (160). Seven unique backend cases were added. Final counts: 135 backend + 32 playground individual cases (167 total). Focused reruns are not counted again.

| Check | Result |
|---|---|
| Node.js | `v22.23.5` explicitly selected for Node/npm commands |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 135 tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — five test-file suites, 32 individual cases, 0 failures |
| Compiled `ENABLE_SQLITE=0`, `PORT=0` startup | PASS — listened on an ephemeral port, then stopped on SIGTERM |
| Compiled `ENABLE_SQLITE=1`, temporary DB, `PORT=0` startup | PASS — listened on an ephemeral port, then stopped on SIGTERM |
| `git diff --check` | PASS |

The HTTP tests and startup smoke checks used loopback only with ephemeral ports. The SQLite-enabled smoke used a temporary DB path; DB/WAL/SHM files were removed afterward. No external or production service was contacted. Node 24 and real PServer behavior remain unverified.

## 8. Deferred Findings, Decisions and R6 Closure Readiness

- Optional capability consistency remains deferred: sessions/usage can return empty successful responses when their direct HTTP repositories are absent, while catalog routes are not mounted without a catalog. This checkpoint preserves all three established behaviors; related API consistency is deferred to R7.
- Catalog payload JSON is not runtime-schema-validated on read; malformed data propagates. Direct child writes need not reference an existing extension because the schema has no foreign key. These are preserved semantics, not repaired here.
- `currentAa()` reads and sorts all stored AA rows in memory. Potential scaling work belongs to a later evidence-driven change; there is no pagination or optimization in this phase.
- `ApplicationInstance.catalog` intentionally remains a concrete adapter type because existing app consumers use the upsert methods. M07 remains constrained to the reader interface.
- The historical API input `api-data.json` is absent from the repository, as are R0–R5 decision records. The existing HTTP design document is the available contract note; exact missing original source material is not claimed as inspected.
- M16's existing APP boundary is verified and its contracts/query responsibilities are coherent. This is not an assertion that all 18 modules are extracted or that R6, R7, or R8 verification is complete. M15, other modules, ARM, dependency enforcement and broader reliability work were not changed.

R6.4.E leaves the existing reader port and adapter in place because they already express M16 ownership. This establishes M16 boundary verification for the checkpoint and leaves broader R6 closure to its own inventory and verification.
