# R7.10.B — Exact Feature-Mode Compatibility Characterization

**Codex checkpoint:** R7.10.B (one bounded characterization and verification checkpoint)  
**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Expected committed HEAD:** `ea08e70f7855c96e8ce7ab18c83c224aada1f545` (`checkpoint R7.9 final architecture closure`)  
**Authoritative runtime:** Node.js `v22.23.5`, npm `10.9.9`  
**Mode:** SOURCE-BASED CHARACTERIZATION + MINIMAL TARGETED TESTS ONLY, IF NEEDED. No production changes, no commit/push.

## 0. Architecture-owner authorization and hard stop

The Architecture Owner explicitly approved:

| Decision | Approved | Binding interpretation |
|---|---|---|
| AS-D01 | **A** | Long-term objective is evidence-backed business-boundary ownership, not code movement for its own sake. R7.10.B does **not** reclassify module owners. |
| AS-D02 | **B** | First bounded checkpoint is **Exact Feature-Mode Compatibility Characterization**. Deployment/runtime evidence remains a separate candidate. |
| AS-D03 | **A** | Preserve M12/M13 `TBD`, M14/M15 `APP`; no inferred ownership from names/imports or lack of tracked callers. |
| AS-D04 | **A** | Characterize/verify before separately authorized implementation; **no runtime/contract redesign is approved**. |
| AS-D05 | **A (scoped)** | Use focused and contract-oriented verification for characterization; preserve full maintained regression gates where tests are modified. Do not force costly Full runs for docs-only work without need. |
| AS-D06 | **A** | Separate owner decision/authorization for each later change; explicit bounded exit and stop criteria. |

**This prompt authorizes R7.10.B only.** It does not authorize R7.10.C, R7.11, feature-gate normalization, ownership migration, refactoring, production bug fixes, new DI seams, CLI redesign or test-infrastructure redesign.

If the local committed HEAD differs from the expected SHA, inspect the delta and its effect, report the discrepancy, and **stop before editing** if unexpected source/contract changes affect the assessment. Never reset, stash, switch branches, overwrite unrelated changes, stage or unstage user work. Read `AGENTS.md` and existing project conventions first. All future Codex prompts live in `prompts/`, never in repository root or `docs/architecture/`.

## 1. Mission and explicit non-goals

Establish a **precise, reviewable compatibility baseline** for application feature/runtime modes, separating observed behavior, source-inferred behavior and untested combinations. Determine exactly how each supported entry path and flag combination affects constructed resources, demo registration, listen/close behavior and user-visible interfaces — **without changing any of those behaviors**.

Primary investigation questions:

1. How does `src/config/configuration.ts` resolve CLI environment input (`ENABLE_TEST_PEERS`, `ENABLE_SQLITE`, PServer URL/path/VM defaults, port, DB path, timeout) and what does exact string comparison `'1'` mean for values such as unset, `0`, `1`, `true`, whitespace or mixed case?
2. How does the top-level `ResolvedConfiguration.enableTestPeers` differ from the nested `ResolvedConfiguration.application.enableTestPeers`? Which actual consumer (M02 lifecycle, M05 gateway, M03/M04 PServer connector, M12/M13 workflows) uses which flag?
3. How do `createApplication(...)`, `startApplication(...)` and executable `src/main.ts` differ in input normalization, defaults, resource acquisition, demo-rule registration, PServer requirements, SQLite behavior, signal ownership, startup and shutdown?
4. Under what precise conditions are peer gateway, `/peers` endpoint/namespace, workflow stores/runners, optional connector, transformation registry/rule, M14/M15/M16 repositories and HTTP routes available? Record **actual code behavior** and do not infer availability from only a flag name.
5. Which combinations are publicly constructible, which are intentionally inconsistent but supported, which fail deterministically, and which require unavailable external peers/operator inputs? Do not represent hypothetical combinations as tested.
6. Does the direct `startApplication()` callback execute before the implicit example rule registration and before `listen`, including existing error boundaries? Preserve the accepted static lifecycle→example import and app-local `TransformationRegistry` semantics.

