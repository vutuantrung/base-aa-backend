# R7.10 — Architecture Scope & Responsibility Assessment

**Codex checkpoint:** R7.10.A — Architecture Scope & Responsibility Assessment (discovery / decision preparation only)
**Repository:** `vutuantrung/base-aa-backend`
**Branch:** `main`
**Expected committed HEAD:** `ea08e70f7855c96e8ce7ab18c83c224aada1f545` (`checkpoint R7.9 final architecture closure`)
**Authoritative runtime if verification is needed:** Node.js `v22.23.5`, npm `10.9.9`
**Mode:** READ-ONLY SOURCE/TEST REVIEW + DOCUMENTATION ONLY. No production, test, configuration, manifest, script, CI, schema, package, lockfile or public-contract changes.
**Approval scope:** Architecture Owner has authorized **R7.10 architecture assessment only** by requesting this checkpoint. This does **not** approve implementation, scope selection, ownership reclassification, debt closure, or any R7.10.B activity.

## Mission

Perform a **breadth-first, system-wide assessment** of the next architecture scope after the accepted R7.9 final closure. Evaluate actual business responsibilities, reliability risks, contract and caller boundaries, operational needs, existing tests and technical debt. Distinguish **observed source behavior**, **test-observed evidence**, **documented owner decision**, **hypothesis**, and **unknown**. Do not select a preferred implementation simply because a module is large, awkward or has residual technical debt. Build an owner-reviewable prioritization and a small, explicit decision package for the next phase.

Do not resume M02 extraction by default. Do not treat R7.9's deferred M02 extraction as a defect, nor assume R7.10 means continued refactoring. A viable outcome is **no implementation now**; another is a bounded characterization, business-boundary discovery, deployment verification, or a separately approved implementation candidate. Make options evidence-driven.

## Immutable accepted baseline

