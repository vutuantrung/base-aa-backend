# R7.9.B — M02 Runtime Composition Boundary Implementation & Verification

**Codex execution checkpoint — Architecture-owner approved RC-D01–RC-D07**

- Repository: `vutuantrung/base-aa-backend`
- Branch: `main`
- Expected committed baseline: `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9` (`checkpoint R7.8`)
- Authoritative verification runtime: Node.js `v22.23.5`, npm `10.9.9`
- Mode: **ONE COMPLETE CHECKPOINT** consisting of characterization, at most one narrowly bounded private M02 seam, regression verification, and final report.
- **Do not commit or push. Do not begin R7.9.C or R7.10.** Stop for owner review.
- Every Codex instruction prompt must live in `prompts/`, never `docs/architecture/`.

## 0. Authority and decisions

The architecture owner approved:

| Decision | Accepted | Operational interpretation |
|---|---|---|
| RC-D01 | **A** | Internal, narrow responsibility cleanup only; no public, wire, feature or deployment-mode redesign. |
| RC-D02 | **A — SCOPED** | Characterize failure boundaries first; extract **at most one private M02 responsibility seam** only if equivalent acquisition, rollback, exceptions, and cleanup are proven. Otherwise NO source extraction. |
| RC-D03 | **A** | Preserve exact feature-gate and defaults matrix. No new flags, mapping facade or normalizations. |
| RC-D04 | **C** | **Defer** M18 logging/diagnostics changes. Do not change messages, redaction, `/health`, readiness or log ownership. |
| RC-D05 | **A** | Preserve all legacy exports/facades, utilities, MessageBus and public concrete handles. |
| RC-D06 | **A** | M12/M13 formal ownership **TBD**; no durable workflow, file/store/outbox/persistence movement or reclassification. M14/M15 **APP**. |
| RC-D07 | **A** | Parity matrix, focused tests and full gates. Full backend + playground verification is required, not fast-only. |

These choices extend, and do **not** override, R7.8 ES-D01–D08 and accepted C-D01=A, C-D02=A, C-D03=A. Preserve the documented direct import `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts`, automatic demo registration for direct `startApplication()` calls, and per-app registry.

The R7.9.A decision policy exists in the current local worktree and may not yet be committed. Read the local version. **Never replace approved decisions with the discovery document's older PENDING labels.**

## 1. Before editing: worktree and source verification (B01)