Non-goals: changing default settings, combining or renaming flags, relocating example registration, removing the lifecycle→example edge, changing CLI handling, introducing a capabilities facade, moving M12/M13, changing HTTP `/health` or auth/response semantics, modifying persistence paths/schema/ACK handling, adding log output or modifying production/test profile infrastructure.

## 2. Binding historical invariants

Respect and cite the authoritative decisions and source/test evidence; do not rewrite history:

- **R7.5 P01–P06:** durable receipt vs delivery, ACK semantics, no unsafe replay of uncertain sends, quota/attempt/lease/lock limits, no invented power-loss or receiver-dedupe guarantees.
- **R7.6 D01–D06:** single app-local admission/readiness authority, one monotonic deadline, startup rollback, active-work draining, no premature writer release while late work settles, `main.ts` signal ownership.
- **R7.7:** 55-file maintained manifest, original serial `npm test`, additive Fast/Integration/Full profiles, independent `testing/` playground, explicit `unknown` mapping rows, Node 22.23.5 baseline.
- **R7.8 C-D01/02/03=A:** explicit bounded static `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` compatibility import; direct `startApplication()` implicit demo registration **after `onCreated`, before `listen`**; app-local registry; distinct top/nested flags; exact CLI `ENABLE_TEST_PEERS === '1'` behavior; CLI-provided PServer defaults. M12/M13 remain `TBD`; M14/M15 `APP`.
- **R7.9:** approved RC-D01–D07 (notably RC-D02 scoped parity-first, RC-D03=A preserve gates, RC-D04=C defer diagnostics, RC-D05=A legacy exports, RC-D06=A labels), FI-D01–D05 (existing input triggers, scoped proof-first, bounded Full, separate corrective checkpoint). M02 extraction **DEFERRED — EQUIVALENCE NOT PROVEN**; F1 file reopening does not prove native handle closure; F2 async close **NOT PROVEN**. TD15–TD17 and other debt remain open.
- Public contracts and behavior of M03–M18, signal handling, `/health`, auth-before-disabled SQLite route behavior, CLI/programmatic default differences and legacy exports cannot change in this task.

Read only relevant latest files first: `docs/architecture/PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md`, `R7_9_A_RUNTIME_RESPONSIBILITY_INVENTORY.md`, `R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md`, `R7_10_A_CANDIDATE_SCOPE_PRIORITIZATION.md`, `TECHNICAL_DEBT.md` under `docs/architecture/`, and targeted code/tests. R7.10.A docs may be uncommitted: preserve them and use available versions without declaring them committed.

## 3. B01 — Baseline, scope and test inventory (read-only)

1. Record branch, actual HEAD, `git status --short`, staged/unstaged/untracked files, Node/npm versions and current baseline vs expected SHA.
2. Confirm the relevant source/test owners by reading current code (at minimum `src/config/configuration.ts`, `src/app/create-app.ts`, `src/app/lifecycle.ts`, `src/main.ts`, `src/infrastructure/socket/{socket-gateway,peer-gateway}.ts`, relevant connector and example; adapt paths based on repository truth).
3. Inspect existing tests (`tests/configuration.test.ts`, `tests/application-surface-compatibility.test.ts`, `tests/app-lifecycle.test.ts` if present, related demo/peer/HTTP tests) before proposing a new assertion. Record preexisting coverage and precise missing combinations; do not duplicate existing tests.
4. Read the existing test manifest and scripts to select appropriate targeted test file(s), ensure no new test file is created unless demonstrably necessary. Prefer adding assertions to existing tests. Do not modify manifest/runner/profile/CI/package scripts in this checkpoint; if a new file would require manifest change, **defer and seek owner approval**.
5. Bound research by feature-mode scope. Do not conduct a broad M02 cleanup or revisit every historical phase.

## 4. B02 — Exact feature-mode matrix (documentation first)

