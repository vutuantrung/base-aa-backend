# R7.9.C — Runtime Failure Injection & Test Stability Discovery

## Codex execution prompt — discovery, evidence collection and decision package only

**Repository:** `vutuantrung/base-aa-backend`
**Branch:** `main`
**Expected committed baseline:** `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9` (`checkpoint R7.8`)
**Authoritative runtime:** Node.js `v22.23.5`, npm `10.9.9`
**Work mode:** READ / ANALYZE / RUN BOUNDED DIAGNOSTICS / WRITE DOCUMENTATION ONLY.
**Prompt location:** `prompts/R7_9_C_RUNTIME_FAILURE_INJECTION_TEST_STABILITY_DISCOVERY_CODEX_PROMPT.md`

**Critical authorization boundary:** R7.9.C is a discovery checkpoint. Do not edit production source, tests, fixtures, scripts, package files, lockfiles, test manifest, CI, interfaces, exports, feature flags, or runtime behavior. Do not introduce test hooks, fault injection implementations, global state, extra dependencies, or test assertion changes. Do not commit or push. Do not begin R7.9.D or restart the R7.9.B extraction.

## 0 — Source of truth and worktree safety

1. Read `AGENTS.md` (if present), `docs/architecture/PROJECT_STATE.md`, `docs/architecture/MODULE_BOUNDARIES.md`, `docs/architecture/TECHNICAL_DEBT.md`, R7.8.C accepted ADR, R7.9.A inventory/opportunity catalog/decision policy, `docs/architecture/R7_9_B_M02_FAILURE_BOUNDARY_PARITY_MATRIX.md`, `docs/architecture/R7_9_B_M02_PRIVATE_SEAM_DECISION.md`, and `R7_9_B_M02_RUNTIME_COMPOSITION_BOUNDARY_IMPLEMENTATION_VERIFICATION_REPORT.md`. Inspect actual code and tests rather than trusting summaries.
2. Record `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git diff --name-status`, staged/unstaged/untracked files, `node --version`, and `npm --version` before beginning. R7.9.A and R7.9.B may remain uncommitted; preserve them byte-for-byte. If HEAD differs, reconcile from actual source and record differences; never reset or overwrite.
3. Use Node v22.23.5 explicitly, not the default Node 24 that prior R7.9.A discovery encountered. Native `better-sqlite3` preflight may require host process permission. Distinguish a blocked environment from an actual test failure.
4. `prompts/` is the only directory for Codex prompt files. Store evidence and architecture docs in `docs/architecture/` and the final checkpoint report in repository root. Historical reports and previously approved decision records must not be rewritten.

## 1 — Binding decisions and invariants

Owner-approved R7.9 decisions: RC-D01=A; RC-D02=A **scoped, equivalence-first**; RC-D03=A; RC-D04=C; RC-D05=A; RC-D06=A; RC-D07=A. R7.9.B correctly deferred private M02 extraction because resource/failure equivalence could not be proven. **This discovery does not authorize any new extraction.**

Preserve:
- R7.8.C C-D01/02/03=A: bounded `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` compatibility import; implicit demo rule for direct `startApplication()` calls; app-local `TransformationRegistry`.
- `onCreated` → conditional registration (top-level flag) → `listen` ordering; current exception boundaries outside the listen-specific catch; distinct top-level and nested flags; exact `ENABLE_TEST_PEERS === '1'`; CLI PServer and SQLite defaults versus programmatic defaults.
- Existing `ApplicationInstance`/`ApplicationConfig`/overloads and exported helper APIs; M12/M13 formal TBD, M14/M15 APP; no durable paths/schema, ACK/outbox, `/health`, readiness, signal ownership, diagnostics or legacy-export change.
- R7.5 P01–P06 conservative delivery/ACK, no unsafe replay, dedupe/limits and writer ownership, R7.6 D01–D06 bounded shutdown/admission/startup rollback/late settlement, R7.7 preserved manifest/profile/serial `npm test` and independent playground.
- Test outcomes are evidence only within their scope; neither a passing local suite nor a process `SIGKILL` test proves external peer, receiver dedupe, exactly-once, power-loss or deployed filesystem behavior.

## 2 — C01: M02 runtime failure-injection discovery

**Objective:** Build an auditable, source-linked map of fault sites and identify where deterministic failure injection is possible **without source changes** versus where new, separately approved testability contracts would be required.

Inspect at least:
- `src/app/create-app.ts`, `src/app/lifecycle.ts`, `src/app/application-coordinator.ts`, `src/app/shutdown-signals.ts`, `src/main.ts`;
- persistence acquisition, SQLite repositories, HTTP server, Socket.IO server, M05 peer gateway, M03 connector and R7.5 runner/store ownership;
- tests for lifecycle, startup interruption, callback visibility, duplicate registration, process-crash, outbox/writer locks, API/SQLite, signals and timeouts.

