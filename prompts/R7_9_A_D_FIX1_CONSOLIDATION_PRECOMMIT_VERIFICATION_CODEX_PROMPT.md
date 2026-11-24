# R7.9.A–D/FIX1 — Consolidation & Pre-Commit Verification

**Repository:** `vutuantrung/base-aa-backend`
**Branch:** `main`
**Expected last committed HEAD:** `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`
**Execution mode:** Consolidation, audit, verification and documentation only. **Do not commit or push. Do not begin R7.9.E or R7.10.**

## Objective

Reconcile the accepted R7.9.A, B, C, D and D-FIX1 work in the current working tree, verify the final test-only delta, make the documentation accurately reflect architecture-owner acceptances, and produce a precise staging/commit plan for the human owner. Do not perform a new refactor, add an injection seam, or alter production contracts.

## 1. Baseline and scope audit

1. Read `AGENTS.md` if present, relevant `docs/architecture/PROJECT_STATE.md`, the R7.9.A/B/C/D/FIX1 reports, decision policies, evidence matrices, and `docs/testing/R7_9_D_FULL_TEST_STABILITY_VERIFICATION.md`.
2. Record `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git diff --name-status`, `git ls-files --others --exclude-standard`, `git diff --cached --name-status`; identify pre-existing/unrelated files. Preserve tracked/staged/untracked content. Do not reset, unstage, or overwrite.
3. Confirm all R7.9 prompt files are in `prompts/` and not accidentally in `docs/architecture/` or repository root.
4. Produce an exhaustive changed-path inventory grouped into R7.9.A, B, C, D, FIX1, and unrelated. Compare test changes to the accepted D/FIX1 reports; no production source (`src/**`), scripts, package/lock files, CI, or runtime config changes are authorized.
5. If HEAD differs from expected, reconcile the actual current source and explicitly disclose drift before proceeding. Never assume working-tree status from an earlier report.

## 2. Owner-accepted decisions — preserve

- RC-D01=A (narrow responsibility), RC-D02=A scoped (failure-boundary parity first), RC-D03=A (preserve feature gates), RC-D04=C (defer diagnostics), RC-D05=A (retain exports), RC-D06=A (M12/M13 TBD), RC-D07=A (full gates).
- FI-D01=A (existing triggers), FI-D02=A (route/PServer inputs), FI-D03=A (bounded complete logs), FI-D04=A (separate defect correction), FI-D05=A (testing-only proof).
- R7.8 C-D01=A / C-D02=A / C-D03=A, including documented `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` compatibility exception, direct `startApplication()` registration and app-local registry.
- M12 and M13 remain formally TBD; M14 and M15 APP. TD15–TD17 remain open unless a separately approved closure occurs.
- R7.5 P01–P06 persistence/ACK/no-unsafe-replay/writer-lease invariants; R7.6 D01–D06 deadline/admission/rollback/late-settlement; R7.7 test manifest, serial `npm test`, additive profiles and independent playground.

## 3. Audit the D/FIX1 test-only delta

Inspect `tests/application-surface-compatibility.test.ts` and its actual diff against HEAD:

- F1 duplicate route IDs: exact original `Error('Duplicate route: duplicate')`, SQLite reopen and query; confirm `SELECT name FROM sqlite_master WHERE type = ? AND name = ?` result projection is asserted as `sessionTable?.name === 'Session'` with appropriate typing.
- F2 blank/invalid PServer UDID: error `PServer VM UDID is required`; confirm F2 test body and assertion were not changed by FIX1.
- Do not infer native DB handle closure, socket close completion or all resource rollback just because a test passes. F2 async close remains **NOT PROVEN**.
- The old D Full 256/257 failure was a named, corrected F1 assertion defect, not a demonstrated production defect. The historical R7.8.B/R7.9.B 254/255 intermittent outcomes remain unrelated/unknown unless new evidence proves otherwise.
- Explain any discrepancy between focused PASS and old Full FAIL as **UNRESOLVED** unless actual retained log/source snapshot proves it.
- Do not alter F1/F2 tests or production source in this consolidation checkpoint except for a narrowly necessary documentation typo; report any unexpected test delta as a review blocker.

## 4. Governance reconciliation

Update `docs/architecture/PROJECT_STATE.md` minimally with a *current consolidation status* and owner acceptances for A/B/C/D/FIX1, retaining historical reports and source baseline references. Verify `docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md` and `docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md` record the approved selections. Confirm no report falsely claims M02 extraction occurred or F2 socket cleanup was proven. Do not retroactively rewrite historical reports. If a status is ambiguous, document it rather than inventing approval.

## 5. Verification and evidence

Use **Node.js v22.23.5** and npm 10.9.9 for authoritative tests, with native SQLite, localhost and child-process permissions as required.

1. `git diff --check` and `git diff --cached --check`; include untracked/new-file hygiene in the final audit.
2. `npm run check:architecture`.
3. `npm run test:manifest` (baseline 55 entries, subject to current actual).
4. `npm run typecheck`; `npm run build`.
5. Focused: `node --import tsx tests/application-surface-compatibility.test.ts` (baseline 7 tests after F1/F2 additions).
6. `npm run test:fast`; `npm run test:integration`.
7. `npm run test:full` and `npm test -- --test-concurrency=1`.

For any Full verification attempts, **at most 3 in this checkpoint**, record complete stdout/stderr, timestamps, absolute source SHA, Node/npm versions, exact commands, exit codes, test identities and count, and no skips. Keep bounded attempts, don't repeat until pass. Existing FI-D03 policy remains binding. If an unexpected failure occurs, capture and diagnose; do not silently correct tests or source.

A host-authorized rerun may be required if sandbox `git spawnSync EPERM` / network `listen EPERM` blocks the tests. Label BLOCKED correctly; do not count it as a successful suite.

Baseline from reviewed FIX1 report: Full 257/257 backend + 32/32 playground; standalone serial 257/257; Fast 88/88; Integration 69/69 backend + 32/32 playground. These are **historical expected references**, not substitute evidence for actual current runs.

## 6. Deliverables

Create `R7_9_A_D_FIX1_CONSOLIDATION_PRECOMMIT_VERIFICATION_REPORT.md` at repository root containing:

- HEAD, versions, initial/final dirty state; complete grouped changed-file inventory with unrelated exclusions;
- RC/FI approvals, R7.8 compatibility constraints, M12–M15 classifications and remaining debts;
- exact F1 corrective diff, F2 unchanged status and evidence limitations;
- commands, complete counts, exit codes, any blocked attempts and log locations;
- current verification outcome, risks and precise GO / CONDITIONAL GO / NO-GO **for human staging/commit review**;
- **explicit human-owned** suggested `git add -- <approved exact paths>` list and no unrelated files, plus suggested commit title `checkpoint R7.9 A-D FIX1`;
- post-commit verification steps: compare `main` against `d9b252f`, confirm only authorized paths, verify new SHA and decision documents.

Update `PROJECT_STATE.md` with one concise status note only; preserve accepted source behavior and histories.

## 7. Strict stop rules

- No commit, push, staging, unstage/reset, rewrite of prior reports or migration.
- No production changes, test edits, package/scripts/CI changes, new injection seam, public contract changes, feature-gate changes, diagnostics or `/health` changes.
- No claim of fixed historical 254/255 behavior, no proof of F2 async socket close, no M02 extraction, no closing TD15–TD17.
- If any required parity/test verification fails, stop with a named blocker and complete evidence. Do not silently expand scope.
- Do not begin R7.9.E or R7.10. Stop for architecture-owner review.
