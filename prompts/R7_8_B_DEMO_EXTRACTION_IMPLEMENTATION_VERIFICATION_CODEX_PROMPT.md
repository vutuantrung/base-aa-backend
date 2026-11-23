# R7.8.B — Demo Extraction Implementation & Verification

## Mission and baseline

Repository `vutuantrung/base-aa-backend`, branch `main`.
Expected HEAD: `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`.
Authoritative verification runtime: Node.js **22.23.5**, npm 10.9.9.

**Complete B01–B07 as one checkpoint with reversible internal steps.** Do not commit/push. Do not start R7.8.C or R7.9. Read `AGENTS.md` if available; comply with Intent-Revealing Methods and Extract Method. First check actual HEAD, branch, working tree and runtime; preserve unrelated changes. Read R7.8.A discovery report and all three R7.8 architecture documents, `PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `TECHNICAL_DEBT.md`, R7.5/R7.6 policies and R7.7 test architecture policy. Actual source/tests supersede stale snapshots.

## Owner-approved ES-D01–D08 (binding)

| Decision | Approved | Boundary |
|---|---|---|
| ES-D01 | **A** | Classify by behavior, contract and state ownership—not filenames, directory or `demo.*` names. |
| ES-D02 | **C, scoped** | M12 is a **mixed-split hypothesis**, remains formally **TBD**. **Do not move or split** task workflow, store, F08/F09, ACK, outbox or snapshots. |
| ES-D03 | **C, scoped** | M13 is a **mixed-split hypothesis**, remains formally **TBD**. **Do not move or split** selection workflow, store, ACK, outbox or snapshots. |
| ES-D04 | **A** | Classify M14 Generic Session as **APP**; preserve contracts, SQLite and HTTP behavior. |
| ES-D05 | **A** | Classify M15 Process Usage separately as **APP**, not M18 diagnostics; preserve contracts. |
| ES-D06 | **A** | Preserve exact `ENABLE_TEST_PEERS='1'`, programmatic `enableTestPeers`, top-level/nested gate semantics, CLI PServer defaults and SQLite defaults. No new capability flags. |
| ES-D07 | **A** | Keep `testing/` package/processes independent; no new workspace or APP→`testing/` imports. |
| ES-D08 | **A** | Incremental breadth-first migration, explicit compatibility gates, assertion preservation and rollback. |

The owner approved **only** scoped implementation below. Classification `C` for M12/M13 is *not* approval to perform the split. Neither their formal TBD ownership nor production behavior may change.

## Non-negotiable regression requirements

- No production-observable change to public APIs/exports, HTTP status/body/auth-first + disabled-SQLite matrix, Socket.IO events/payloads/ACKs, startup/stop timing, runtime flags or configured defaults.
- Preserve R7.5 P01–P06: receipt/delivery separation; exact ACK; quarantine; uncertain-no-unsafe-replay; dedupe/expiry; no stale-lock auto-deletion; quotas; writer leases and process-wide attempt bound; persisted paths/IDs and recovery; existing limitations on crash/power-loss evidence. No schema/data migration or retry policy change.
- Preserve R7.6 D01–D06: admission fencing, internal readiness, monotonic total shutdown deadline (15s default), tracked work, startup rollback, peer ACK drain, late settlement and writer ownership until mutators settle. Timeout never implies cancellation.
- Preserve R7.7: manifest + validator, additive Fast/Integration/Full, original serial `npm test`, Node 22.23.5 and native SQLite preflight, playground tests, safety assertions and CI architecture gates.
- No bulk moves, no M12–M15 source moves, no gateway/persistence movement, no introduction of generic plugin framework or global service locator, no extra APP→demo runtime imports. Do not silently repair top-level/nested flags or change package/dependency policy.

## B01 — Establish source and compatibility baseline

Inspect and document source truth with concrete files/lines:

1. `src/app/lifecycle.ts` currently imports `registerPServerToAauiDemo` from `src/examples/pserver-to-aaui.ts` and calls it after `createApplication` and `onCreated`, before `listen`, gated by **top-level** `configuration.enableTestPeers`.
2. The example rule's identity, selection, priority, registration order, transform output and invalid-input error.
3. `src/main.ts`, `src/config/configuration.ts`, `src/app/create-app.ts`, and `src/infrastructure/socket/{socket-server,socket-gateway,peer-gateway}.ts`: CLI and programmatic composition, top-level/nested flags, PServer-present/absent, SQLite defaults, named peers and M12/M13 initialization.
4. M14/M15 composition and HTTP/SQLite contracts independent of the demo gate.
5. Playground separate process/package, static imports versus network/wire relationships.

Record before-change APP→example dependency and a **behavior parity matrix** covering flag combinations, rule visibility/timing, PServer defaults, startup/close and persistence. Do not infer equivalence between top-level and nested flags.

## B02 — Record approved policy and ownership (mandatory)

Update `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md` to approved D01–D08, correctly retaining scoped/TBD status for M12/M13. Update `docs/architecture/MODULE_BOUNDARIES.md` **M14=APP and M15=APP only**, with evidence and no behavior claim. Update current section of `PROJECT_STATE.md`, preserving historical reports/SHAs. Update TD16 with evidenced decisions/remaining coupling only; do not mark TD16 closed merely from documentation. Update any other *maintained* classification metadata strictly if necessary; do not confuse test responsibility tags with APP/DEMO classification.

## B03 — Conditional extraction: demo-only example wiring

**Target:** isolate/remove APP lifecycle's static dependency on demo-only *rule implementation* only if provably behavior-preserving. A minimal explicit typed composition seam is permissible; a new public application API, generic DI framework or implicit global callback is not.

Before modifying, prove:
- Registration remains under the **same top-level** gate, with same order relative to `createApplication`, `onCreated` and `listen`, and no new/omitted registration paths.
- Same rule `id`, from/to, payload type, priority, order, transformed payload and error behavior.
- CLI and direct programmatic `createApplication` behavior do not change, including mismatched top-level/nested flag cases.
- No changed default PServer connection, peer gateway, workflow/outbox/store activation or SQLite behavior.
- Same public exports, function signatures, application handle and dependency direction; example implementation remains demo-owned, no APP import of `testing/`.

**Only if all claims can be supported by focused tests and source reasoning**, implement the smallest clear seam. Favor composition ownership with explicit registration over hidden locator mechanisms. Use intent-revealing names and keep changes reviewable.

**If the seam cannot be proven equivalent or requires changed contracts/flags/timing, do not change wiring.** Instead record exactly what is blocked, evidence and a narrowly scoped future ADR recommendation. B03 documentation-only completion is allowed and is preferable to an unsafe refactor. Never fake success or silently drop demo registration.

## B04 — Characterization tests and fixture checks

Use existing tests first; add minimal deterministic tests where there is a coverage gap for:
- `ENABLE_TEST_PEERS` absent / `'0'` / `'1'`, and relevant programmatic combinations.
- Example transform presence/absence at exactly correct composition point; unchanged rule output, priority and invalid payload behavior; `onCreated` visibility if observable.
- PServer connector/default behavior and peer gateway activation where existing seams permit.
- M14/M15 auth-first/disabled-SQLite route and direct repository compatibility.
- No APP→playground static import.

Avoid timer sleeps and unnecessary listeners for pure composition cases. Do not weaken any existing assertions. For new test files update the R7.7 manifest and relevant selection/coverage map. Preserve all 253 baseline backend and 32 playground registered tests, recognizing added tests may raise counts.

## B05 — Enforce boundaries and verification architecture

Run architecture ownership and import/dependency checks. If files are added, use proper ownership mapping only; no exclusions, rule relaxation or new unchecked dependency direction. If APP→`src/examples/` remains due to defensible compatibility constraints, report it transparently—do not claim extraction completed. Keep `testing/` independent and existing CLI/package scripts unchanged. Keep `npm test` command backward-compatible and fully serial; maintain manifest coverage and Fast/Integration/Full membership coherently.

## B06 — Execute and record verification

Use Node **v22.23.5** for authoritative results; report exact command, exit code, test totals, skipped counts, host/sandbox conditions. Run:

```bash
node --version
npm --version
git status --short
git diff --check
npm run check:architecture
npm run test:manifest
npm run typecheck
npm run build
npm run test:fast
npm run test:integration
npm run test:full
npm test -- --test-concurrency=1
```

Additionally run focused tests for any changed config/example/composition seam, M14/M15 HTTP and repositories, and relevant R7.5/R7.6 outbox/crash/coordinator/lifecycle/startup/peer ACK drain regressions. `test:full` may already cover them, but show inclusion explicitly. No filtered full-suite success claims, no skipped tests described as passing, no source behavior changes to accommodate environment failure. If permissions deny listener/Git/process, record BLOCKED and rerun in authorized local environment if available.

Compare before/after registrations, assertions, manifest paths, profile selections, exact wire payloads and observable config behavior. Report limits: local Linux process kill, no power loss proof, no external peer guarantee or exactly-once claim.

## B07 — Deliverable, owner review and stop

Write `R7_8_B_DEMO_EXTRACTION_IMPLEMENTATION_VERIFICATION_REPORT.md` at repository root with:

1. Actual starting HEAD, branch, dirty paths and Node/runtime evidence.
2. Approval-to-change trace ES-D01–D08; classification M12/M13 TBD, M14/M15 APP.
3. Before/after import and composition diagram/table; exact B03 seam if implemented, or **explicit reason extraction was deferred**.
4. Config/rule registration and contract parity matrix; R7.5/R7.6 invariants and R7.7 test architecture preserved.
5. Changed file inventory, effects, test additions and rollback procedure.
6. Exact test commands/results, counts, environment limits, unresolved risks/TD16, and **GO / CONDITIONAL GO / NO-GO** recommendation for reviewer.

Update `PROJECT_STATE.md` accurately. Do **not** commit/push or begin R7.9. **Stop for architecture owner review.**

### Stop-work conditions

Stop the relevant extraction (but continue safe documentation) if it needs public/wire/API/data changes, changed flag semantics or registration order, M12/M13 movement, new deployment dependencies, or unverifiable production reliability. Do not substitute bulk refactoring for an unapproved design decision.
