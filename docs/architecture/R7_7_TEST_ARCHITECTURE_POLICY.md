# R7.7 Test Architecture Policy — Pending Owner Approval

**Status: PENDING OWNER APPROVAL.** This Stage A package records alternatives and recommendations only. It authorizes no Stage B file movement, fixture refactor, script change, runtime-policy change or production change. Current scripts and test layout remain as-is until the owner selects decisions.

## Context and constraints

Current verification consists of 49 backend Node test files (250 registered tests), five playground Node test files (32 tests), source ownership enforcement in `scripts/check-architecture.ts`, TypeScript checks/build, and child-process crash tests included in the backend suite. See the [test inventory](../testing/R7_7_TEST_INVENTORY.json) and [responsibility map](../testing/R7_7_RESPONSIBILITY_VERIFICATION_MAP.md).

Preserve approved R7.2–R7.6 behavior, including R7.5 P01–P06 and R7.6 D01–D06: exact ACK contracts, ACK-gated ingress, no unsafe replay, quarantine and uncertain-state recovery, no stale lock auto-removal, current quotas/dedupe behavior, M09 fail-fast/partial fan-out, one 15-second default M02 deadline and writer ownership until potential mutators settle. TD02, TD12, TD13 and broad TD15 diagnostics remain deferred/open. M12–M15 classification remains TBD. Keep `npm test` behavior backward compatible during any approved migration.

## D01 — Classification and responsibility tags

**Option A — Explicit responsibility manifest (recommend).** Keep a maintained JSON or TypeScript map with test path → one or more M01–M18/SG02 responsibilities, flows, layer and requirements. Review updates with test additions/moves.

**Option B — Inline comments/tags in each test file.** Close to tests and locally readable, but duplicates metadata, makes broad reports harder, and tag syntax can drift.

**Option C — Infer tags from filenames/imports.** Lowest authoring cost, but imports do not establish tested behavior and cross-module flows are easy to misclassify.

Recommendation: D01=A, with a small schema and required multi-responsibility support. Keep source evidence and inferred mapping distinct. Do not tag tests with only a single responsibility where the assertions cross module boundaries. Unknown/TBD is a valid value. Stage B should validate that every discovered test file has one manifest entry and no duplicate paths; it must not claim assertion-level coverage.

## D02 — Isolation and fixture ownership

**Option A — File-local fixtures with explicit cleanup (recommend as default).** Keep scenario-specific setup beside the tests; use reusable narrow support modules only when ownership and lifetime are shared.

**Option B — Shared per-domain fixtures.** Extract repeated peer/store/SQLite fixtures into `tests/support/<domain>` with owner, lifecycle, bounded wait and cleanup contracts. Reduces drift but creates coupling and can obscure scenario requirements.

**Option C — One global harness.** Most setup reuse but creates hidden global state, broad import coupling and fragile fixture interactions; not recommended.

Recommendation: D02=A+B, no omnibus harness. A fixture that starts a server owns its close operation; each test owns unique temporary state; environment mutation restores the prior value; child helpers own bounded IPC and termination; fake stores are deterministic and do not silently use real time. Do not extract fixtures only to reduce lines. Require evidence of duplicated setup and a direct lifecycle contract before extraction.

## D03 — Fast, Integration and Full profiles

**Option A — Add separate npm scripts while retaining current `npm test` (recommend).** `test:fast`, `test:integration`, `test:full` are additive; `npm test` stays the current serial backend command.

**Option B — Change `npm test` to a fast subset.** Faster default but silently changes expected completeness and can make CI/local usage miss regressions; not recommended.

**Option C — Use labels and a custom selector.** Flexible but adds selector behavior and maintenance before there is evidence glob-based selection is insufficient.

Recommendation: D03=A initially, with explicit maintained test-file lists or a validated manifest. Do not rely on broad brittle filename globs for safety-critical subsets. Profiles are selection convenience, not complete change impact analysis.

Proposed profile contents and commands (no scripts are added in Stage A):

| Profile | Proposed command/selection | Includes / excludes | Requirements and boundaries |
|---|---|---|---|
| Fast | `npm run check:architecture && npm run typecheck && node --import tsx --test --test-concurrency=1 tests/configuration.test.ts tests/application-coordinator.test.ts tests/routing.test.ts tests/transformation-executor.test.ts tests/peer-destination-policy.test.ts tests/peer-directory.test.ts tests/peer-message-handler.test.ts tests/peer-message-service.test.ts tests/resource-selection-workflow.test.ts` | Deterministic unit/contract core. Excludes listener, native SQLite, filesystem crash and playground tests. The current architecture command is presently red for the unmapped lifecycle seam and must not be hidden by profile changes. | Node 22.23.5 baseline; serial initially to preserve state isolation. No runtime estimate claimed for this proposed list. Suitable for quick local/agent feedback after owner approves and architecture check is resolved. |
| Integration | `node --import tsx --test --test-concurrency=1 tests/aa-catalog-boundary.test.ts tests/application-lifecycle.test.ts tests/application-peer-ack-drain.test.ts tests/application-startup-rollback.test.ts tests/http-gateway.test.ts tests/session-http-api.test.ts tests/process-usage-http-api.test.ts tests/reliable-outbox.test.ts tests/resource-selection-persistence.test.ts tests/task-received-routing.test.ts tests/reliable-crash-process.test.ts` and `npm --prefix testing run test:playground` | Local Socket.IO/HTTP, SQLite, durable stores, crash process and playground selected coverage. Explicit lists must be owned in a manifest; this sample is not claimed complete for every module. | Node 22.23.5; optional native SQLite present for database scenarios; local listener permission; temp filesystem; child processes. Keep process-crash serial and isolated. Any skipped requirement is reported BLOCKED, never PASS. |
| Full | `npm run check:architecture && npm run typecheck && npm run build && npm test -- --test-concurrency=1 && npm --prefix testing run test:playground` | All current backend tests, all playground tests, architecture and compiler/build gates. | Node 22.23.5 baseline; native SQLite loadable; loopback listeners; temp filesystem; child processes. Backend is already serial. Do not parallelize shared-runtime suites until isolation evidence supports it. Fail closed on missing native module, listener denial or any test failure. |