1. R7.9 closure HEAD `ea08e70f7855c96e8ce7ab18c83c224aada1f545` is the expected starting point, not an instruction to reset if the actual HEAD differs. Confirm branch, `git rev-parse HEAD`, `git status --short`, staged and untracked paths, and inspect the actual diff since expected HEAD if it differs. Record drift without overwriting or switching branches. Preserve unrelated worktree content, including this prompt.
2. Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md`; review the latest R7.9 final report and relevant approval policies. Keep historical checkpoint sections unchanged; prepend a concise *current* R7.10 assessment status only after actual work.
3. R7.5 P01–P06: conservative durable receipt/ACK/replay, uncertain delivery, bounded attempts/quotas, writer locks and ownership; do not imply remote exactly-once, receiver dedupe, filesystem power-loss or deployed production proof.
4. R7.6 D01–D06: admission cutoff, tracked work, monotonic single bounded shutdown deadline, startup rollback, late settlement and writer lease retention. A timeout does not cancel live mutations.
5. R7.7: 55-file test manifest, original serial `npm test`, additive Fast/Integration/Full profiles, separated playground; preserve responsibility-map `unknown` entries. Node 22.23.5 is the authoritative runtime. Do not relabel unknown from imports/profile alone.
6. R7.8 C-D01/02/03=A: accepted explicit static `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` compatibility edge; `startApplication()` callback → conditional demo registration → `listen`; app-local `TransformationRegistry`. Preserve top-level and nested peer-gate distinctions, exact `ENABLE_TEST_PEERS === '1'`, CLI/direct-factory defaults, and `/health` semantics.
7. R7.9 RC-D01=A, RC-D02=A **scoped/equivalence-first**, RC-D03=A, RC-D04=C, RC-D05=A, RC-D06=A, RC-D07=A; FI-D01–FI-D05=A. M02 extraction is **DEFERRED — EQUIVALENCE NOT PROVEN**, with no runtime extraction. M12/M13 remain **TBD**, M14/M15 **APP**. TD15–TD17 and other open debts remain open.
8. R7.9 F1 duplicate-route test checks exact error and SQLite file reuse but does **not** prove original native DB handle closure. F2 invalid-PServer test checks exact error but asynchronous socket-close completion remains **NOT PROVEN**. Historical 254/255 failures are unattributed, and focused PASS versus earlier Full FAIL discrepancy remains unresolved. Avoid inventing a common cause.
9. Preserve public APIs/returned application handles, legacy exports, wire event/ACK/error precedence, persistence paths and schemas, M09 partial fan-out, route-specific HTTP statuses/auth order, health/readiness distinction, signal ownership and test selection unless a future owner decision explicitly supersedes them.

## Sources — targeted first, then inspect current code/tests as needed

- `R7_9_FINAL_ARCHITECTURE_CLOSURE_VERIFICATION_REPORT.md`
- `docs/architecture/PROJECT_STATE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/architecture/DEPENDENCY_INVENTORY.md`
- `docs/architecture/APPLICATION_SURFACE_INVENTORY.md` (if present)
- `docs/architecture/R7_9_A_RUNTIME_RESPONSIBILITY_INVENTORY.md` (RA01–RA09)
- `docs/architecture/R7_9_A_RUNTIME_CLEANUP_OPPORTUNITY_CATALOG.md` (RC-01–RC-09)
- `docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md`
- `docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md`
- `docs/architecture/TECHNICAL_DEBT.md` (actual path, not root)
- `docs/testing/R7_7_TEST_MANIFEST.json` and relevant test profiles/architecture checker
- Directly relevant `src/**`, `tests/**`, `testing/**` for evidence where necessary.

The R7.9 inventory and catalog are **starting evidence, not the final R7.10 answer**. Cross-check up-to-date code and debt entries, including **TD02/03/04**, **TD10–TD17**, **TD18–TD21**, without assuming all have equal priority or that their historical status should be changed. Do not rewrite old docs to make outcomes look consistent.

## Workstream A01 — Baseline, goals and architecture decision context

- Verify committed baseline and dirty state. Compare R7.8→R7.9 and R7.9 final commits only enough to establish accepted source shape. Note R7.9's actual delta and that no production extraction occurred.
- State current system's *observed capabilities* versus *unverified target requirements*. Do not infer production business objectives from module names, examples, demos, test fixtures, comments or old roadmap titles.
- Explicitly distinguish **architectural hygiene**, **business capability ownership**, **contract/deployment compatibility**, **durability/reliability**, **observability**, **test confidence**, and **operational readiness**. Identify decisions requiring product/operator/external-client evidence.

## Workstream A02 — Breadth-first Responsibility Assessment

Cover the whole system uniformly at **Level 1** before deep-diving any area. Use RA01–RA09 as a cross-reference, but also map module owners M01–M18 and external systems. For every area record:

1. Current responsibility and ownership/classification, with grounded source links.
2. Internal consumers; known or unknown external callers/operators.
3. Contract and compatibility surface (API, events, ACK, configuration, files, lifecycle, logs).
4. Current reliability/test evidence and gaps, including proof limits.
5. Observed pain/risk versus conjecture; consequence of doing nothing.
6. Candidate next action **type**: NO ACTION, CHARACTERIZATION, DISCOVERY, PRODUCT/OPERATOR DECISION, OPERATIONS/DEPLOYMENT VERIFICATION, BOUNDED IMPLEMENTATION **PROPOSAL ONLY**, or DEFER.
7. Cross-boundary dependencies, prerequisite decisions and hard stop conditions.
8. Confidence and explicit unknowns.

Keep breadth-first parity: do not exhaustively redesign M02, M12, M13 or M18 while leaving other areas at one-line summaries. M12/M13 remain TBD, M14/M15 APP; do not reclassify ownership. Identify actual business boundaries separately from deployment/infrastructure modules; where requirements are unknown, say so.

## Workstream A03 — Candidate Portfolio and Prioritization

- Build a short list (ideally 5–9) of concrete *next-checkpoint* candidate scopes, not implementation work orders. Include alternatives from distinct responsibility groups; do not let M02 dominate by default. May include exact feature-mode characterization (RC-02), M18 diagnostics requirements (RC-03/09), external caller/legacy exports discovery (RC-04/TD17), M12/M13 product-ownership discovery (RC-06), deployment/runtime evidence (TD18/19), operational durability evidence (TD10/11), bounded M07/M17 characterization (RC-07), or test mapping/evidence (RC-08), but prioritize from evidence rather than this list.
- For each candidate assign: why now, observable benefit, scope size, risk/impact if deferred, confidence, dependent owner evidence, reversibility, contract migration exposure, test burden, and a no-go trigger. Categorize **discovery vs implementation** honestly.
- Recommend an ordered **small first next checkpoint**, one alternative, and a **defer/no-action** option. Rank by evidence-weighted benefit and ability to define a verifiable acceptance contract, not complexity or lines of code alone. Avoid precise numerical priority scores without explainable criteria.
- Explicitly surface conflict with R7.8/R7.9 decisions when applicable. No unapproved modification or superseding ADR.

## Workstream A04 — R7.10 Owner Decision Package

Draft **AS-D01–AS-D06** with 2–3 real, mutually exclusive, trade-off-aware options and a recommended choice for each, **all PENDING OWNER APPROVAL**:

- **AS-D01 — R7.10 primary objective:** e.g. business-boundary ownership evidence vs risk-driven reliability/operational evidence vs bounded maintainability improvement.
- **AS-D02 — First bounded checkpoint selection:** choose among the short-listed source-backed candidates (include an explicit option to defer implementation).
- **AS-D03 — Ownership/contract discovery policy:** preserve TBD until evidence vs narrowly survey external callers/product owners vs premature reclassification (flag unsafe).
- **AS-D04 — Implementation and compatibility gate:** discovery/characterization first, then separately approved implementation vs implementation now vs stop/no action; protect R7.5–R7.9.
- **AS-D05 — Verification and failure-evidence policy:** targeted gates, 55-file manifest/serial/Full/independent playground, bounded capture and environment qualification; no test weakening.
- **AS-D06 — Scope governance and exit criteria:** stop/owner approvals, rollback/corrective checkpoint boundaries, what constitutes R7.10.A completion and what would authorize R7.10.B (not implicit).

Do not make prior RC/FI decisions appear reopened by default. Include explicit decision provenance, conflict matrix, and consequences for defer/unknown. End with an **approval record of PENDING OWNER APPROVAL** only. Codex must not select approved options on the owner's behalf.

## Workstream A05 — Verification, traceability and reporting

- Check the integrity of the touched documentation with `git diff --check`, `git diff --cached --check` and a precise changed-file inventory. Review architecture/manifest checks under Node 22.23.5 if available, and report exact command, run environment, exit code and observed result.
- Because this is **documentation-only**, do **not automatically execute Full** or alter test execution scripts. Use the verified committed R7.9 Full baseline (257/257 backend + 32/32 playground) as **historical evidence**, clearly labeled; new test results must be independently observed and dated. If actual code drift or a concrete need makes Full necessary, seek owner approval before spending a new Full investigation budget. Never claim tests ran when they did not.
- Record available/unavailable system knowledge, source paths/tests, contradiction/uncertainty, risks and owner questions; distinguish `UNVERIFIED` from failure. No old test report should be rewritten.
- Update `docs/architecture/PROJECT_STATE.md` **only** by prepending a compact R7.10.A *assessment pending owner review* section. Do not mark R7.10.A/C as completed or R7.10.B as authorized. Do not alter `TECHNICAL_DEBT.md` or any existing decision policy/ADR in this assessment.

## Deliverables

Create the following exact files (plus only the compact project-state append/prepend stated above):

1. `docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_RESPONSIBILITY_MATRIX.md` — uniform breadth-first current-state RA01–RA09/M01–M18 assessment.
2. `docs/architecture/R7_10_A_CANDIDATE_SCOPE_PRIORITIZATION.md` — 5–9 candidate checkpoint choices, cross-boundary prerequisites, alternate/no-action, ranking rationale.
3. `docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md` — AS-D01–AS-D06 options and approval record, all **PENDING**.
4. `R7_10_A_ARCHITECTURE_SCOPE_RESPONSIBILITY_ASSESSMENT_REPORT.md` — owner-facing overall report: source baseline, evidence/unknowns, comparison, scoped recommendation, verification performed/not performed, changed files, stop.
5. Prepend concise R7.10.A status to `docs/architecture/PROJECT_STATE.md` while retaining historical sections.

Place **prompts only in `prompts/`**. This prompt is an input artifact; preserve it exactly. Do not generate additional prompts in root or `docs/architecture/`.

## Prohibitions and hard stops

- **No changes** to `src/**`, `tests/**`, `testing/**`, `scripts/**`, `package.json`, `package-lock.json`, source configuration, database schemas, `docs/testing/R7_7_TEST_MANIFEST.json`, CI, dependency graph, public APIs, or exported types.
- No M02 extraction, F2 cleanup fix, general DI, M12/M13 movement/classification, M18 logging migration, legacy-export deletion, new service boundaries, feature gate normalization, `/health` changes or runtime behavior changes.
- Do not close/reword TD entries, rewrite historical R7.9 decisions/reports, silently interpret lack of external consumers as proof of no consumer, or claim deployed production guarantees from local tests.
- Do not stage, unstage, reset, stash, commit, push, or switch branches. Preserve unrelated worktree changes.
- If HEAD is unexpected or the assessment uncovers a concrete incompatible defect, document and stop for Owner approval before an implementation fix. If an exact source/file is unavailable, document that limit instead of inventing content.
- **No R7.10.B implementation and no R7.11.** R7.10.A ends at the owner decision gate.

## Final reply expected from Codex

Report (a) actual HEAD and worktree status, (b) breadth-first coverage, (c) candidate shortlist and primary/alternative recommendation, (d) AS-D01–AS-D06 all pending, (e) verified vs historical test evidence, (f) exact changed paths and any blockers, (g) explicit STOP for Architecture Owner review. Never present the assessment as approval for implementation.
