# SRD.0 — Architecture Impact Discovery Report

**Repository:** AS (`base-aa-backend`)  
**Scope:** SQLite and M14–M17 removal impact discovery only  
**Recommendation:** **CONDITIONAL** — suitable for SRD.1 review after owner review of the contradictions and local drift below. This report does not authorize implementation.

## 1. Executive summary

The approved handoff is technically discoverable at the recorded exploration source: local `main` HEAD is exactly `099f75a0fe273af3755925519b9d2df0799c3d13`. Current tracked source has the expected M14–M17 implementation: M02 constructs three SQLite repositories and owns a database lifecycle; M07 mounts eleven routes and applies an SQLite-disabled middleware gate; M01 resolves SQLite environment configuration; the root manifest and ARM packaging script retain the native dependency.

The removal is selective. M12 task workflow and M13 resource selection use independent JSON stores and the shared atomic-record/outbox runner, composed inside M05. Those stores, workflow records, locks, retries, dedupe/recovery and lifecycle drain must remain. M17's present `database/` files own only SQLite; the shared file persistence helpers are in `src/shared/persistence/` and are consumed by M12/M13.

**Conditional reasons:** active architecture governance still requires M14/M15 APP and preserves M16 catalog behavior (`ES-D04`, `ES-D05`, `R7.5-D06`, R7.3 compatibility decisions); R7.6 lifecycle text names SQLite as the final close dependency; M01 configuration and application-surface records still include SQLite contracts. The accepted handoff supersedes those decisions, but their active documents need an explicit supersession record in the later authorized documentation phase. In addition, several uncommitted local changes touch retained task/workflow and peer code; `task-workflow.ts` changes wire message type strings from `demo.task.*` to `automation.task.*`. Do not attribute that change to SRD-001 or silently absorb it into a later implementation baseline.

No test, build, package, listener, service, ARM or database operation was performed. External consumer usage and remote freshness remain unknown. No legacy SQLite data was opened or inspected.

## 2. Baseline, scope, evidence, limitations

| Item | Finding |
|---|---|
| Branch / HEAD | `main`; full HEAD `099f75a0fe273af3755925519b9d2df0799c3d13`. |
| Exploration comparison | Supplied SHA is locally available and equals HEAD. This says nothing about remote freshness. |
| Initial worktree | 20 tracked modified paths and 1 untracked supplied prompt; no staged paths were shown by `git status --short`. Existing edits were preserved. |
| Relevant dirty source | `src/modules/task-workflow/task-workflow.ts`, `src/modules/resource-selection/resource-selection-store.ts`, `src/infrastructure/socket/peer-gateway.ts`, plus tests/docs/prompts. The task-workflow wire-type change is behaviorally significant drift. |
| Authorized writes | This new report only. |
| Read scope | Local tracked source, tests, manifests, architecture/testing/operations docs, scripts and tracked local demos. No credentials, live state or database files read. |
| Commands | Read-only `git status --short`, `git diff --name-only/--stat`, `git rev-parse`, targeted `rg`, `nl -ba` and bounded `sed`/`cat` on the files cited below. No npm or runtime commands. |
| Limitations | No execution evidence, no remote query, no external AA/CDC/EServer/SPA/ARM consumer inventory, no database inventory, no route runtime re-verification. Search results are local-repository evidence only. |

Prompt and repository guardrails were read: `prompts/SRD_0_ARCHITECTURE_IMPACT_DISCOVERY_CODEX_PROMPT.md`, `AGENTS.md`, and `docs/architecture/PROJECT_STATE.md`. PROJECT_STATE describes the Naming Migration closure and predates this SRD. No contradiction there changes the authorized SQLite-removal scope.

## 3. Decision traceability

