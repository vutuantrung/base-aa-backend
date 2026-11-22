# R7.7.A — Test Inventory, Responsibility Mapping & Verification Baseline

## Mission

Repository: `vutuantrung/base-aa-backend`  
Branch: `main`  
Expected HEAD: `b8560c5f354a3fab0550fe513293ead6142a7ccd`  
Phase: **R7.7 — Test Architecture & Organization**, Stage A (breadth-first discovery and decisions)

Build a complete, source-grounded inventory of existing automated verification and propose a maintainable test architecture. **Do not reorganize files, refactor fixtures or change production behavior in Stage A.** Stop for owner review of architectural decisions before implementation.

Read `AGENTS.md` if present; inspect `package.json`, `testing/package.json`, `docs/architecture/PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `ARCHITECTURE_DECISIONS.md`, `TECHNICAL_DEBT.md`, the committed R7.6.B final verification report, and current source/tests. Preserve the historical reports. First record actual HEAD, branch, worktree/index status; preserve unrelated changes. If HEAD differs, reconcile the diff and state any meaningful drift rather than assuming the expected source.

## Baseline constraints and existing evidence

- The owner accepted the scoped R7.6 implementation and authorized R7.7. R7.5 P01–P06, R7.6 D01–D06, R7.2–R7.4 compatibility decisions and deferred TD02, TD12, TD13, TD15 diagnostic work remain in effect.
- Historical reported full suite: **250/250 backend** and **32/32 playground** on Node **22.23.5**; this is a recorded baseline, not a fresh run. Independently verify when possible, including actual counts and failure details.
- Root `package.json` currently has `test: node --import tsx --test --test-concurrency=1 tests/*.test.ts`, `check:architecture`, `typecheck`, `build`; `engines.node` is `>=22`; `better-sqlite3` is an optional native dependency. The owner found three SQLite catalog failures when their terminal used Node 24; switching to Node 22 resolved them. **Do not assume this establishes a universal Node 24 compatibility claim or automatically tighten engines.**
- `PROJECT_STATE.md` is an historical checkpoint with pre-commit language. Update current state accurately without rewriting past reports. TD16 notes test/demo/app isolation risk; M12–M15 classifications remain TBD pending separate decisions.
- Do not make fake test counts, coverage percentages, durations, flaky-test claims or filesystem/API compatibility guarantees. Use evidence or label unknown.

## A01 — Complete test inventory

Enumerate every test file, test helper and fixture in root `tests/`, `testing/` and any other discovered test locations. Include test-only scripts, harnesses and architecture checks. Use repository search and actual test source, not filenames alone.

Produce a machine-readable **`docs/testing/R7_7_TEST_INVENTORY.json`** (or CSV if JSON becomes impractical), with one entry per test file and fields:

- `path`, `packageOrRunner`, `responsibilityIds` (M01–M18, SG02 or unknown), `businessFlows` (e.g. F08/F09/M09/M13, if supported), `testLayer` (unit/contract/integration/process/architecture/playground/mixed),
- `requiresNetworkListener`, `requiresChildProcess`, `requiresNativeSQLite`, `usesFilesystem`, `mutatesProcessEnv`, `usesProcessWideState`, `needsRealClock`, `fixtureDependencies`, `relatedSourcePaths`,
- `testCount` when reliably derived, `isolationRisk`, `evidence`, and unresolved classification notes.

Do not overstate static analysis. Record multi-responsibility and mixed-level tests explicitly; do not force arbitrary single labels. Separate actual source evidence from an inferred mapping. Include inventory totals, uncategorized files and checks that inventory has no missing/duplicate paths.

## A02 — Responsibility / coverage map

Construct `docs/testing/R7_7_RESPONSIBILITY_VERIFICATION_MAP.md` with a matrix for **M01–M18**, SG02, key flows and cross-cutting risks. Identify primary characterization, contract, integration and process-crash tests; gaps, redundant setup, high-value safety invariants and which tests should accompany future changes to a responsibility.

Map specific invariants: ACK-gated ingress, auth-first/disabled SQLite route matrix, M09 fail-fast and active sibling drain, F08/F09 and M13 idempotency, committed outbox exact ACK/quarantine/uncertain no-replay, writer locks, global attempt concurrency, process-kill recovery, M02 lifecycle shutdown, peer-ACK drain and late settlement. Preserve all approved behavior, including intentionally unresolved debts. Do not equate a passing test with universal correctness.

## A03 — Test isolation and instability investigation

Assess test independence (not merely placement): process.env changes, shared globals, ports, HTTP/Socket.IO servers, timers, randomness, temporary directories, native SQLite, asynchronous callbacks, cleanup hooks and child processes. Inspect recent R7.6.B tests and any intermittent failures. The owner confirmed three catalog failures were caused by running Node 24; full tests passed after reverting to Node 22. Record **environment mismatch** separately from reproducible flaky tests. Investigate the earlier reported transient 249/250 result only if logs/reproduction support it; do not assert its cause.

Prefer deterministic barrier-controlled tests; reject unbounded waits. Recommend minimal isolation improvements, but **do not implement them in Stage A**. If safe, measure fresh full-suite wall clock and representative targeted durations; give hardware/OS/runtime context and raw command/results. If tests require host listener permission, report blocked cases, not PASS.

## A04 — Execution profiles and Node/native dependency policy

Propose three developer/CI execution profiles without changing scripts yet:

1. **Fast:** isolated tests and lightweight architecture/type checking suitable for quick agent feedback;
2. **Integration:** local listener/native SQLite/Socket.IO and durable store integration, scoped by responsibility;
3. **Full:** complete backend + playground + crash/process verification and architecture/build gates.

For each profile specify precise proposed commands or file selection strategy, inclusion/exclusion rules, explicit requirements, runtime estimate only if measured, CI suitability, serial/parallel boundaries and fail-closed semantics. Avoid brittle glob patterns and false coverage. Keep `npm test` behavior backward compatible until owner approval.

Propose options for Node version enforcement: `.nvmrc`/`.node-version`, `engines`, `engine-strict`, preflight script, CI matrix, `better-sqlite3` install/rebuild checks. Evaluate trade-offs, and recommend a minimal **Node 22 baseline verification guard** with an explicit policy for testing other versions. Do not silently forbid Node 24 or make dependency changes without approval.

## A05 — Reusable fixtures and agent-friendly test selection

Inventory repeated fixtures, peer simulators, lifecycle helpers, database and temporary-store utilities. Propose explicit fixture ownership/lifetime/cleanup contracts and import boundaries, avoiding a monolithic shared harness. Show examples of mapping a changed production file/responsibility to a focused verification profile plus full gates before merge. Distinguish test selection recommendation from a complete dependency-accurate impact analyzer. No new framework or third-party dependency unless justified and approved.

## A06 — Decision package for R7.7.B

Write `docs/architecture/R7_7_TEST_ARCHITECTURE_POLICY.md` as a **PENDING OWNER APPROVAL** decision package with alternatives, trade-offs and recommendations for:

- D01: test classification and responsibility tagging;
- D02: isolation / fixture ownership and cleanup;
- D03: Fast/Integration/Full execution profiles and backward compatibility;
- D04: Node/native SQLite environment enforcement;
- D05: deterministic timing, listener/process testing and CI constraints;
- D06: source-to-test impact mapping for AI agents and coverage preservation;
- D07: migration strategy (incremental vs bulk) and guardrails against assertion loss.

Do not treat recommendations as approval. Prefer **breadth-first analysis** of all responsibilities before deep refactoring of one test area. Define Stage B acceptance checks and migration rollback strategy.

## Verification and reporting

Use Node 22.23.5 where available. Record `node --version` and `npm --version`. Run appropriate existing checks as feasible: `npm run check:architecture`, `npm run typecheck`, `npm run build`, `npm test -- --test-concurrency=1`, `npm --prefix testing run test:playground`, `git diff --check`. In a docs-only stage, explain any command not rerun and avoid implying fresh verification. Do not modify tests only to make a count pass. Do not overwrite or prune test history.

Create a root report: **`R7_7_A_TEST_INVENTORY_RESPONSIBILITY_MAPPING_REPORT.md`** with HEAD, exact changed files, inventory totals/uncertainties, source-to-test coverage matrix summary, environment results, isolation risks ranked by evidence, measured timing if any, seven pending decisions, residual R7.5/R7.6 safety constraints, and recommendation for R7.7.B. Update `docs/architecture/PROJECT_STATE.md` to the current actual HEAD/phase and adjust `TECHNICAL_DEBT.md` only if findings are independently grounded. Never rewrite historical report snapshots simply because their old HEAD is stale.

**Stop for owner decision. No production changes, no test moving/refactoring, no commit/push, no R7.8.**
