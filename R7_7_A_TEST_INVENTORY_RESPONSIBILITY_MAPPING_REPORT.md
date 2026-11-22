# R7.7.A — Test Inventory, Responsibility Mapping & Verification Baseline

## Checkpoint and scope

- Repository: `vutuantrung/base-aa-backend`; branch `main`.
- Expected and actual HEAD: `b8560c5f354a3fab0550fe513293ead6142a7ccd`.
- Initial index/worktree: no staged or tracked changes; one pre-existing untracked owner prompt, `prompts/R7_7_A_TEST_INVENTORY_RESPONSIBILITY_MAPPING_CODEX_PROMPT.md`. It is preserved unchanged.
- Stage A changes are documentation only: inventory, responsibility map, pending policy, this report, current project state, and the grounded TD14 acceptance status update. No test/source/runtime/package/public API changes; no files moved; no commit/push.
- Environment: Node `v22.23.5`, npm `10.9.9`, Linux x86_64 (Ubuntu kernel `7.0.0-44-generic`), AMD Ryzen 7 7445HS, 12 logical CPUs.

## A01 — Inventory result and uncertainties

The machine-readable inventory is [R7_7_TEST_INVENTORY.json](docs/testing/R7_7_TEST_INVENTORY.json). It contains 54 discovered test files: 49 backend and five playground. Source registration counting yields 250 backend and 32 playground tests, matching the fresh Node-runner totals below (282 combined). Path validation found no missing or duplicate test-file paths. Five playground entries retain `SG02` plus `unknown` because this repository’s M12–M15 classifications are still TBD and direct test source does not justify a narrower module assignment.

The inventory also records 11 support assets: in-test memory reliable store, child crash harness, shared local PServer, playground peer/mock/task/selection helpers, dashboard state, architecture checker, and the lifecycle test seam. It records direct-source flags, import/fixture references, test layer, responsibility/flow associations and unresolved notes per file. These are source scans and analyst mappings, not proof of transitive effects or assertion coverage. Test counts are line-start `node:test` registrations cross-checked against actual test runner totals. There are no separate Jest/Vitest/Mocha runners or CI workflow files in the repository scan; root architecture enforcement is a script invoked by npm and covered by a checker test.

## A02 — Responsibility and coverage result

The [responsibility map](docs/testing/R7_7_RESPONSIBILITY_VERIFICATION_MAP.md) covers M01–M18, SG02, F03, F08, F09, M09/M13 and the cross-cutting reliability/lifecycle invariants. It distinguishes unit/contract evidence from local HTTP/Socket.IO integration and child-process crash evidence, records gaps, and names companion tests for future changes. The strongest focused groupings are M02 lifecycle, M05 socket gateway, M09 routing, M12/M13 workflows and M17 persistence. M08 and M18 have comparatively thin focused coverage; M14/M15 remain TBD and are exercised mainly through repository/HTTP behavior tests.

The map explicitly preserves: ACK-gated ingress; auth-before-disabled-SQLite responses; M09 fail-fast with sibling drain; F08/F09 receipt and idempotency; M13 exact ACK/canonical-state behavior; outbox exact ACK/quarantine/uncertain no-replay; writer ownership and process-wide attempt concurrency; process-kill recovery; M02 bounded lifecycle; live peer-ACK drain; and late settlement. Passing local tests do not establish external peer behavior, power-loss safety, universal filesystem semantics or exactly-once business effects.

## A03 — Isolation and instability findings

Risks are ranked by observed source/runtime evidence:

1. **Listener and runner environment requirements.** 28 test files directly contain listener/server signals; they use local ports, normally ephemeral. A direct sandboxed integration-client run produced `listen EPERM: operation not permitted 127.0.0.1` during its `before` hook. Some listener files pass in isolation in this environment; the full sandbox run reports generic file-level failures without per-file root causes. The full backend suite passes with host execution. Therefore report the host result as PASS and the sandbox run as environment-blocked/partially unexplained, not as 27 individually proven EPERM failures.
2. **Native SQLite runtime dependence.** Source inspection identifies 24 files that either open SQLite directly or instantiate an application with SQLite enabled/defaulted. The optional `better-sqlite3` path loads and all catalog/repository tests pass on Node 22.23.5 here. The owner reports three catalog failures under Node 24 that disappeared after switching to Node 22; this is recorded as an environment/runtime mismatch report, not independently reproduced and not proof of universal Node 24 incompatibility. No engine constraint was changed.
3. **Process environment mutation.** Nine test files write `process.env`; the inspected tests generally save and restore prior values in `finally`/hooks. Root backend tests run serially. This reduces same-process interference but does not replace cleanup assertions, and new profile parallelism would need explicit safety evidence.
4. **Unbounded event waits and sleeps.** The shared `createMockPServer().arrival` promise has no built-in timeout; several callers await it directly (`aaui-resource-selection-routing`, `pserver-session`, `task-received-routing`, `pserver-aaui-task-roundtrip`). Some Socket.IO connect/disconnect waits also lack local deadlines. A few tests use short `setTimeout` sleeps (10–100 ms) to wait for protocol state. These are maintainability risks; no reproducible flake was established here. Recent R7.6.B barriers include bounded descriptive waits, but the inventory exposes older wait patterns that Stage B should characterize before changing.
5. **Fixture and asynchronous cleanup coupling.** `tests/support/mock-pserver.ts` owns a local listener and exposes an arrival promise plus `close`; seven test files import it. Other tests own their own HTTP/Socket.IO servers. Process env, sockets, servers and temporary directories are currently cleaned up by a mix of file hooks and `finally` blocks rather than one declared fixture contract.
6. **Clock and nondeterministic branch coverage.** Fifteen files directly use dates/timers. Some are explicitly testing real elapsed deadline semantics; others only create timestamps. `application-surface-compatibility.test.ts` chooses one dynamic SQLite flag using `Math.random`, so which branch is exercised varies per run; this was observed in source and is not asserted to cause a failure.
7. **Child-process boundaries.** One test file launches the SIGKILL reliability harness. It uses a separate child fixture and bounded message waits; the evidence remains Linux local-process/filesystem scoped.

