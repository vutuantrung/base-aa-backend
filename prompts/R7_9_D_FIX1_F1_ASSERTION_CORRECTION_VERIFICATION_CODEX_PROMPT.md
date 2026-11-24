# R7.9.D-FIX1 — F1 Assertion Correction & Verification

**Mode:** corrective, testing-only; **one checkpoint**.
**Repository:** `vutuantrung/base-aa-backend` · **Branch:** `main`
**Expected committed baseline:** `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`
**Authoritative environment:** Node.js `v22.23.5`, npm `10.9.9`.
**Authority:** Owner approved R7.9.D-FIX1 specifically to investigate and correct the newly added **F1 assertion** in `tests/application-surface-compatibility.test.ts`, then verify. FI-D01–D05=A, RC-D01–D07 and all R7.5–R7.8 constraints remain binding.

## 0. Stop rules and preservation

- **Do not modify `src/**`, `testing/**`, runtime configuration, public contracts/exports, dependencies, CI, `package.json`, scripts, test manifest/profile semantics or architecture enforcement.** No new fault-injection adapter or DI framework.
- **Do not modify F2 (invalid PServer UDID)**, its expectations, cleanup behavior, test body or evidence. The fire-and-forget socket-close completion remains **NOT PROVEN**.
- In `tests/application-surface-compatibility.test.ts`, change **only the minimum F1 test assertion/its directly necessary query projection** to accurately match the actual SQL result without weakening the intent. Do not rename/drop/skip tests, suppress failure, change test input, remove the DB reopen/query check, or change the failure message assertion.
- Do not rewrite historical reports or overwrite unrelated staged/unstaged/untracked R7.9.A/B/C/D work. Do not reset, unstage, commit or push. Do not start R7.9.E or R7.10.
- **Stop and report** if F1 cannot be corrected within this narrow test-only scope, if a production defect is found, if the difference between focused and Full reveals another failing test or nondeterminism, or if cleanup contract changes appear necessary. FI-D04=A then requires a separate owner-approved corrective scope.

## 1. Establish actual baseline before touching tests