| Decision | Accepted scope | Local evidence / discovery implication |
|---|---|---|
| SR-001 | Remove SQLite completely | Active runtime: `src/infrastructure/database/{sqlite,persistence}.ts`, `src/app/create-app.ts`; package dependency and preflight remain. Remove SQLite technology references only where active behavior/tooling requires it; historical evidence remains historical. |
| SR-002 | Selective persistence removal | Seven SQLite tables belong to M14–M16; M12/M13 file stores are separate. Preserve file persistence and reliability. |
| SRG-01 | Retire Generic Session M14 | `src/modules/session/{contracts,session}.ts`; three session endpoints and app handle. Distinct from CDC protocol and Socket.IO `/session`. |
| SRG-02 | Retire Process Usage M15 | `src/modules/process-usage/{contracts,process-usage}.ts`; two endpoints and app handle. Distinct from lifecycle diagnostics. |
| SRG-03 | Retire AA Catalog M16 | `src/modules/aa-catalog/{contracts,sqlite-catalog}.ts`; six read endpoints, DTOs, concrete adapter and five test-facing upserts. Distinct from M12 `AaTask` workflow use. |
| SR-003 | Retire M17, do not repurpose | Checker maps only SQLite files to M17 (`scripts/check-architecture.ts:54`); remove mapping rather than reassigning shared helpers. |
| SR-004 | Preserve independent persistence | `task-file-store.ts:45-54`, `resource-selection-store.ts:52-60`, shared atomic store and runner implement separate paths; preserve locations, formats and guarantees. |
| SR-005 | Retire IDs; no renumber/reuse | Checker ownership map currently assigns M14–M17 at lines 51–54; target leaves gaps and starts any new ID at M19. |
| SR-006 | Leave legacy data untouched | Discovery did not inspect database files. Removal must not open, create, migrate, archive, truncate or delete any existing database/WAL/SHM. Runtime proof belongs to isolated future verification. |
| SR-007 | Remove public contracts completely | `ApplicationInstance`, `ApplicationConfig`, overloads, M07 dependencies/routes and repository exports all expose retired concepts. Expected post-removal route handling is unmatched routing after auth, not a legacy compatibility response. |
| SR-008 | Clean config/dependencies/tooling | M01 consumes `DB_PATH`/`ENABLE_SQLITE`; root manifest has `better-sqlite3` and types; profile runner and ARM package script include SQLite-specific steps. Preserve general package generation and non-SQLite requirements. |
| SR-009 | Comprehensive regression verification | Manifest and policy enumerate fast/integration/full coverage. No verification run in SRD.0; future results must be measured, not inferred here. |

## 4. Removal inventory and impact matrix

Disposition labels are proposal categories only: REMOVE, ADAPT, PRESERVE, INVESTIGATE.