Produce a source-grounded matrix that includes at least the following dimensions, but avoid an unnecessarily large unvalidated Cartesian product. Use *equivalence classes*, identify representative combinations and justify coverage:

- **Entrypoint:** CLI `main` with resolved env; direct `createApplication(...)`; direct `startApplication(resolvedConfiguration, ...)`.
- **Peer mode:** exact CLI `ENABLE_TEST_PEERS` values (`'1'` versus absent/other); programmatic top-level `enableTestPeers` true/false; nested `application.enableTestPeers` true/false (including intentionally mismatched combinations).
- **PServer config:** absent, explicit valid input, CLI default injection when applicable, invalid UDID (existing F2); distinguish existence of connector, attempted connect and actually connected state.
- **SQLite:** CLI `ENABLE_SQLITE` `'1'` vs other values; direct `createApplication` default (enabled unless explicitly false); path `:memory:` vs safe unique temp file where relevant; disabled repositories/routes vs mounted HTTP behavior.
- **Registration:** example rule absent/present at creation, after `onCreated`, before `listen`; distinguish `createApplication` from `startApplication` and preserve callbacks/error boundaries.
- **Lifecycle resources:** peers/Socket.IO attachment, M12/M13 workflow/store/runner availability, `TransformationRegistry`, HTTP listener, process signals, persistence, safe close behavior; distinguish constructed from started and successful from failed startup.

Every matrix row must have: input path/flag values, **source file and symbol**, predicted outcomes, concrete observation if tested, evidence label (`SOURCE-CONFIRMED`, `TEST-OBSERVED`, `NOT TESTED`, `EXTERNAL DEPENDENCY`), exact contract risk and linked existing/new assertion. Document where a field or outcome cannot be distinguished by the public API without production modification. Never confuse a new local test's mocked capability with a real peer/deployment guarantee.

**Special case:** top/nested mismatches are currently legitimate independently configurable inputs and must not be silently normalized or called defects. Document direct-programmatic constructor and direct-start behavior separately; do not assume the CLI sets all possible programmatic combinations.

## 5. B03 — Targeted characterization tests (only when evidence gap is material)

First deliver a gap assessment. Then add only the minimum deterministic tests needed to confirm highest-risk existing behavior, using public configuration and existing harnesses. Candidate assertions, **subject to source validation**:

- Exact `ENABLE_TEST_PEERS === '1'` parsing for one or more non-`'1'` values without changing the parser.
- Distinct effects of top-level true/nested false and top-level false/nested true in direct `startApplication`, verified without unnecessary external PServer network connections.
- Difference between direct `createApplication` (does not implicitly add demo rule) and direct `startApplication` (registration timing) using existing app lifecycle test seams.
- PServer config absent versus supplied, and whether connector is *constructed* only when existing gates/resources permit; assert no actual remote connectivity absent test fixture.
- SQLite CLI opt-in vs direct-factory default, using isolated temporary file or `:memory:` only; preserve native handle cleanup, avoid shared paths/state.

**Strict test rules:**

1. No production source changes (`src/**`), no public-interface/types/config defaults changes. Do not modify existing assertion meaning, remove/skip tests or weaken a gate. No test-only production seam or module monkey-patching.
2. Touch only directly related existing tests, and only after a source/coverage rationale. Use unique temp paths and loopback/ephemeral ports; no production credentials, persistent user data, or external production services. Avoid sleeps/guessing async socket completion.
3. Preserve the exact F1/F2 tests, existing demo rule behavior and all R7.5–R7.9 invariants. If a proposed assertion would require changing behavior or relies on an unobservable state, **document `NOT PROVEN` and stop that subtask**.
4. If a test detects a previously unobserved production defect or fails deterministically, save a minimal reproduction and complete failure output. **Do not fix production or rewrite assertions to pass.** Under FI-D04=A, create a corrective proposal requiring separate owner approval. Do not start that checkpoint.
5. If no material gaps justify tests, make **no test edits**; report a docs-only outcome with verified source evidence instead.

## 6. B04 — Verification policy and capture

