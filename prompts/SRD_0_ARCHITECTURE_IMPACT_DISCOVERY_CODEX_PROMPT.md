# SRD.0 — Architecture Impact Discovery (Codex)

## Authorization and objective

Act as a read-only repository auditor for AS (repository `vutuantrung/base-aa-backend`). The owner has closed Feature Exploration and authorized SRD.0 only. The twelve decisions in the embedded handoff below are binding. Its historical transition-gate wording is superseded only by this explicit authorization to perform discovery; implementation remains unauthorized.

Produce evidence sufficient for a later SRD.1 implementation plan. Do not implement, refactor, or create implementation tasks in this phase. Use current AS/CDC/EServer/SPA/AA naming. Do not assume the exploration SHA is current.

## Safety and execution boundary

- Inspect local repository only. No network access, permission escalation, sudo, fetch/pull, package installation, builds, test execution, service startup, ARM deployment, or database opening. Inspect test and script source without executing it. Do not change network rules.
- Preserve all existing tracked, staged, unstaged and untracked files. No checkout/reset/stash/clean/stage/commit/push. Do not modify production code, tests, scripts, manifests, configuration, active architecture documents or historical reports.
- Do not open or inspect contents of credentials or live runtime state. Never touch legacy SQLite files, WAL/SHM, M12/M13 records, outbox, locks or deployed releases. Do not print secret values. Inspect tracked configuration examples and source only; report inaccessible external usage as UNKNOWN.
- The only authorized write is the new discovery report `SRD_0_ARCHITECTURE_IMPACT_DISCOVERY_REPORT.md` at repository root (if that file already exists, use a new non-overwriting filename and report it). The supplied prompt itself may already be present; preserve it.
- Use targeted reads and searches. Avoid dumping entire lockfiles, historical reports or code into the response. Distinguish direct evidence, inference, unknown and blockers.

## Workstreams

### SRD.0.1 — Baseline and governing context
Record local branch, full HEAD, local worktree status (including staged/untracked), and local comparison with exploration SHA `099f75a0fe273af3755925519b9d2df0799c3d13` if available. If on a different branch, do not switch; report discrepancy and stop for owner review if it prevents reliable discovery. Do not claim remote freshness from local HEAD. Read AGENTS.md and active architecture, naming migration, lifecycle/reliability, module boundaries, dependency inventory, and test governance docs as relevant. Identify any drift or contradiction with approved decisions; do not silently resolve it.

### SRD.0.2 — Removal inventory
Enumerate M14–M17 canonical files, models, repositories, SQLite schema/table/index ownership, public exports and compatibility paths. Identify all direct and indirect source references using tracked files and relevant local untracked source (exclude generated output, dependency trees, secret files, live data). Search identifiers and imports as well as words: SQLite, better-sqlite3, ENABLE_SQLITE, DB_PATH, enableSqlite, dbPath, SQLITE_DISABLED, openPersistence, openDatabase, repository classes, app handles, and the eleven HTTP routes. Separate active code from historical evidence. Do not treat generic session, CDC protocol, Socket.IO namespace or generic persistence identifiers as removal targets merely because of naming.

### SRD.0.3 — Dependency impact
Map actual callers/importers, type/runtime edges, composition and lifecycle acquisition/cleanup paths. Include M01/M02/M07 and shared compatibility surfaces. Record symbol and file:line evidence, impacted retained responsibilities, whether a reference is exclusive or mixed, and proposed disposition category (REMOVE / ADAPT / PRESERVE / INVESTIGATE), not implementation instructions. Check M02 error cleanup/readiness/drain invariants and avoid broad extraction.

### SRD.0.4 — Public contracts and consumers
Inventory the eleven HTTP methods/routes and middleware matching, auth ordering, unmatched-route behavior, app handles, overloads, repository exports, config keys and callers. Distinguish normal expected 404 after successful auth from actual runtime verification (not performed). Search in-repository AA/CDC/EServer/SPA demos, fixtures, docs and packaging consumers. Identify known external references if present locally; never infer external non-use. Report any retained flows that depend on removed APIs as a compatibility risk requiring owner review.

### SRD.0.5 — Persistence isolation
Trace M12/M13 stores, reliable outbox, dedupe, retry, recovery, runner leases/locks and lifecycle integration independently of M17 SQLite. Verify actual source ownership; resolve documentation ambiguity only by reporting evidence, not editing docs. Inventory relevant storage configuration and invariants without accessing live files. Identify whether any shared helper must be preserved. No migration or consolidation.

### SRD.0.6 — Dependencies, build, packaging and CI
Inspect active manifests/lockfiles, native preflight, test runners, CI workflows, examples, ARM package scripts and tracked config templates. Map SQLite-specific vs retained logic. Identify direct/transitive dependency evidence from lockfiles and required isolated future verification prerequisites. Do not run npm, package scripts or ARM, or modify lockfiles. External ARM repo/runtime availability is UNKNOWN unless independently evidenced locally within authorized scope.