| Path / symbol (line evidence) | Module / current role | Disposition | Retained behavior / risk |
|---|---|---|---|
| `src/infrastructure/database/sqlite.ts:6-44` `openDatabase` | M17 driver load, WAL/foreign-key pragmas, DDL, close-on-init-failure | REMOVE | Seven tables and three indexes listed below are all created here. Never open live data to prove deletion. |
| `src/infrastructure/database/persistence.ts:4-15` `openPersistence` | M17 optional handle and idempotent close | REMOVE | M02 close/rollback ordering must still attempt cleanup of CDC, peer/socket and HTTP resources and preserve aggregated failures. |
| `src/modules/session/contracts.ts:2-8`; `session.ts:4-13` | M14 model/port and SQLite repository | REMOVE | Does not include CDC or Socket.IO session semantics. |
| `src/modules/process-usage/contracts.ts:1-8`; `process-usage.ts:4-17` | M15 DTO/port and SQLite repository | REMOVE | M18 diagnostics remain; local direct repository consumer inventory does not establish external non-use. |
| `src/modules/aa-catalog/contracts.ts:1-41`; `sqlite-catalog.ts:11-63` | M16 DTOs, six readers and five upserts | REMOVE | `AaTask` catalog rows are unrelated to M12 task workflow. No production upsert caller found in the checked source; tests use adapter and `app.catalog`. External usage unknown. |
| `src/app/create-app.ts:6-9,24-45,56-80,100-101,175-205` | M02 imports, app handles/config, overloads, persistence acquisition, repository construction, cleanup | ADAPT | Preserve `createApplication` as composition root, coordinator/readiness, one-shot listen/close, construction rollback, startup rollback, admission/drain and error aggregation. Removing DB construction changes which constructor failures remain; keep unrelated route/socket construction failure coverage. |
| `src/infrastructure/http/http-api-router.ts:3-6,15-56` | M07 ports and five session/usage routes; messages route shares router | ADAPT | Remove retired ports/routes/validation schemas while preserving `/messages`, admission, validation/error semantics and route ordering. |
| `src/infrastructure/http/aa-catalog-router.ts:6-47` | M07 six read routes, mounted conditionally | REMOVE | No catalog APIs remain; ordinary unmatched behavior expected. |
| `src/infrastructure/http/http-server.ts:2-16,20-28` | M07 dependency shape, health/auth/router/error pipeline | ADAPT | Keep health, body parser, auth-before-route ordering, sender/admission and error handler. |
| `src/infrastructure/http/http-middleware.ts:21-27` | M07 key auth plus `SQLITE_DISABLED` exact-path gate | ADAPT | Remove SQLite gate and matching logic. Auth remains ahead of routes. Authenticated removed routes should reach ordinary 404; not runtime verified. |
| `src/config/configuration.ts:6-18,38-55` | M01 resolved `dbPath`/`enableSqlite` from `DB_PATH`/`ENABLE_SQLITE` | ADAPT | Preserve PORT, HOST, API, CDC, peer and shutdown configuration. Legacy env vars no longer consumed, no warning/alias. |
| `package.json:5-7`; `package-lock.json:15-28,478-482,637-647` | Runtime optional native addon and dev types / resolved lock entries | ADAPT | Remove direct and transitive SQLite dependency evidence without disturbing remaining dependency graph; no lockfile mutation or install was done. |
| `scripts/sqlite-preflight.mjs:1-17`; `scripts/run-test-profile.mjs:19-35` | Native preflight and integration/full profile gate | ADAPT | Remove SQLite-only preflight; preserve Node baseline constraints, architecture/type/build, selected tests and playground runs. |
| `scripts/package-for-arm.sh:101-135` | AS packaging removes optional addon and regenerates lock | ADAPT | Retain package generation and isolated package install capability; remove only SQLite exclusion/regeneration logic if no longer needed. ARM repo/runtime is UNKNOWN. |
| `scripts/check-architecture.ts:51-54` | M14–M17 explicit ownership mapping | ADAPT | Remove retired mappings; preserve M01/M02/M07 and M12/M13/shared mappings and all checker rules. No ID reuse. |
| `src/shared/persistence/atomic-json-record-store.ts`, `reliable-outbox-runner.ts` | Shared retained record/recovery, lock and bounded delivery machinery | PRESERVE | Consumed by M12/M13. Not M17 by source ownership, despite ambiguous architecture prose. |
| Test files and manifest listed in §8 | Mix of retired-only and retained M02/M05/M07/M12/M13/transport behavior | ADAPT / REMOVE | Per-file findings below; do not drop retained lifecycle, auth, recovery, feature-mode or workflow coverage along with SQLite setup. |

**SQLite schema ownership (source evidence: `sqlite.ts:19-36`):** tables `Session`, `ProcessUsage`, `AaConnection`, `AaBrowser`, `AaExtension`, `AaActivity`, `AaTask`; indexes `idx_process_usage_pid`, `idx_aa_activity_extension`, `idx_aa_task_extension`. WAL and foreign-key pragmas are initialized there. No table/index ownership appears in M12/M13 stores.

**Export surface:** No root `src/index.ts` exists (targeted file listing); repository-facing source exports are direct module imports. M14/M15 files re-export neutral contracts from adapter paths (`session.ts:4`, `process-usage.ts:4`). M16 contract and adapter are directly imported by M07/M02/tests. `ApplicationInstance.sessions/usage/catalog` and overloads are the explicit M02 public handles. Tests and potential external direct imports make this a source compatibility break; external package consumers are unknown.

## 5. Public routes, configuration, consumers