The prior R7.6 report records an earlier 249/250 full run followed by a 250/250 repeat, but the report does not identify the failed test and no supporting raw log was found in this checkout. The cause cannot be established from available evidence. The current fresh host run completed 250/250; no transient failure was reproduced. This is not classified as a known flaky test.

## A04 — Fresh verification and measurements

| Command | Fresh result |
|---|---|
| `node --version`; `npm --version` | `v22.23.5`; `10.9.9` |
| `npm run check:architecture` | **FAIL:** 59 source files / 145 resolved edges; current graph rejects `src/app/lifecycle-test-seam.ts` as unmapped source ownership. Existing M10/M12/M13 module SCC warning also prints. This Stage A checkpoint did not change source or checker ownership. |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | **PASS 250/250** with host listener permission; Node TAP duration 18,826 ms, tool wall about 18.84 s. |
| `npm --prefix testing run test:playground` | **PASS 32/32**; Node TAP duration about 273 ms. |
| `git diff --check` | PASS after documentation changes. |

The sandbox backend run produced 22 passing and 27 failing test-file wrappers (49 files total); the wrapper output does not identify all underlying causes. A direct listener-bearing integration-client run did expose the precise EPERM error. The authorized host full-suite rerun is the valid full backend baseline. Representative direct integration runs on this Linux host took about 0.62–0.68 s for `aa-catalog-boundary.test.ts` (7 tests) and `application-lifecycle.test.ts` (7 tests). These are machine-specific observations, not CI estimates. The standalone `check:architecture` failure remains a real current checkpoint issue despite `tests/architecture-check.test.ts` passing as part of the backend suite.

## A05 — Fixture and agent selection summary

Repeated fixtures are listed in the inventory and map. Existing reuse is narrow: memory reliable-store and crash child fixtures; mock PServer; playground peer server, mock VM data, scheduled sender, task/selection helpers and dashboard state. Some repeated listener/env setup remains file-local. No fixture was extracted in Stage A.

The proposed mapping examples connect M12 workflow edits to workflow/receipt/routing and applicable peer ACK tests; M17 record-store edits to outbox and crash tests; M07 route edits to the relevant HTTP route matrix; and M02 coordinator edits to coordinator/lifecycle/startup/peer-drain tests. These selections are practical recommendations, not a complete dependency-accurate analyzer.

## A06 — Seven pending owner decisions

The full alternative/trade-off package is [R7_7_TEST_ARCHITECTURE_POLICY.md](docs/architecture/R7_7_TEST_ARCHITECTURE_POLICY.md). Its recommendations remain pending owner approval:

1. D01 responsibility tagging: explicit manifest with multi-responsibility/unknown support.
2. D02 fixture ownership: local fixtures by default, narrow domain support modules with explicit cleanup contracts; no omnibus harness.
3. D03 profiles: additive Fast/Integration/Full selections; keep `npm test` backward compatible.
4. D04 runtime/native policy: Node 22.23.5 baseline verification guard; separate exploratory versions; do not tighten `engines` or optional dependency policy without approval.
5. D05 deterministic/CI policy: bounded barriers, local listener/process/native requirements reported explicitly, no sleeps as race masking.
6. D06 impact selection: responsibility map plus examples, advisory only, not a complete static analyzer.
7. D07 migration: incremental breadth-first batches with assertion/invariant review and rollback; no bulk move.

Stage B acceptance and rollback checks are defined in the policy package. No recommendation is treated as approval.

## Safety constraints and next step

Preserve R7.5 P01–P06 and R7.6 D01–D06, exact ACK/wire and public application contracts, no unsafe replay, no lock auto-removal, no retry/quota/dedupe/data migration changes, and the 15-second default total monotonic shutdown deadline with writer ownership retained until potential mutations settle. Continue to preserve R7.2–R7.4 compatibility decisions; TD02, TD12, TD13 and wider TD15 diagnostics remain deferred/open. TD14's scoped R7.6.B remediation is owner-accepted; the current architecture ownership checker issue is a separate Stage A finding. M12–M15 stay TBD.

**Recommendation: stop for architecture owner review of D01–D07 before R7.7.B.** The fresh baseline has a current architecture checker ownership error to resolve through an approved decision; no Stage A code change was made to hide it. No R7.8 work, commit or push was performed.

## Exact Stage A output files

- `docs/testing/R7_7_TEST_INVENTORY.json`
- `docs/testing/R7_7_RESPONSIBILITY_VERIFICATION_MAP.md`
- `docs/architecture/R7_7_TEST_ARCHITECTURE_POLICY.md`
- `R7_7_A_TEST_INVENTORY_RESPONSIBILITY_MAPPING_REPORT.md`
- `docs/architecture/PROJECT_STATE.md`
- `docs/architecture/TECHNICAL_DEBT.md` (TD14 current acceptance status)

The supplied untracked prompt remains untouched. Historical reports were not rewritten.