1. Read `AGENTS.md` if available, `prompts/R7_9_D_TESTING_ONLY_FAILURE_BOUNDARY_CHARACTERIZATION_VERIFICATION_CODEX_PROMPT.md`, `R7_9_D_TESTING_ONLY_FAILURE_BOUNDARY_CHARACTERIZATION_VERIFICATION_REPORT.md`, `docs/architecture/R7_9_D_M02_CONSTRUCTION_FAILURE_CHARACTERIZATION_MATRIX.md`, `docs/testing/R7_9_D_FULL_TEST_STABILITY_VERIFICATION.md`, `docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md` and recent R7.9.A–C evidence. Respect the historical reports.
2. Capture `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, staged/unstaged diffs for **the target file** and the manifest; Node/npm versions. R7.9.D edits may be uncommitted at this SHA; **inspect the working tree F1**, not merely the committed GitHub version.
3. If expected F1/F2 tests are missing, the HEAD differs, or unrelated changes overlap the target, stop and document the blocker; do not reconstruct or overwrite unknown work.
4. Confirm the exact F1 test title, line numbers, SQL query, actual query result type and values, assertion semantics and DB reopen/close lifecycle. Record its before-change source excerpt in the report. Independently verify F2 code is unchanged before/after.

## 2. Diagnose the exact mismatch first — NO EDITS YET

The prior Full attempt 2 reported failure at `tests/application-surface-compatibility.test.ts:99:14`:

```text
actual:   { name: 'Session' }
expected: { type: 'table', name: 'Session' }
```

It reportedly used `assert.equal()` on two objects (reference equality); it also compared **different shapes**. Do not blindly replace with `assert.deepEqual()`.

Determine from the **actual SQL SELECT projection**, SQLite query API and declared row type whether the correct contract is:
- only `name` projected, and the assertion should validate that value (e.g. `assert.equal(row?.name, 'Session')` **only if directly supported**); or
- `type, name` intentionally projected, in which case the query/expected projection must be reconciled while still proving the same DB-reopen purpose.

Make the smallest appropriate correction. Check case sensitivity of table names and whether the test proves the intended SQLite state or merely an unrelated table lookup. Do **not** claim native-handle release based solely on successful reopen; report evidence accurately.

### Focused PASS vs Full FAIL is a mandatory investigation

Before editing, reconcile how the R7.9.D focused host run was reported as **7/7 PASS**, while later Full was **256/257 FAIL** on the new F1 assertion. Inspect available raw logs (including `/tmp/r7_9_d_test_stability/full-attempt-02-host.log` if still present), prior test file edits or diff timestamps, exact invocation and runner selection, environment/DB path differences, and relevant Git status when recorded. Distinguish:
1. **Observed and demonstrated reason** (with exact evidence);
2. **Plausible but not verified explanation**;
3. **Unresolved** if historical focused output/source snapshot is unavailable.

If this cannot be established from evidence, explicitly say **focused-versus-Full discrepancy unresolved**; never invent a root cause, and never identify it with older 254/255 failures. This investigation is mandatory but an unresolvable historical evidence gap does not authorize expanding scope.

## 3. Minimal allowed correction and local validation

1. Change only the defective F1 assertion/query projection in `tests/application-surface-compatibility.test.ts`; no F2 edits, no unrelated refactors.
2. Check the corrected test still verifies **both**: (a) duplicate route ID causes the exact expected construction error, and (b) the SQLite file is reopenable and a meaningful query is successful. Avoid equating this with proof of every native resource having closed.
3. Compare before/after diff at individual assertion level. Confirm the test count, error assertion, DB-path management, cleanup/finally handling, and F2 test remain unchanged.
4. Run focused test on an environment with permitted localhost listeners. Capture exact command, exit code, 7/7-or-actual results and any failure details. Do not mask `EPERM` as an application error. If focused test fails for a different reason, stop for diagnosis before a Full attempt.

## 4. Verification — bounded and reproducible

**At most THREE invocations of `npm run test:full` TOTAL during this FIX1 checkpoint**, regardless of success/failure or sandbox/host. Count a blocked attempt too. Do not re-run Full until it passes. Use the authorized host environment if sandbox cannot spawn Git, bind localhost or load native SQLite. All authoritative checks under Node `v22.23.5`/npm `10.9.9`.

Run, where supported:

```bash
node --version
npm --version
git diff --check
git diff --cached --check
npm run check:architecture
npm run test:manifest
npm run typecheck
npm run build
node --import tsx tests/application-surface-compatibility.test.ts
npm run test:fast
npm run test:integration
npm run test:full
npm test -- --test-concurrency=1
```

- `npm run test:full` must log **full stdout/stderr**, invocation timestamp/attempt ID, source HEAD and dirty-test-file hash, Node/npm, environment/host vs sandbox, exit code, failing test identity/stack, selected stages and counts. Capture artifacts outside repository or in the designated evidence documentation; do not add raw logs to Git unless expressly requested. Note that `test:full` itself runs the unchanged serial backend test command and then playground.
- `npm test -- --test-concurrency=1` is a separate serial compatibility gate, **not** a Full invocation. Preserve its failure identity/log too if it fails; do not silently relabel it Full.
- On any newly named failure, retain full output and diagnose first. Do not weaken assertions or broaden production scope. If a test fails and later passes, report **all** results and do not erase the failed attempt.
- Never claim a PASS for blocked sandbox tests. Do not infer power-loss, remote-peer/exactly-once guarantees from local Linux tests.
- R7.7 manifest has 55 files, 50 backend and 5 playground at baseline; R7.9.D adds F1/F2 into an existing test file (historically backend 257 total). Use **actual** test totals rather than assuming the baseline if the worktree differs.

## 5. Deliverables and reporting

Create `R7_9_D_FIX1_F1_ASSERTION_CORRECTION_VERIFICATION_REPORT.md` at repository root. Include:

1. Actual baseline, initial dirty paths, target F1/F2 test locations, and exact files changed; no pre-existing file lost or staged.
2. The SQL SELECT projection, SQLite result shape, root cause of the F1 assertion defect, exact minimum correction and why its assertion preserves test intent.
3. Focused PASS/Full FAIL discrepancy: verified explanation with evidence **or explicitly unresolved** and why; separate from historical 254/255.
4. F1 and F2 before/after contract table. F2 unchanged, socket cleanup completion remains **NOT PROVEN**. Do not infer production defect from malformed assertion.
5. Verification commands, runtime, stage-by-stage counts, exact exit codes, full-attempt IDs (maximum 3), log paths and any residual failures. Distinguish host from sandbox.
6. `git diff --check`, `git diff --cached --check`, scoped `git diff` and test assertion preservation check. No new manifest entry unless an actually approved new test file is present (none is requested here).
7. Invariant review for R7.5 P01–P06, R7.6 D01–D06, R7.7 suite policies and R7.8 C-D01/02/03=A; M12/M13 TBD, M14/M15 APP, stable flags/public API.
8. **GO / CONDITIONAL GO / NO-GO** recommendation for R7.9.D corrective acceptance, with remaining fault-coverage gaps and specific rollback instructions limited to the F1 assertion change.

Update **only a compact current status note** in `docs/architecture/PROJECT_STATE.md` if the repository uses it for checkpoint progress; do not overwrite the previous D report, parity matrix, stability evidence or approved decision policy. The user's preferred folder convention is `prompts/` for **all prompt files**; do not create prompts elsewhere.

## 6. Mandatory final stop

Stop after the corrected test, verification and report. **No commit/push. No production modification. No F2 modification. No R7.9.E or R7.10.** Await Architecture Owner review.