| Method / route | Current owner/evidence | Impact |
|---|---|---|
| GET `/api/sessions` | M07 `http-api-router.ts:31-33` | Remove |
| GET `/api/sessions/:id` | `http-api-router.ts:34-41` | Remove |
| POST `/api/sessions` | `http-api-router.ts:43-46` | Remove |
| GET `/api/process-usage` | `http-api-router.ts:48-51` | Remove |
| POST `/api/process-usage` | `http-api-router.ts:53-56` | Remove |
| GET `/api/aa` | M16 router `aa-catalog-router.ts:10-16` | Remove |
| GET `/api/browser/all` | `aa-catalog-router.ts:17-18` | Remove |
| GET `/api/browser/:id` | `aa-catalog-router.ts:19-25` | Remove |
| GET `/api/extension/:id` | `aa-catalog-router.ts:40-45` | Remove |
| GET `/api/extension/:id/activities` | `aa-catalog-router.ts:26-32` | Remove |
| GET `/api/extension/:id/tasks` | `aa-catalog-router.ts:33-39` | Remove |

Current HTTP stack installs health, then `/api` auth/SQLite gate, then router, then error handler (`http-server.ts:20-28`). Auth rejects missing/wrong `x-api-key` with 401 before SQLite-disabled handling (`http-middleware.ts:21-27`). The handoff requires the gate disappear, retaining auth ordering. Ordinary Express unmatched routing is expected to yield 404 after successful auth; this is an inference from middleware/router structure and approved target, not runtime verification. Existing absent-capability and disabled-SQLite response behavior is intentionally superseded.

Current config keys: `DB_PATH` default `./data/app.db`; `ENABLE_SQLITE === '1'`; `ApplicationConfig.dbPath` and `.enableSqlite` (`configuration.ts:10-14,42-45`; `create-app.ts:31-45`). Remove those keys/fields; preserve other config behavior.

Local consumer evidence: `README.md:34-38`, `docs/HTTP_API_DESIGN.md:7-34`, HTTP/repository/integration tests and older compatibility docs describe these routes. `docs/architecture/DEPENDENCY_INVENTORY.md:78-90` records app handles and notes external unknown. AA playground flows found in `testing/` concern VM inventory and M13 resource selection, not M16 SQLite catalog; `testing/README.md:521` explicitly says the resource-selection catalogs are demo data and not backed by this database. No local CDC/EServer/SPA demo source reference to these REST APIs was found by targeted route searches. This is not evidence that external clients do not call them. External AA, CDC, EServer, SPA, ARM and other package consumers: **UNKNOWN**.

## 6. Persistence isolation and lifecycle

M12 `JsonTaskFileStore` uses `AS_TASK_STORE_DIR` or `./data/tasks`, creates task/result JSON files, and gives the shared atomic store a `.r7.5-outbox` subdirectory (`src/modules/task-workflow/task-file-store.ts:45-79`). M13 `JsonResourceSelectionStore` uses `AS_SELECTION_STORE_DIR` or `./data/resource-selections` and has independent receipts/status/outbox (`resource-selection-store.ts:42-73`; `R7_5_RELIABILITY_OUTBOX.md:5-7`). These paths are unrelated to `DB_PATH`.

`peer-gateway.ts:90-98,118-146` constructs both stores and workflows with split reliability capacity. M12/M13 workflows own runners (`task-workflow.ts:42-65`, `resource-selection-workflow.ts:27-48`); M05 starts them and coordinates connection readiness (`peer-gateway.ts:228-240`). Lifecycle starts recovered stores before bind, activates delivery after bind, and drains admitted work before transport/store cleanup according to R7.6 (`R7_6_LIFECYCLE.md:7,11`; policy lines 31-35). Preserve ACK timing/meaning, dedupe, retry/uncertain-state recovery, filesystem formats/locations, locking and writer ownership.

Shared implementation is visibly under `src/shared/persistence/atomic-json-record-store.ts` and `reliable-outbox-runner.ts`, imported directly by M12/M13 stores/workflows. M12/M13 files themselves are checker-owned by their domain modules (`check-architecture.ts:49-50`). Thus `MODULE_BOUNDARIES.md:25,29` wording that “M17 file stores enforce” a writer lock is inconsistent with source ownership: M17 owns SQLite; M12/M13 stores and shared helper own the file records/lock. Report this ambiguity; do not move or consolidate helpers.

