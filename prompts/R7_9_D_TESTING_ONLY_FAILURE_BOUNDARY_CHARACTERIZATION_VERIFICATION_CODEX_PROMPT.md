# R7.9.D — Testing-Only Failure Boundary Characterization & Verification

**Codex execution prompt · One complete checkpoint · Architecture-owner approved**

Repository: `vutuantrung/base-aa-backend`
Branch: `main`
Expected committed baseline: `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9` (`checkpoint R7.8`)
Authoritative runtime: Node.js `v22.23.5`, npm `10.9.9`
Prompt location: `prompts/R7_9_D_TESTING_ONLY_FAILURE_BOUNDARY_CHARACTERIZATION_VERIFICATION_CODEX_PROMPT.md`

## 0. Authorization and stop conditions

The architecture owner explicitly approved:

| Decision | Approved choice | Binding intent |
|---|---|---|
| FI-D01 | A | Characterize reachable failures through **existing inputs and test seams**; no adapter/framework |
| FI-D02 | A | Begin with in-try route/PServer construction faults |
| FI-D03 | A | At most **three deliberate `test:full` attempts**, each with full captured logs and metadata |
| FI-D04 | A | A confirmed defect requires a **separate corrective checkpoint**, not an opportunistic fix |
| FI-D05 | A | Testing-only proof batch; reassess M02 afterward, without preauthorizing extraction |

Prior approved RC-D01=A, RC-D02=A (scoped/equivalence-first), RC-D03=A, RC-D04=C, RC-D05=A, RC-D06=A, RC-D07=A and all R7.5–R7.8 constraints remain binding.

**Authorized changes:** targeted deterministic characterization tests only, preferably extending existing test files; bounded documentation/governance updates and the final report. If a **new test file** is necessary, update the R7.7 manifest and responsibility map **only** to register it accurately; this is not permission to modify manifest semantics, validator, profiles, test runner or CI.

**Forbidden:** production `src/**` changes; changes to public contracts/exports; behavior, dependency graph or feature-gate changes; M02 private extraction; a new injection adapter, DI framework, monkey patch or global hook; changing `testing/**`, package scripts, lockfiles or CI; changing `/health`, readiness or diagnostics; touching M12/M13 stores, outbox, ACK or schema. **No commit, push, R7.9.E or R7.10.**

If the chosen existing input cannot reliably reach the claimed failure boundary, **record the limitation and do not force it**. If a genuine defect appears, preserve a minimal reproduction and stop that corrective branch for owner review; do not fix production code. Avoid tests that pass only after arbitrary delays or rely on host-specific global state.

## 1. Baseline, source evidence and worktree safety (D01)