Build a failure-injection matrix **per site**, not an undifferentiated exception list. Include:
- fault ID and exact function / source location / operation;
- phase: config validation, pre-try acquisition, in-try construction, pre-listen callback/registration, startup, normal close, startup rollback, construction cleanup, late settlement;
- whether failure is synchronous throw, rejected promise, timeout, partial acquisition or process exit;
- resources acquired before failure, resource ownership, `try`/`catch` scope and expected cleanup attempt order;
- public error propagation, diagnostics and state/lock consequences;
- existing deterministic fault trigger/test name, or clearly **UNTESTED**; avoid interpreting `EADDRINUSE` as coverage for every constructor failure;
- proposed nonintrusive injection technique, or owner-approved interface seam that would be required, including behavior/caller impact;
- required before/after assertions, negative cases, leak/lock checks, exact rollback and R7.5/R7.6 invariants.

Explicitly analyze the observed asymmetries from R7.9.B:
1. Shutdown timeout validation happens before acquisition; `openPersistence()` is before the main construction `try`.
2. `acquiredSockets` / `acquiredPServer` are assigned after constructors return; synchronous constructor failures or partial resource acquisition may be different from fully acquired resources.
3. Construction cleanup attempts connector close, asynchronous fire-and-forget socket close, and persistence close; only selected failures combine with the primary error.
4. Startup order: peer runner start → HTTP listen → readiness → peer activation → PServer connect → running; startup rollback drains/waits/closes with deadline.
5. Normal close order: PServer → peer gateway → sockets → HTTP → persistence; aggregation and late-settling resources may differ.
6. `onCreated` callback and demo rule registration happen before the listen-specific `try/catch`.
7. One-shot lifecycle, concurrent starts/stops, `closeFailedStartup`, monotonic deadline and writer lease lifetime.

Do **not** prescribe generic dependency injection or an artificial helper solely because `create-app.ts` is large. Rank each potential seam by meaningful responsibility ownership, testability benefit, runtime reachability, public compatibility, failure-boundary risk and rollback cost. It is valid to recommend **no seam** pending stronger evidence.

## 3 — C02: intermittent 254/255 Full test investigation

**Known evidence (do not overstate):** R7.8.B reported two intermediate Full attempts at 254/255 with no actionable failure identity; later reruns passed. R7.9.B reported first `npm run test:full` 254/255 (one failure; test identity not captured); direct serial `npm test -- --test-concurrency=1` passed 255/255; second Full passed 255/255 backend plus 32/32 playground. This shows intermittent outcomes, **not** an identified flaky test, shared cause, or M02 defect.

Before re-running:
1. Inspect `package.json` and `scripts/run-test-profile.mjs` exactly. The Full profile calls `npm test -- --test-concurrency=1` and root `npm test` already uses `--test-concurrency=1`; do not presume concurrent test-file execution is the cause.
2. Inventory test files that use process.env mutation, fixed/dynamic ports, tmpdirs, filesystem locks, signal handlers, child processes, async background work, timers, cleanup hooks, network/SQLite, lingering references or test-runner global state.
3. Review test manifest responsibility and time-sensitive metadata for candidate files; do not relabel `unknown` without evidence.
4. Review any accessible prior logs before producing new load; identify test name/failure first if possible.

### Bounded reproduction and evidence capture

- Use **at most three** deliberate, clean baseline `npm run test:full` attempts for this checkpoint unless an architecture owner separately authorizes additional repetitions. Do not loop until failure or until success. If the first/second run reveals a concrete failing test, prioritize diagnosis of that test over spending the remaining attempts.
- Capture **full stdout and stderr** with an unambiguous attempt ID, Node/npm versions, UTC timestamp, git SHA, command, exit code, test totals, skipped/failed totals, failing test name, assertion/stack, relevant preceding/following lines and process/OS environment. Preserve raw test output in a safe local diagnostic directory outside tracked source, e.g. `/tmp/r7_9_c_test_stability/`; reference exact local file paths in the report. Avoid writing secrets or full environment dumps to tracked docs. Use `set -o pipefail` if piping output to `tee`, or capture status directly; no PASS based on `tee` exit status.
- Capture available native Node test reporter output **without modifying repo scripts or treating an alternate invocation as identical to Full**. If a supplementary diagnostic command uses a different test invocation/selection, label it exploratory; never replace Full evidence with it.
- Record whether the failure is in preflight, architecture, typecheck, build, backend test, or playground test. Distinguish `EPERM`/host permissions/native module mismatch from code/test failures.
- Do not alter test order, add sleep, disable cleanup, increase timeout or weaken assertions during discovery. Stop on runaway child processes, unexpected external network calls, resource exhaustion or failures that could corrupt user data. Clean up only resources created during this checkpoint, not pre-existing worktree state.
- When a named failure appears, produce an evidence-backed hypothesis table: supporting/disconfirming observations, minimum deterministic reproduction design, affected test ownership and isolation constraints. Mark `ROOT CAUSE UNKNOWN` unless actually proven.
- If all bounded attempts pass, explicitly report `NOT REPRODUCED` and leave historical failures unresolved; do not declare the suite stable or infer a specific cause.