1. Read `AGENTS.md` if present and existing coding standards (Intent-Revealing Methods; Extract Method); read:
   - `docs/architecture/PROJECT_STATE.md`, `ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, `TECHNICAL_DEBT.md`;
   - `docs/architecture/R7_9_A_RUNTIME_RESPONSIBILITY_INVENTORY.md`;
   - `docs/architecture/R7_9_A_RUNTIME_CLEANUP_OPPORTUNITY_CATALOG.md`;
   - `docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md`;
   - `R7_9_A_APPLICATION_RUNTIME_CLEANUP_ARCHITECTURE_DISCOVERY_REPORT.md`;
   - accepted R7.8.C ADR, R7.8 final report, R7.5 P01–P06, R7.6 D01–D06, and R7.7 test/manifest policy.
2. Confirm `git rev-parse --abbrev-ref HEAD`, `git rev-parse HEAD`, `git status --short`, `git diff --name-status`, `git diff --cached --name-status`, `node --version`, `npm --version`.
3. Record **every pre-existing** staged, unstaged and untracked R7.9.A document and prompt. Preserve work exactly; do not reset, stage/unstage, overwrite unrelated edits, commit or push. If HEAD moved, compare current code against the expected baseline before deciding scope.
4. Inspect actual source and tests—not only discovery claims—especially:
   - `src/app/create-app.ts`, `src/app/lifecycle.ts`, `src/app/application-coordinator.ts`, `src/app/shutdown-signals.ts`, `src/main.ts`;
   - M05 socket attachment and peer gateway; M03/M04 connector; M17 `openPersistence`; M12/M13 runtime runners;
   - `tests/application-surface-compatibility.test.ts`, lifecycle, coordinator, startup rollback, socket/HTTP/API, outbox/process-crash and playground tests;
   - `docs/testing/R7_7_TEST_MANIFEST.json` and responsibility map.
5. Establish **before-change evidence**: `createApplication()` return shape/overloads, direct callers, default routes and module handles, exact import/dependency graph, startup/stop code order and observed test coverage.

### Known current code to verify, not assume

In the committed R7.8 source, `createApplication` acquires a persistence handle, creates app-local registries, repositories, HTTP server and sockets, conditionally connects to PServer, constructs the router and returns an object with `listen`/`close`. It has distinct paths for **synchronous construction exceptions**, **async startup failure rollback**, **normal close**, and **bounded shutdown timeout**. Its local closures (`cleanupResources`, `cleanupPromise`, `acquiredSockets`, `acquiredPServer`) have ownership and timing consequences. `startApplication` invokes `onCreated` before demo registration and before `listen` (the first two steps execute outside its listen-specific try/catch). These are compatibility obligations, not opportunities to silently clean up error handling.

## 2. Mandatory failure-boundary and contract matrix (B02)

**Produce a documented before/after parity matrix before performing any production extraction.** At a minimum include:

| Case | Required evidence / questions |
|---|---|
| Config validation before acquisition | Range/default/error type/message for `shutdownTimeoutMs`, `port`; config parsing `ENABLE_TEST_PEERS === '1'`, two booleans, SQLite defaults. |
| Persistence open or repository setup failure | Which resources were acquired; synchronous vs async error; what closes, in what order; cleanup exceptions and combined errors. |
| HTTP/socket attachment failure | `acquiredSockets` and `acquiredPServer` assignment timing; whether async socket closure is awaited or fire-and-forget in construction catch; error handling. |
| PServer connector creation failure | Existing conditions (`peerGateway && config.pserver`), connector cleanup ordering and thrown error identity. |
| `listen` success / duplicate calls | State machine, same-port idempotence, different-port errors, readiness transition and port 0 result. |
| Startup failure at peer runner start / HTTP bind / activation / PServer connect | Drain/admission fencing, no early close, shared bounded deadline, `rollbackAfterStartupFailure`, `closeFailedStartup`, error aggregation. |
| Close while created, starting, running, draining, failed or stopped | One-shot promise, precedence, peer runner wait, tracked operations, close order, timeout behavior and late settlement. |
| Simultaneous/duplicate `close` | Same promise and resource-close idempotence; no duplicate writer unlock. |
| `onCreated` throws or demo rule registration throws | Exact pre-listen exception boundary, absence/presence of cleanup and diagnostics; **characterize, do not fix**. |
| Top-level/nested gate mismatch; PServer config missing/present | Independent demo registration, peer gateway, connector paths; CLI vs programmatic behavior; direct `createApplication` vs `startApplication`. |
| M14/M15 and SQLite | API/auth/disabled-SQLite response semantics, repository lifetime, no schema/path change. |
| Power-loss/process kill vs graceful close | Report verified local semantics only; no exactly-once, remote peer, or deployed filesystem claim. |

For each row: source lines / existing test references; pre-extraction behavior; proposed seam effect; added or existing focused assertion; evidence status VERIFIED / INFERRED / GAP; hard stop condition. **Do not invent deterministic proof for injection points that do not exist.** Tests should be added for high-risk gaps only where test setup is honest, bounded and safe; avoid changing current implementation merely to make testing easier.

## 3. One-private-seam selection and implementation gate (B03)

Inspect the R7.9.A opportunity catalog's **RC-01** and candidate M02 responsibilities. Pick **one and only one** potential private seam by evidence and engineering benefit (clear owner, cohesive operation, less mixed responsibility, clear call boundary, easier human comprehension). Candidate exploration may include a cohesive *pure construction value/helper* or a *narrow resource-acquisition grouping*, but **do not precommit to these**. They may be unsafe if they disturb mutable closure capture, acquisition sequencing or cleanup.

Write a short pre-implementation decision record in `docs/architecture/R7_9_B_M02_PRIVATE_SEAM_DECISION.md` including:
- Current owner / paths; candidate exact before/after call boundary; what moves and what remains; rejected alternatives and reasons;
- source-level dependency direction and whether this is a *real* responsibility extraction, rather than a simple file relocation or wrapper with unchanged complexity;
- all reachable `return`, error, callback and cleanup paths and who owns each resource before/after;
- why public `ApplicationInstance`, overloads, existing exported helpers/types, `startApplication` and events remain unchanged;
- explicit parity evidence with test names and rollback delta;
- one of **ELIGIBLE FOR ONE PRIVATE EXTRACTION** or **DEFERRED — EQUIVALENCE NOT PROVEN**.

**Hard gate:** Only implement when the candidate can retain behavior exactly without API widening, changes to acquisition/close/rollback/exception timing, additional asynchronous boundaries, behavior-sensitive `try/finally` movement, changed error aggregation, implicit calls, ambient globals, new DI/container architecture or new dependencies. Preserve the original await/fire-and-forget semantics; do not 'fix' existing imperfections under cleanup approval.

If no candidate passes, perform **zero production changes**; complete the decision record, evidence matrix, focused characterization tests if justified, and report an intentionally deferred seam. **Do not choose a more aggressive seam just to deliver code.**

If eligible, extract exactly **one private responsibility** with intent-revealing naming and the smallest practical diff. Keep source boundaries and exports stable. `src/app/lifecycle.ts` must retain its accepted demo import. Keep signals in `main.ts` and M02 lifecycle coordination. No move or reclassification of M12/M13 or M14/M15. Do not extract every helper into a new module, split M02 wholesale, or introduce a generalized runtime composition framework.

## 4. Behavior characterization and tests (B04)

- Add narrowly focused tests **before** changing implementation when feasible, then rerun after for the selected seam. Capture exact ordering and type/error/message behavior where observable without modifying underlying contracts.
- Preserve every existing test and assertion; do not weaken, skip, rewrite around the new structure, reduce coverage, or rely solely on mocks for durability/lifecycle semantics.
- Prioritize startup rollback, multiple listeners, close/reentry, peer admission/drain, PServer gateway conditions, SQLite API matrix and direct caller behavior as relevant to the one seam.
- For any new `*.test.ts` file, update `docs/testing/R7_7_TEST_MANIFEST.json`, responsibility map and profiles according to R7.7; keep `npm test` original serial semantics. When only adding assertions to existing files, document why no manifest change is required.
- Do not alter logging messages, redaction, `/health`, readiness endpoints, global signal ownership, error handling or legacy exports as side effects.

## 5. Preserved safety invariants and hard NO-GO areas

**R7.5 P01–P06:** unchanged durable receipt, ACK identity and conservative uncertainty, no unsafe replay, bounded attempts, same-key transform caveat, quotas, no stale-lock auto-removal, OS/in-process writer ownership, no power-loss/exactly-once promises; keep store dirs/files, schema and persistence behavior.

**R7.6 D01–D06:** unchanged coordinator admission/readiness, tracked nested/fanout work, one-shot monotonic default 15s deadline, early/late settle semantics, shutdown/rollback error paths, peer waiter/drain handling, PServer/sockets/SQLite close order, signal shutdown and `closeFailedStartup` behavior.

**R7.7:** preserve architecture checks, native SQLite preflight, test manifest, responsibility map, additive fast/integration/full test profiles, original `npm test`, Node 22.23.5 CI baseline and independent 32-test playground (counts are baseline, not future guarantees).

**R7.8:** preserve ES-D01–D08; C-D01=A/C-D02=A/C-D03=A; documented M02→`src/examples/pserver-to-aaui.ts` compatibility edge, implicit `startApplication` registration, app-local `TransformationRegistry`, `onCreated`-before-registration-before-`listen`, top-level/nested flag distinction; M12/M13 TBD, M14/M15 APP, TD16 remains OPEN.

**RC-D03=A/RC-D04=C/RC-D05=A/RC-D06=A:** no gate redesign, logging/health changes, facade/public API removal or M12/M13 persistence movement. No feature flag renaming/aliasing, new external dependencies, production protocol changes or database migrations.

On breach or unresolved behavior evidence: stop the affected extraction; leave safe characterization/docs, mark **NO-GO for code extraction**, and identify a separately approvable ADR, not an undocumented workaround.

## 6. B05 — Full verification and audit

Use selected Node `v22.23.5` / npm `10.9.9`. Verify host capabilities before claiming the following results. Capture exact commands, exit codes, test counts, skipped tests and environment limitations:

1. `git diff --check` and `git diff --cached --check`; record baseline and current dirty paths.
2. `npm run check:architecture` — baseline was 59 files / 145 edges, zero runtime **file** SCC; existing module aggregate SCC is historical. New module/file requires legitimate mapping, **no exemption weakening**.
3. `npm run test:manifest` — baseline 55 selected/discovered files (50 backend, 5 playground).
4. `npm run typecheck` and `npm run build`.
5. Relevant focused characterization tests for the selected seam and startup/rollback/close/peer/config/SQLite API integration.
6. `npm run test:fast` and `npm run test:integration`.
7. `npm run test:full` — mandatory complete backend + playground suite, native SQLite preflight, architecture/build gates; baseline was 255/255 backend and 32/32 playground, no skips.
8. `npm test -- --test-concurrency=1` or the equivalent unchanged original serial backend command; report exact effective invocation and counts.
9. Check added and removed exports, original assertions, source imports, construction/readiness ordering, output packaging, test selections, registration order and cleanup behavior. Compare **before and after** source and run evidence, not counts alone.

If permission limits (`EPERM` from `git ls-files`, socket listeners, process spawn) block a sandbox run, record **BLOCKED** and use permitted host execution only if available. Do not report a failed run as PASS, silently skip tests, or call intermittent red runs green without explaining reruns. Do not contact external production peers.

## 7. Deliverables and reviewer report (B06)

Create in repository:

1. `docs/architecture/R7_9_B_M02_FAILURE_BOUNDARY_PARITY_MATRIX.md` — complete case matrix with actual source/tests and after-change verification, including unverified gaps.
2. `docs/architecture/R7_9_B_M02_PRIVATE_SEAM_DECISION.md` — candidate seam, accepted/deferred eligibility, ownership and rationale; not an ADR pretending owner approved a public contract change.
3. `R7_9_B_M02_RUNTIME_COMPOSITION_BOUNDARY_IMPLEMENTATION_VERIFICATION_REPORT.md` — **single final report**:
   - committed baseline SHA, actual initial/final worktree and preserved unrelated R7.9.A work;
   - explicit trace of RC-D01=A, D02=A(scoped), D03=A, D04=C, D05=A, D06=A, D07=A;
   - single seam location and precise before/after graph **or** why source extraction was intentionally deferred;
   - resource acquisition, startup/normal close/rollback/error parity with exact examples/tests;
   - changed source/docs/tests, exports, imports, manifest/profiles and rollback steps;
   - results with Node/npm versions, precise test numbers, exit codes, native/host constraints, any intermittent failures and residual unknowns;
   - evidence-limited **GO / CONDITIONAL GO / NO-GO** recommendation for owner review;
   - explicit note R7.9.C and later checkpoints are not authorized.
4. A concise R7.9.B status note in `docs/architecture/PROJECT_STATE.md` and a factual update to `TECHNICAL_DEBT.md` **only if** warranted. Keep TD16 and the other unresolved debts open, and historical reports unchanged.
5. Update R7.9.A decision policy to **OWNER APPROVED** for RC-D01–D07 without changing original option meanings; note D02's scoped eligibility gate and D04=C. Do not rewrite historic discovery results or mistakenly mark all RC opportunities completed.

**No commit, no push. Stop after final report for architecture-owner review.** The implementation checkpoint is successful if it provides trustworthy parity evidence and either one safe private extraction **or** a justified, documented no-extraction decision. A large refactor without proven behavior equivalence is a failure, even if the full test suite passes.