## 7. Dependencies, build, package and CI

- Root `package.json:5-7` declares optional `better-sqlite3` and dev `@types/better-sqlite3`; lockfile contains direct entries plus resolved addon package at lines 478 and 637. A complete future dependency check must inspect the regenerated lock graph, not just root declarations.
- `sqlite-preflight.mjs` requires addon loading and in-memory open/query/close. Integration/full profiles invoke it (`run-test-profile.mjs:23-35`). Manifest property `nativeSQLite` is validator/profile metadata (`scripts/test-manifest.mjs:11,44`); SQLite-specific usages must be removed while preserving generic filesystem/listener/process requirements.
- `scripts/package-for-arm.sh:117-131` removes addon from copied manifest and regenerates package lock for AS. External ARM tooling, repository and runtime availability were not inspected and are UNKNOWN. Package generation is explicitly retained.
- The source has `build`, `typecheck`, architecture and fast/integration/full package scripts in `package.json:3`; full profile includes architecture, typecheck, build, backend and playground. No `.github` workflow files were found by local `find`; repository CI execution/configuration is not evidenced locally.
- No npm commands, installs, package generation, typecheck/build, architecture checker, or CI runs were performed. Package feasibility is not a PASS.

## 8. Test impact and retained coverage

The tracked manifest is `docs/testing/R7_7_TEST_MANIFEST.json`; policy and runner: `docs/architecture/R7_7_TEST_ARCHITECTURE_POLICY.md`, `scripts/run-test-profile.mjs`. Existing full test command discovers `tests/*.test.ts`; profiles select manifest entries. SQLite native setup appears in many tests even when the tested assertion is retained behavior.

| Test / evidence | Manifest membership | Classification and retained coverage |
|---|---|---|
| `session-repository.test.ts`, `process-usage-repository.test.ts`, `aa-catalog.test.ts` | Full; retired IDs, native SQLite; repository tests also filesystem/listener | REMOVE retired repository/schema assertions. Any non-retired construction/lifecycle assertion embedded in same file must be moved/preserved only if evidence warrants it. |
| `session-http-api.test.ts`, `process-usage-http-api.test.ts`, `aa-catalog-boundary.test.ts` | Integration + full, mixed M07 and retired modules (boundary includes M17); listener | ADAPT auth-first/route middleware coverage to assert auth remains and authorized removed routes are ordinary unmatched; remove retired validation/body/repository expectations. No runtime assertions were run. |
| `http-gateway.test.ts` | Integration + full; M07; no native SQLite | ADAPT test currently asserts auth 401 then `SQLITE_DISABLED` 503. Keep auth-first and `/messages`/health/error behavior, replace obsolete disabled-mode expectation with new route behavior as appropriate. |
| `configuration.test.ts` | Fast + full; M01; no native | ADAPT remove `DB_PATH`/`ENABLE_SQLITE` expectations, retain PORT/HOST/CDC/API/shutdown and feature config assertions. |
| `application-surface-compatibility.test.ts` | Full; M02/M05/M07/M08/M14–M16; native, listener | ADAPT heavily mixed: drop SQLite overload/handles/repository assertions; preserve duplicate route construction error, construction cleanup, app surface for retained members, optional CDC/test-peer modes, transformation registration and listen/close lifecycle. |
| `application-lifecycle.test.ts`, `application-peer-ack-drain.test.ts` | Integration + full; M02/M05/M12/M13/M17; SQLite flagged native | ADAPT to remove SQLite setup/close assertions while retaining startup ordering, readiness, construction/startup failure cleanup, drain/admission/ACK, runner settlement, independent cleanup and bounded shutdown. `application-startup-rollback.test.ts` is mixed retained lifecycle coverage and has no SQLite requirement in manifest. |
| `integration.test.ts` | Full; M02/M05/M07/M09/M10/M12/M13; native SQLite flagged | ADAPT: remove session/process route calls but preserve message flow and add/retain independently scoped M12/M13 durable workflow verification elsewhere. |
| `reliable-outbox.test.ts`, `reliable-crash-process.test.ts`, `resource-selection-persistence.test.ts`, `resource-selection-store.test.ts`, `task-workflow.test.ts`, `task-received-routing.test.ts`, M12/M13 snapshots and routing tests | Mostly full; retained IDs; some manifest rows incorrectly/over-broadly flag native SQLite/M17 | PRESERVE retained persistence, dedupe/recovery, crash/uncertain state, runner lease/lock, F08/F09, M13 receipt, snapshot, routing and ACK assertions. Correct metadata only when implementation phase is authorized. |
| Test profile preflight | Integration/full, invoked before backend tests | REMOVE native-only preflight after dependency removal; preserve all other gates and complete suite profiles. |