### SRD.0.7 — Test impact
Inventory actual test files, relevant test cases/assertions and manifest/profile memberships. Classify REMOVE (exclusively retired behavior), ADAPT (mixed or obsolete setup), PRESERVE (retained behavior), or INVESTIGATE. Account for retained assertions in mixed tests including lifecycle construction failures, auth-first behavior, feature modes, error handling, and workflow/recovery. Identify SQLite-only preflight and any shared verification logic that must remain. Report proposed verification coverage gaps and feasibility; do not write, delete or execute tests. Do not assert future PASS or fixed test counts.

### SRD.0.8 — Architecture governance
Inspect checker module mapping, allowed/forbidden edges, cycles, fixture tests and active documentation. Identify references needing eventual retirement or decision supersession (including R7.5-D06, R7.8 ES-D04/ES-D05, SQLite-specific compatibility requirements). M14–M17 retired only after implementation; no ID reuse/renumbering; M12/M13 TBD and M02 extraction deferred. Keep historical reports untouched. Identify shared persistence helpers even if historical wording calls them M17.

### SRD.0.9 — Closure
Cross-check inventory against all twelve decisions and RV-01–08/V01–06. Report missing evidence, external consumer risks, local/remote baseline uncertainty, and any blockers for planning. Capture final git status, compare with initial status and explain only the authorized report addition. Do not start SRD.1.

## Required report

Write `SRD_0_ARCHITECTURE_IMPACT_DISCOVERY_REPORT.md` in English with:

1. Executive summary and recommendation (`READY FOR SRD.1 REVIEW`, `CONDITIONAL`, or `BLOCKED`).
2. Baseline, scope, evidence sources, commands and limitations.
3. Decision traceability matrix (all 12 IDs, evidence and implications).
4. Removal inventory and impacted-file matrix (path, symbol/line, module, current role, disposition, retained behavior, evidence/risk). Group repetitive historical references rather than reproducing them.
5. Public contract and consumer inventory, with external unknowns explicit.
6. Persistence isolation evidence and lifecycle invariants.
7. Dependency/build/packaging/CI inventory.
8. Test impact matrix and retained coverage, profile membership and gaps.
9. Architecture governance impact and supersession inventory.
10. RV-01–08 and V01–06 traceability and future verification prerequisites. Label runtime/build/test gates NOT RUN; evidence of feasibility is not PASS.
11. Risks, blockers, open owner questions and readiness for planning.
12. Initial/final worktree comparison and confirmation of no unauthorized changes.

Use concrete file:line references and compact tables. Do not report unverified claims as facts. Do not generate an implementation plan or patch. Stop after the report and return its path, HEAD, readiness recommendation and highest-priority findings.

---

## Embedded approved feature decision handoff (historical exploration snapshot)

# AS — SQLite Removal: Feature Decision Handoff

## 1. Context and status

- Repository: https://github.com/vutuantrung/base-aa-backend
- Branch inspected: `main`
- Discovery snapshot: `099f75a0fe273af3755925519b9d2df0799c3d13` (revalidate HEAD before development).
- Original development baseline: `72b31e54e266743fbfd18b6169e4a85c843ddeb7`.
- Current naming: AS, CDC, EServer, SPA, AA.
- Product maturity: Development Baseline, not production-ready.
- Feature exploration: complete; all twelve decisions approved by the owner.
- Implementation authorization: not yet granted. No source changes or new verification runs performed during exploration.

## 2. Problem and objective

SQLite is optional and disabled by default in standalone AS, but remains enabled by default in programmatic application creation. It introduces native dependency, configuration, composition, test and packaging complexity. Its three business consumers are no longer required. Remove the technology and those capabilities rather than introducing a replacement database. AS is not becoming stateless: existing independent persistence must remain intact.

## 3. Approved decisions

| ID | Decision | Status |
|---|---|---|
| SR-001 | Remove SQLite completely | ACCEPTED |
| SR-002 | Selective Persistence Removal (B) | ACCEPTED |
| SRG-01 | Remove Generic Session M14 (A) | ACCEPTED |
| SRG-02 | Remove Process Usage M15 (A) | ACCEPTED |
| SRG-03 | Remove AA Catalog M16 (A) | ACCEPTED |
| SR-003 | Remove M17 rather than repurpose it (A) | ACCEPTED |
| SR-004 | Preserve independent persistence as-is (A) | ACCEPTED |
| SR-005 | Retire M14–M17 IDs; no renumbering or reuse (A) | ACCEPTED |
| SR-006 | Leave legacy database data untouched (A) | ACCEPTED |
| SR-007 | Complete public contract removal (A) | ACCEPTED |
| SR-008 | Complete configuration and dependency cleanup (A) | ACCEPTED |
| SR-009 | Comprehensive regression verification (A) | ACCEPTED |