Use Node `v22.23.5` / npm `10.9.9` explicitly for all authoritative commands; note any default-shell version discrepancy. Separate sandbox permission/native ABI/environment-blocked results from application failures. Capture exact invocation, exit status, counts and test identities.

**Always:** `git diff --check`, `git diff --cached --check`, `npm run check:architecture`, `npm run test:manifest`; audit added Markdown for trailing whitespace. Maintain responsibility-map `unknown` rows.

**If tests changed:** run focused affected suites, `npm run typecheck`, `npm run build`, `npm run test:fast`, `npm run test:integration`, `npm test -- --test-concurrency=1` and `npm run test:full` on a host supporting native SQLite, loopback and child process. Collect complete unfiltered logs and metadata (branch, committed HEAD, dirty paths, Node/npm, UTC start/end, command, exit, pass/fail/skip and exact failing test). Use **at most three deliberate Full attempts** for this checkpoint; do not repeat until green or suppress a failure. Store bulky raw logs outside repo (`/tmp/r7_10_b_feature_modes/`) and link their actual paths in the report; if those files are not persistent across handoff, include concise reproducible evidence excerpts in repository documentation. Full should cover backend **and** playground. No CI edits.

**If documentation-only:** focused tests may be run when safe, but typecheck/build/Full can remain historical; state explicitly what was *not* rerun and do not claim current proof from a past run. Architecture/manifest and diff checks remain mandatory.

**Failure:** Stop on unexplained test failure, reliability invariant violation, unexpected public/behavior change, or source drift. Identify the failed gate and propose a separate corrective checkpoint; do not auto-correct production or expand scope.

## 7. B05 — Artifacts, governance and stop

Create these outputs; do not overwrite or rewrite A/B/C/D/FIX1 historical reports:

1. `docs/architecture/R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_MATRIX.md` — source/observation distinction and representative mode cases, not unsupported exhaustive claims.
2. `docs/testing/R7_10_B_FEATURE_MODE_CHARACTERIZATION_COVERAGE.md` — existing vs new tests, gap justifications, run results, log paths and evidence limitations (if no tests changed, explain why).
3. `docs/architecture/R7_10_B_FEATURE_MODE_COMPATIBILITY_DISPOSITION.md` — observed constraints, residual uncertainties, no-go boundaries, practical use as input to future ownership/API decisions, and **options requiring further owner approval**; do not invent approved R7.10.C.
4. Root `R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_CHARACTERIZATION_VERIFICATION_REPORT.md` — baseline, actual paths changed, approved AS-D01–AS-D06 choices, matrix findings, exact tests/results, evidence qualification, risks, rollback, next decision gate, GO/NO-GO for owner **review**.
5. Prepend a concise *current* R7.10.B status to `docs/architecture/PROJECT_STATE.md`; preserve previous checkpoint history. Add an accurate approval record to `docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md` for **AS-D01=A, D02=B, D03=A, D04=A, D05=A scoped, D06=A**. Do not rewrite the historical recommendation prose or claim that the owner approved AS-D02=A.

The supplied R7.10.B prompt must be placed in `prompts/R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_CHARACTERIZATION_CODEX_PROMPT.md`; preserve existing prompts. No new prompt is to be created outside `prompts/`.

In the final report, distinguish `DONE` (evidence obtained), `DEFERRED` (requires owner/fixture/seam) and `UNKNOWN` (not yet investigated). Document rollback as *revert only R7.10.B targeted test/doc changes, retaining all R7.10.A and R7.9 artifacts*. Never stage, unstage, commit, push or alter branch. Do not start R7.10.C or R7.11. **Stop for Architecture Owner review.**

## 8. Expected final Codex response

Summarize: exact source HEAD and worktree preservation; AS decision approvals; tested representative flag combinations; changes to files; verification PASS/FAIL/BLOCKED by gate; unresolved environment/ownership/cleanup limits; any F2, RC/TD16 or external-caller implications; and the path to the root R7.10.B report. A successful characterization checkpoint **does not** authorize production implementation or close TD16.