Coverage gap to resolve in authorized SRD.1: map each `nativeSQLite: true` fixture to actual dependency, separating obsolete setup from retained listener/filesystem/process requirements; audit test source and `R7_7_TEST_INVENTORY.json` stale responsibility IDs and parser-generated signals. No replacement test suite was written. Exact future counts and PASS status are unknown.

## 9. Architecture governance and supersession inventory

| Active reference | Current text/effect | Required later disposition |
|---|---|---|
| `MODULE_BOUNDARIES.md:22-25,29` | M14/M15/M16/M17 APP and current ownership; M07 consumes ports; ambiguous file-lock ownership wording | Mark M14–M17 retired only after implementation; preserve M12/M13 TBD and correct SQLite-vs-file helper ownership. |
| `DEPENDENCY_INVENTORY.md:26-29,47-48,59,70,78-90,102,105` | Ownership/edges and handles; D2 audit says retain surface pending explicit decision | Supersede scoped SQLite/M14–M17 statements and remove mappings after code removal; external direct handle use stays unknown. |
| `ARCHITECTURE_DECISIONS.md:10-11,44-45,64,92-94` | ES-D04/05 TBD header, R7.3 disabled/status compatibility, R7.5-D06 preserve catalog, keep M12–M15 and M16 reader port | Explicitly supersede ES-D04/05, R7.3-D03/D04 only for retired routes/repositories, R7.5-D06 and affected R6 choices. Preserve unrelated R7.5 reliability and M12/M13 TBD decisions. |
| `R7_5_RELIABILITY_POLICY.md:148` | D06 preserves M16 catalog storage | Supersede only catalog clause; retain P01–P06 and D05 M09 fan-out. |
| `R7_6_LIFECYCLE_POLICY.md:19,23,35,57`; `docs/operations/R7_6_LIFECYCLE.md:7,11` | SQLite mode in readiness, disabled route mapping, close SQLite last, M17 in caller set | Remove SQLite lifecycle resource step and retired route compatibility; preserve one-shot readiness, admission, drain, deadline and aggregated cleanup ordering for remaining resources. |
| `R7_7_TEST_ARCHITECTURE_POLICY.md:9,25,45-59`; `docs/testing/R7_7_TEST_MANIFEST.json` and `R7_7_TEST_INVENTORY.json` | Native preflight/profile policy and retired responsibility IDs/SQLite metadata | Supersede native-specific requirements and revise manifest/inventory while preserving profile governance and retained assertions. |
| `TECHNICAL_DEBT.md` TD08/12/16/18/20 and R7.8 policy/inventory | SQLite validation/catalog and APP/TBD/external-consumer assumptions | Owner must decide which debt entries close, are superseded, or remain historical; SRD decision does not imply every linked report is rewritten. Keep historical reports unchanged. |
| `R8_0_ARCHITECTURE_OWNER_DECISION_POLICY.md:13,49,63` | Current baseline says M14/M15 APP and repeatedly cites native SQLite verification | Direct contradiction to accepted handoff; must not be silently carried into SRD.1. Confirmed as owner-review blocker for planning consistency. |

M14–M17 IDs remain reserved and retired after implementation, never reused/renumbered; M19 is the next available ID if future work needs one. M02 extraction remains deferred. Historical reports and prompts stay historical and untouched.