1. Read repository `AGENTS.md` (if present), `docs/architecture/PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `TECHNICAL_DEBT.md`, and the actual local R7.9.A/B/C documents, especially:
   - `docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md`
   - `docs/architecture/R7_9_B_M02_FAILURE_BOUNDARY_PARITY_MATRIX.md`
   - `docs/architecture/R7_9_B_M02_PRIVATE_SEAM_DECISION.md`
   - `docs/architecture/R7_9_C_M02_FAILURE_INJECTION_OPPORTUNITY_MATRIX.md`
   - `docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md`
   - `docs/testing/R7_9_C_FULL_TEST_STABILITY_EVIDENCE.md`
   - `R7_9_C_RUNTIME_FAILURE_INJECTION_TEST_STABILITY_DISCOVERY_REPORT.md`
   - Accepted `docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md`.
2. Check actual branch, `git rev-parse HEAD`, `git status --short`, `git diff --name-status`, `git diff --cached --name-status`, `node --version` and `npm --version`. R7.9.A/B/C documents/prompts may be **untracked or unstaged**: do not reset, discard, overwrite, unstage or commit them. Differentiate pre-existing changes from D-specific changes.
3. Verify actual source/test locations. Inspect `src/app/create-app.ts`, `src/app/lifecycle.ts`, `src/config/configuration.ts`, `src/modules/messaging/route-registry.ts`, `src/infrastructure/socket/{socket-server,pserver-connector}.ts`, relevant persistence/cleanup implementation, and existing tests (especially construction, lifecycle, app-surface, configuration and PServer tests). Record exact source/test references for each proposed assertion.
4. Check approved owner selections are reflected in the local decision policy; update **only the approval record** (FI-D01–FI-D05=A) if still pending, retaining historical text and alternatives. Avoid rewriting historical reports.

## 2. Pre-test observable-failure contract matrix (D02)

Before writing tests, prepare a bounded evidence matrix for **two primary cases**:

**Case F1 — Duplicate route ID:** Use `createApplication({ routes: ... })` with duplicated IDs through the public configuration input, only if the current `RouteRegistry` actually rejects them. Identify where persistence has been acquired, which resources have **not** been acquired, the exact thrown error identity/type/message or stable semantic subset, the SQLite lifecycle and what can be observed without accessing internals. Do not label this evidence as socket/PServer cleanup coverage.

**Case F2 — Invalid PServer UDID:** With `enableTestPeers: true` and a supplied `pserver` configuration, construct an invalid UDID through the existing public input **only if** it deterministically fails at the expected PServer connector construction stage after Socket.IO attachment. Trace how `acquiredSockets` and `acquiredPServer` are set, the synchronous/fired-and-forgotten close paths, and what a black-box test can reliably assert. Do not assume `acquiredPServer` was assigned when constructor throws. Do not claim an asynchronous close has completed simply because `createApplication` threw.

For both cases distinguish:
- **Source-proven** acquisition/cleanup ordering and exception path;
- **Test-observable** error and externally observable resource effects;
- **Unverified** close completion, native database handle state, transport shutdown, lock cleanup or filesystem durability.

Use stable outcomes and deterministic synchronization where the existing API permits. No hard-coded occupied ports, sleeps or private-field introspection to manufacture false certainty. If independent observation of cleanup is impossible without new hooks, state **NOT PROVEN** and leave a clearly bounded future gap.

Secondary existing triggers (port conflict, same-directory lock collision, callback throw, duplicate demo registration, existing startup activation fake) may be **referenced for coverage mapping**, not included as extra implementation targets unless a missing small assertion directly protects F1/F2 and fits the one-batch scope. Avoid duplicating existing tests.

## 3. Implement targeted tests only (D03)

- Prefer editing an existing construction-related test file. Add meaningful, descriptive tests for F1 and F2 **only where preflight source proof establishes a deterministic trigger**.
- Test the thrown error using the strongest stable exact assertion grounded in source. Avoid brittle matching of incidental OS-generated error text.
- Test the resource lifecycle only as far as objectively observable. For example, validate subsequent independent application use or absence of persistent writer locks only where the scenario actually acquires those resources and the test has a reliable observation mechanism. Do not treat absence of a `.writer.lock` that was never created as proof that sockets or DB were closed.
- Restore `process.env` and clean temporary directories in `finally`; isolate fixtures, use OS-assigned ports and avoid shared mutable globals. Never leave a listener/process running after test completion. Where cleanup is fire-and-forget, avoid constructing a test that depends on guessed settlement timing.
- Characterize current behavior, including the existing exception boundaries. **Do not change runtime error handling** or retroactively require a new cleanup guarantee.
- Do not delete, skip, weaken, rename or re-order existing test assertions. No mock of the entire M02 factory that would bypass the actual constructor path.
- If new test file added, add a truthful entry to `docs/testing/R7_7_TEST_MANIFEST.json` and update the maintained responsibility map; retain accurate `requirements` / `profiles`. Otherwise leave them unchanged. Do not relabel `unknown` responsibility rows without evidence.
- Stop if reliable F1/F2 tests require any `src/**` modification or new test-only production seam. Report precise blocker and possible future independent decision; documentation-only completion of an inaccessible case is valid.

## 4. Full test stability protocol (D04)

A Full run is **one** invocation of `npm run test:full`, including failed/blocked attempts. **Maximum three attempts for this R7.9.D checkpoint total.** Do not start over the counter when changing host environment or getting a failure; avoid repeated reruns until green. Prefer authorized host execution with known child-process, Git, native SQLite and loopback support; do not describe sandbox `EPERM` as a failed application test.

For **each** attempt capture into an accessible, clearly named local log and summarize in a repository document:
- attempt number and UTC timestamp;
- branch, actual HEAD, `git status` (if relevant), Node/npm versions and exact command;
- execution environment (sandbox vs authorized host), log path, exit code, full unfiltered stdout/stderr;
- test runner stage reached, backend/playground totals, failure count, skips and **named failing test with stack trace** if present;
- whether failure came from preflight/architecture, test assertion, timeout, OS permission, process exit or is unknown.

Logs may remain outside git if huge; the evidence document must record their precise accessible path and include enough failure details for review. If an unexpected 254/255 occurs, **stop further repeated Full attempts unless a targeted, evidence-driven investigation requires one within the remaining three-attempt budget**. Never infer shared cause merely because the count is 254/255. Preserve the distinction **NOT REPRODUCED / ROOT CAUSE UNKNOWN** if all executed backend tests pass.

A newly confirmed defect is **not** authorized for correction here; record minimal reproduction and propose a separate owner-reviewed corrective checkpoint (FI-D04=A). Do not modify serial `npm test`, profile scripts, manifest or CI to conceal it.

## 5. Verification gates (D05)

Use Node `v22.23.5` and npm `10.9.9` for authoritative outcomes. Run, with exact exit codes/counts:

1. `git diff --check` and `git diff --cached --check` (report any unrelated baseline problems separately);
2. `npm run check:architecture`;
3. `npm run test:manifest`;
4. `npm run typecheck`;
5. `npm run build`;
6. **Focused tests** (exact command and new assertion count). Prefer narrow test selection without suppressing existing tests; use existing Node test runner/tsx conventions;
7. `npm run test:fast` and `npm run test:integration` where supported;
8. `npm run test:full` using the **bounded capture protocol** above;
9. `npm test -- --test-concurrency=1` as a separate backward-compatibility check if needed; do **not** count this as a Full attempt, but disclose it and do not use it to excuse a Full failure.

Baseline R7.9.C reported: 59 files / 145 import edges, manifest 55 entries, 255 backend and 32 playground tests, on Node 22.23.5; these are **historical comparisons**, not guaranteed final counts. If test additions change totals, explain every difference. No skipped or disabled existing tests, no weaker assertions. Runtime environment limitation → **BLOCKED**, not PASS.

Do not claim power-loss durability, receiver-side deduplication, exactly-once semantics or external peer proof from local tests. R7.5 P01–P06, R7.6 D01–D06, R7.7 test architecture, R7.8 C-D01/02/03=A, and R7.9 RC/FI decisions remain binding.

## 6. Deliverables and stopping point (D06)

Create:

1. `docs/architecture/R7_9_D_M02_CONSTRUCTION_FAILURE_CHARACTERIZATION_MATRIX.md` — source-exact F1/F2 preconditions, acquisition markers, exception/rollback paths, assertions, *observed vs inferred vs unverified*, residual fault-injection gaps and future seam gate.
2. `docs/testing/R7_9_D_FULL_TEST_STABILITY_VERIFICATION.md` — bounded Full attempts, metadata, complete log pointers, stage/failure identities, historical 254/255 comparison without unsupported attribution.
3. `R7_9_D_TESTING_ONLY_FAILURE_BOUNDARY_CHARACTERIZATION_VERIFICATION_REPORT.md` at repository root — owner-approved FI decisions, before/after worktree, exact test additions, result commands/counts, rollback, unresolved risks, `GO / CONDITIONAL GO / NO-GO` for reviewer assessment.
4. A **short current R7.9.D checkpoint entry** in `docs/architecture/PROJECT_STATE.md`; retain A/B/C snapshots as historical; do not prematurely close technical debts or R7.9.
5. Update R7.9.C decision policy approval record to FI-D01–FI-D05=A without changing the historical reasoning.

If one of F1/F2 cannot be tested safely, state its **deferred status**, do not invent test evidence and still complete the other authorized work. Clearly identify any pre-existing dirty paths, and **do not stage, commit or push** anything.

**Final stop:** R7.9.D is a testing-only verification checkpoint. Do not proceed to M02 extraction, private injection adapter, R7.9.E, R7.10 or production correction without the architecture owner's later explicit approval. Stop after producing the report for reviewer acceptance.