Alternatives considered and not selected: replacing SQLite while retaining all capabilities; fully stateless AS; in-memory or alternative persistence for M14–M16; partial catalog retention; repurposing M17 or consolidating persistence; renumbering modules; automatic data cleanup or archiving; 410/503 compatibility handlers; legacy configuration warnings; targeted-only verification.

## 4. Target architecture

| ID | Module | Target classification/status |
|---|---|---|
| M01 | Configuration | APP |
| M02 | Application Lifecycle | APP |
| M03 | CDC Transport | APP |
| M04 | CDC Protocol | APP |
| M05 | Socket Gateway | APP |
| M06 | Peer Directory | APP |
| M07 | HTTP Gateway | APP |
| M08 | Integration Clients | APP |
| M09 | Generic Messaging | APP |
| M10 | Peer Messaging | APP |
| M11 | Message Transformation | APP |
| M12 | Task Workflow | TBD (unchanged) |
| M13 | Resource Selection | TBD (unchanged) |
| M14 | Generic Session | RETIRED |
| M15 | Process Usage | RETIRED |
| M16 | AA Catalog | RETIRED |
| M17 | Persistence Infrastructure | RETIRED |
| M18 | Observability | APP |

Target: 14 retained modules, 4 retired IDs. New module IDs start at M19. Retirement is a target, not an implemented repository state. M02 extraction remains deferred.

## 5. Functional requirements and removal scope

### FR-01: Remove M14–M16 capabilities

Remove their models, repository contracts, concrete SQLite adapters, application handles and corresponding routes. The seven schema tables are Session, ProcessUsage, AaConnection, AaBrowser, AaExtension, AaActivity and AaTask. No replacement persistence or transfer of ownership to other services.

| Module | Method | Removed endpoint |
|---|---|---|
| M14 | GET | `/api/sessions` |
| M14 | GET | `/api/sessions/:id` |
| M14 | POST | `/api/sessions` |
| M15 | GET | `/api/process-usage` |
| M15 | POST | `/api/process-usage` |
| M16 | GET | `/api/aa` |
| M16 | GET | `/api/browser/all` |
| M16 | GET | `/api/browser/:id` |
| M16 | GET | `/api/extension/:id` |
| M16 | GET | `/api/extension/:id/activities` |
| M16 | GET | `/api/extension/:id/tasks` |

### FR-02: Remove M17

Remove SQLite driver initialization, database handle management, schema/index initialization, pragmas and close lifecycle. Known files: `src/infrastructure/database/sqlite.ts`, `src/infrastructure/database/persistence.ts`. Do not repurpose M17. Discover all actual references before implementation.

### FR-03: Remove public contracts completely

Remove `ApplicationInstance.sessions`, `.usage`, `.catalog`, SQLite-specific `createApplication()` overloads and M14–M16 repository exports. Remove `SQLITE_DISABLED` and its route gate. Removed routes follow ordinary unmatched-route handling (expected 404 for authenticated requests); preserve existing authentication order and normal error behavior. No dedicated legacy handlers or invented response schema. This is an intentional, scoped breaking change.

### FR-04: Remove configuration, dependencies and tooling

Remove SQLite handling of `ENABLE_SQLITE`, `DB_PATH`, `enableSqlite`, `dbPath`, `better-sqlite3`, `@types/better-sqlite3`, associated lockfile entries, native preflight, SQLite-specific test/CI requirements and SQLite dependency exclusion logic in AS ARM packaging. Legacy environment variables are no longer consumed; do not add warnings or aliases. Retain packaging capability and non-SQLite tests.

### FR-05: Preserve legacy data

Do not create, access, migrate, archive, truncate or delete legacy SQLite files, including WAL/SHM files. No automatic changes to deployed application configurations. Existing files are left untouched; manual cleanup is outside scope. This helps rollback but does not prove rollback compatibility.

## 6. Preservation requirements and non-goals

- Preserve M12/M13 file-based records, reliable outbox, retry/deduplication/recovery state, storage formats and locations, and current guarantees.
- Preserve CDC registration/session protocol (M04), Socket.IO `/session` and `/worker`, peer identities, routing, transforms and remaining public contracts. Generic Session is distinct from CDC session and Socket.IO namespace; catalog AaTask is distinct from M12 Task Workflow.
- Preserve R7.5–R7.10 reliability and lifecycle decisions except explicit SQLite-related supersessions. No changes to ACK meaning/timing, delivery semantics, retry policies, admission, readiness or bounded shutdown beyond removal of SQLite resources.
- Preserve feature-mode behavior, M12/M13 TBD classification, M02 extraction deferral, and architecture enforcement for remaining modules.
- No replacement DB, general persistence framework, ARM architecture change, process monitoring feature, unrelated refactor, production deployment, or changes to credentials and existing persistent state.
- Preserve historical reports as historical evidence; update active architecture inventory, configuration documentation, module mappings and governance. Retire IDs without reuse. Explicitly record supersession of prior SQLite/retention decisions (including R7.5-D06 and R7.8 ES-D04/ES-D05); audit other affected compatibility decisions before editing.