Runtime estimates are not asserted for proposed future profile selections. The observed full commands in this Stage A run are recorded in the report.

## D04 — Node and optional native SQLite policy

**Option A — Pin the baseline verification job only (recommend).** CI selects Node 22.23.5; no `engines` change is made. A separate explicit job may explore another Node major.

**Option B — Add `.nvmrc` / `.node-version`.** Easier local selection but only effective when tools honor the file; pinning patch can appear to mandate a runtime outside CI.

**Option C — Change `engines`, enable `engine-strict`, or fail all local commands off one version.** Stronger enforcement, but could reject supported deployments and overstate current Node 24 evidence.

**Option D — Preflight full verification for Node/native-addon load.** Fails early when the optional `better-sqlite3` module is absent or ABI-incompatible, but must apply only to profiles that require SQLite.

Recommendation: D04=A+D. Keep `engines.node >=22` unchanged. The required baseline verification job uses Node 22.23.5 and checks `node --version`, `npm --version`, then verifies `better-sqlite3` is loadable before database tests. Other Node versions are explicit experimental/matrix runs with separate results; a Node 24 failure is an environment/runtime mismatch signal, not universal incompatibility proof. Do not change dependency declarations or optionality without a separate approval.

## D05 — Determinism, listeners, processes and CI constraints

**Option A — Bounded barriers and controlled clocks where existing seams permit (recommend).** Tests state the awaited event, use descriptive timeout failures and release resources in `finally`/hooks.

**Option B — Timer/sleep-based integration only.** Simpler but scheduler-sensitive; keep only where a real elapsed-time contract is itself under test.

**Option C — Replace local listeners/process tests with mocks.** Fast but removes protocol, bind, lifecycle and actual process-kill evidence; not recommended as a replacement.

Recommendation: D05=A with B only for explicit deadline/timer behavior. CI must allow loopback bind, temporary filesystem writes, process creation/termination and native addon loading for the integration/full jobs. If host execution is denied, label those jobs blocked. Keep crash tests serial and bound IPC waits; do not classify environment-blocked runs as passing or flaky without repeatable failure evidence.

## D06 — Source-to-test selection for maintainers and agents

**Option A — Responsibility manifest plus examples (recommend).** Map source ownership IDs and business flows to primary/companion tests, then let maintainers select profile subsets.

**Option B — Import graph impact selection.** Could suggest transitive tests, but static imports miss runtime composition and over-select shared flows; treat as advisory only if added.

**Option C — Test filename convention.** Easy to explain, but file placement is not behavioral coverage and cross-cutting flows resist a single owner.

Recommendation: D06=A, no claim of complete impact analysis. Keep an explicit note that source ownership, architecture imports and responsibility matrix are different models. For every code change, select tests by changed behavior and risk, then run full gates before merge unless owner-approved exception is documented.

## D07 — Migration pace and assertion preservation

**Option A — Incremental, breadth-first batches (recommend).** Establish classification and profile for all responsibilities before moving/extracting a small test batch. Easier review and rollback.

**Option B — Bulk reorganization.** One-time consistency but large diff, hard to attribute failures, risk of losing cleanup/assertions and fixture behavior; not recommended.

Recommendation: D07=A. Before each Stage B batch, record files, test registrations, named safety invariants, runner counts and verification. Review semantic diff for removed/changed assertions; do not treat raw counts as a correctness metric or rewrite tests solely to preserve a number. Keep source and test movement separate from production behavior changes.

## Stage B acceptance and rollback

Stage B should begin only after explicit owner selection or amendment of D01–D07. Acceptance requires:

1. The inventory validator finds every current test file once and validates responsibility IDs/layer/runner fields.
2. Fast/Integration/Full selections are reviewed for inclusion and exclusion against all M01–M18, SG02, key flows and crash/lifecycle invariants.
3. `npm test` remains behavior-compatible unless separately approved; all selected checks fail closed and show blocked environment requirements distinctly.
4. Fixture extractions preserve exact cleanup, authentication, ACK payload/wire contracts, persistence outcomes, timeout/writer ownership, process-crash barriers and existing assertions.
5. Node/native policy reports exact versions and load status; exploratory versions do not silently redefine baseline support.
6. Architecture, typecheck, build, full backend, playground, focused crash and listener checks pass or have an explicitly reviewed blocker disposition. Test counts are compared only to locate lost tests, never used as a substitute for assertion review.
7. Stage B reports changed files, baseline/after verification, known limits and a revert path.

Rollback: revert one migration batch at a time, restore the prior file/fixture ownership and profile manifest, rerun the previous full commands, and preserve the prior tests as-is until the revert verifies. Do not delete historical reports or amend their old checkpoint snapshots.

## Approval record

No decisions are approved by this document. Owner selection is required before R7.7.B implementation. No Stage B work is authorized by the recommendations above.