### Example high-level evidence capture (adapt to host and avoid editing repo)

```bash
set -o pipefail
mkdir -p /tmp/r7_9_c_test_stability
# Run only under the explicitly selected Node 22.23.5 PATH.
# Capture actual command status, not just tee status.
npm run test:full 2>&1 | tee /tmp/r7_9_c_test_stability/full-attempt-01.log
result=${PIPESTATUS[0]}
printf 'full-attempt-01 exit=%s\n' "$result"
```

The example is not authorization to repeat blindly. Prefer complete, structured output over partial streaming logs. If captured logs contain sensitive values, redact only **when documenting** them; preserve useful failure identity securely.

## 4 — C03: separation of evidence, recommendations and decisions

Create a traceability table from previous R7.9.B gaps to current C findings. For every proposed future change record:
- whether it is *characterization-only*, *test-harness/injection* change or *production/API* change;
- exact source seam, intended owner, proof required and test coverage impact;
- R7.5/R7.6/R7.7/R7.8 compatibility gates and changes to CI/package/manifest if relevant;
- risk, cost, rollback, and owner decision required.

Prepare owner decisions **FI-D01–FI-D05**, all with A/B/C (or explicitly labeled equivalent) options, trade-offs and an evidence-based recommendation, leaving each `PENDING OWNER APPROVAL`:
- **FI-D01:** failure-injection strategy (existing seams vs narrow test-only adapter vs invasive framework).
- **FI-D02:** first high-value M02 failure boundary to characterize/test, or defer absent seam.
- **FI-D03:** test-stability evidence collection / targeted diagnosis policy (bounded runs and log requirements).
- **FI-D04:** handling a confirmed test or production defect (separate corrective checkpoint, never silently fix in discovery).
- **FI-D05:** sequencing: testing-only proof checkpoint, M02 private extraction reevaluation, other runtime area, or no-go.

Distinguish a policy recommendation from actual owner authorization. Do not use R7.9.C to reopen R7.8 decisions or to authorize M02 extraction.

## 5 — Verification requirements

Using Node v22.23.5 / npm 10.9.9, run and report exact exit codes where environment supports:
1. `git diff --check`; `git diff --cached --check`, plus initial/final status comparisons.
2. `npm run check:architecture` (expected historical 59 files/145 edges; report actual).
3. `npm run test:manifest` (historical 55/55; report actual).
4. `npm run typecheck`; `npm run build`.
5. The **bounded** `npm run test:full` attempts in §3; include exact backend/playground results per attempt and missing/skipped stage descriptions. Optionally run direct serial tests only when they help isolate a failure and clearly label them.

Do not silently treat cached logs from prior checkpoint as current results. Do not infer a pass from a verification stage not run. A sandbox permission failure is **BLOCKED**, not failed business logic; if approved host execution is available, record its provenance and rerun. If checks reveal unapproved source changes, stop and report them rather than extending scope.

## 6 — Required deliverables

Create **documentation only**:

1. `docs/architecture/R7_9_C_M02_FAILURE_INJECTION_OPPORTUNITY_MATRIX.md` — fault ID / location / state / currently observed coverage / injection feasibility / ownership / acceptance and rollback gates. Separate proved facts from inferred behavior and unverified failure paths.
2. `docs/testing/R7_9_C_FULL_TEST_STABILITY_EVIDENCE.md` — attempt ledger, capture method, exact test identity/stack if available, reproduction conditions, hypotheses with counterevidence, `NOT REPRODUCED` or `ROOT CAUSE UNKNOWN` as warranted, and safe next diagnostic step. No giant raw logs committed.
3. `docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md` — FI-D01–FI-D05, options/trade-offs, recommendations and `PENDING OWNER APPROVAL` states.
4. `R7_9_C_RUNTIME_FAILURE_INJECTION_TEST_STABILITY_DISCOVERY_REPORT.md` — executive findings, git/worktree baseline, precise changed files, complete command/result table, test attempt log paths, conclusions/limits, risk and owner decision gate.
5. Append a concise current R7.9.C status section to `docs/architecture/PROJECT_STATE.md` without rewriting historical R7.8 or R7.9.A/B snapshots. Preserve TD15–TD17 OPEN status unless a purely factual note is needed.

Do not create/change Codex prompt files other than preserving the supplied prompt under `prompts/`. Do not stage, commit or push.

## 7 — Final acceptance and stop conditions

The checkpoint is successful if it provides credible evidence, even if no intermittent failure reproduces and no fault-injection seam is approved. Final report must clearly separate:
- **Observed, independently source/test grounded** findings;
- **Inferred hypotheses** and missing evidence;
- **Recommended owner decisions** versus decisions already approved;
- **Verification PASS/FAIL/BLOCKED/NOT RUN**, exact commands, Node version and host limitations.

Final status is **GO for owner review**, **CONDITIONAL GO**, or **NO-GO** with rationale. No implementation decision is self-authorized. **Stop for owner review of FI-D01–FI-D05. Do not begin R7.9.D or R7.10.**