## 7. Acceptance and verification requirements

### Removal gates

- RV-01: No SQLite runtime/development dependency remains in active AS manifests or resolved dependency graph.
- RV-02: M14–M17 implementations removed; no stale active imports or mappings.
- RV-03: All eleven removed HTTP routes absent; normal unmatched-route and auth behavior verified.
- RV-04: SQLite-specific application handles, overloads and exports removed.
- RV-05: No SQLite-specific config handling; remaining config behavior preserved.
- RV-06: SQLite-specific test/CI/preflight/packaging logic removed without weakening retained coverage.
- RV-07: Clean install, typecheck, build and startup succeed without SQLite.
- RV-08: No creation, reading, writing or deletion of legacy SQLite data; verify with isolated fixtures, not live deployed data.

### Comprehensive verification (SR-009)

| Gate | Scope |
|---|---|
| V01 | Removal inventory and negative checks for obsolete contracts/config/dependencies |
| V02 | Architecture checker, retired IDs, remaining dependency rules, no new prohibited cycles |
| V03 | Clean installation, typecheck, build, startup |
| V04 | Fast, Integration, Full and maintained regression coverage; account for removed tests and preserve retained assertions |
| V05 | Local runtime behavior: CDC connection/registration, peer identity, socket auth, HTTP health/messaging, GM fan-out, PM ACK/delivery, transformation, M12/M13 persistence/recovery, diagnostics and graceful shutdown |
| V06 | AS ARM package generation and managed startup in isolated environment; no changes to deployed releases |

No production network access. Do not modify actual releases, credentials, configurations or persistent state. If network permissions, local fixture infrastructure, ARM tooling or environment constraints prevent checks, record BLOCKED with evidence rather than claiming PASS. Do not expand network rules or use sudo without authorization. Test count may decrease only for removed responsibilities; shared tests must preserve retained assertions. Report exact commands, environment, results, limitations and remaining risks. Do not claim production readiness.

## 8. Development discovery questions (not new design decisions)

1. Revalidate main HEAD, worktree status and current architecture documents; detect drift from discovery snapshot.
2. Complete read-only reference/consumer inventory, including source, tests, scripts, manifests, CI, examples, docs, AS package and known external consumers (AA, CDC, EServer, SPA, ARM as applicable). External usage has not been fully verified.
3. Identify mixed tests that exercise both removed and retained behavior. Determine replacement regression assertions and revised manifest/profile membership.
4. Verify actual config and unmatched-route behavior, including authentication and any strict programmatic configuration validation.
5. Identify architecture checker mappings and affected decision references. The existing module-boundary document includes an inconsistent historical attribution of file stores to M17; verify actual ownership in source before removal. Do not remove independent stores because of this wording.
6. Determine isolated runtime and ARM packaging verification feasibility. Actual deployed SQLite files and external runtime environments have not been inspected.

## 9. Transition gate

Feature Exploration is closed. Start Feature Development only after explicit owner authorization. First perform Architecture Impact Discovery using current repository evidence and this handoff; report impact and unresolved compatibility risks before implementation planning. Do not treat this document as permission to edit source, run production services, commit, push or deploy.

## 10. Evidence references

All repository evidence below refers to the discovery snapshot; historical reports are not fresh verification results.

- [Module boundaries](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/docs/architecture/MODULE_BOUNDARIES.md)
- [Dependency inventory](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/docs/architecture/DEPENDENCY_INVENTORY.md)
- [Architecture decisions](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/docs/architecture/ARCHITECTURE_DECISIONS.md)
- [SQLite disable report](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/SQLITE_DISABLE_IMPLEMENTATION_REPORT.md)
- [Package manifest](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/package.json)
- [Application composition](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/src/app/create-app.ts)
- [SQLite schema](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/src/infrastructure/database/sqlite.ts)
- [HTTP middleware](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/src/infrastructure/http/http-middleware.ts)
- [HTTP router](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/src/infrastructure/http/http-api-router.ts)
- [AA Catalog router](https://github.com/vutuantrung/base-aa-backend/blob/099f75a0fe273af3755925519b9d2df0799c3d13/src/infrastructure/http/aa-catalog-router.ts)