## 10. Removal and verification gate traceability

All gates below are **NOT RUN** in SRD.0.

| Gate | Discovery evidence / future proof needed |
|---|---|
| RV-01 | Manifest/lock evidence confirms addon today. Future isolated clean install and resolved graph scan required. |
| RV-02 | Source files and checker map located; future static negative scan and architecture checker required. |
| RV-03 | Eleven active route definitions and auth/gate ordering located. Future local authenticated and unauthenticated listener verification required; 404 expectation is not verified. |
| RV-04 | Handles, overloads and module contracts located. Future compile-time/public surface negative checks required. |
| RV-05 | M01 consumes both env vars and M02 consumes config. Future config behavior/type tests needed for remaining keys. |
| RV-06 | Native preflight, manifest metadata/profile runner and ARM exclusion found. Future source/profile/package review plus retained test coverage comparison required. |
| RV-07 | Existing commands are visible; none executed. Future clean install, typecheck, build and isolated startup required. |
| RV-08 | No data touched. Future isolated fixtures can prove application does not create/read/write/delete legacy database paths; live data remains out of scope. |
| V01 | This report supplies a static inventory; future negative scans for API/config/dependency/imports required. |
| V02 | Checker ownership/rules identified. Future checker run and cycle/mapping review required. |
| V03 | Build/profile commands identified. Clean install/typecheck/build/startup all NOT RUN. |
| V04 | Test suites, manifest and mixed coverage identified; no tests run. Future fast/integration/full and playground verification required. |
| V05 | Runtime flows have source-level feasibility evidence only. Isolated local loopback tests needed for CDC, peer identity, socket auth, HTTP, fan-out, ACK/delivery, transform, M12/M13 recovery/diagnostics/shutdown. |
| V06 | Packaging script exists. No ARM package generation or managed startup; isolated ARM tooling/runtime availability UNKNOWN. |

## 11. Risks, blockers and planning readiness

1. **Governance contradiction:** R8 policy and active architecture docs preserve M14/M15 APP and M16 storage; accepted SRD handoff removes them. SRD.1 must have an explicit owner-approved supersession trail and align active docs.
2. **Dirty source behavior:** local task workflow changes CDC/EServer envelope type strings to `automation.task.request/result`; tests/docs also have uncommitted edits. This change may alter retained protocol behavior and is outside the approved SQLite scope. Revalidate/resolve ownership before implementation; do not overwrite it.
3. **Compatibility unknown:** API routes, direct repository paths and `ApplicationInstance` handles are observable breaking removals. Local repository evidence cannot establish external non-use. Owner should confirm consumer review is sufficient before implementation authorization.
4. **Lifecycle risk:** delete only SQLite cleanup. Retain current drain and cleanup guarantees and test construction/startup failures without DB acquisition. Existing lifecycle docs encode close-order behavior that must be superseded deliberately.
5. **Verification constraints:** local fixture/runtime feasibility is source-evident, but no test/build/listener/ARM environment was exercised. Do not treat this report as a PASS for any gate.
6. **Data boundary:** legacy DB files and deployed state were intentionally not examined. They must remain untouched; absence of access is not proof of rollback compatibility.

No additional design decision appears necessary for the scoped removals because the twelve decisions are accepted. Owner review is needed for active-document supersession, dirty-tree task protocol drift, and external consumer risk. Recommendation stays **CONDITIONAL** until those are acknowledged for planning.

## 12. Worktree closure

Initial baseline was `main` at full HEAD `099f75a0fe273af3755925519b9d2df0799c3d13`, equal to the exploration SHA. Initial status showed the 20 pre-existing modified tracked paths and untracked supplied prompt; none was changed by this discovery. The only authorized addition is this report. No source, tests, scripts, manifest, configuration, active architecture document, historical report, database, or runtime state was modified. No staging occurred.

Final status check is recorded after report creation by the operator-facing session; expected delta from initial status is exactly this new untracked report. If any other path changed concurrently, treat it as external drift and preserve it. No tests/build/runtime gates were run. SRD.0 ends here; SRD.1 was not started.
