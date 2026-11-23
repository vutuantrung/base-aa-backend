# R7.8 — Final Closure & Verification

**Codex execution prompt — governance and verification only**

## 0. Checkpoint contract

- Repository: `vutuantrung/base-aa-backend`
- Branch: `main`
- Last independently checked committed HEAD: `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`
- Verification baseline: Node.js `v22.23.5` / npm `10.9.9`
- Deliver one coherent R7.8 closure checkpoint. **Do not commit, push, merge, reset, stage/unstage unrelated changes, or begin R7.9.** Stop for architecture-owner acceptance.
- **All new Codex prompt files must reside under `prompts/`.** Do not create or move prompt files into `docs/architecture/`; architecture ADRs and evidence remain in `docs/architecture/`.

Before work, read repository `AGENTS.md` (if present), the current `PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `TECHNICAL_DEBT.md`, R7.8.A discovery report and policy, R7.8.B implementation report, R7.8.C ownership report, and the existing R7.8.C ADR/evidence matrix. Review R7.5–R7.7 policies and test governance only as needed to verify relevant invariants. **Inspect real files and actual worktree first**; do not trust historical reports over source.

Run `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git diff --name-status`, and `git diff --cached --name-status`. Some R7.8.A/B/C artifacts may still be staged, unstaged or untracked on the old committed HEAD. Preserve all such work and its staged state exactly. Do not overwrite unrelated modifications or incorrectly characterize a dirty worktree as a new commit. If HEAD differs from baseline, document it and reconcile current files before proceeding; do not silently assume the earlier SHA is current.

## 1. Owner-approved decisions (must be recorded exactly)

R7.8 owner approvals are now authoritative:

| ID | Approved decision | Boundaries |
|---|---|---|
| ES-D01 | **A** | Classify by behavior, supported runtime contract and state ownership, not folder names or `demo.*` prefixes. |
| ES-D02 | **C, scoped** | M12 Task Workflow mixed-split hypothesis only; **formal M12 remains TBD**, no workflow/store/F08/F09/ACK/outbox movement. |
| ES-D03 | **C, scoped** | M13 Resource Selection mixed-split hypothesis only; **formal M13 remains TBD**, no workflow/store/ACK/outbox movement. |
| ES-D04 | **A** | M14 Generic Session classified APP; retain `/api/sessions`, SQLite and API semantics. |
| ES-D05 | **A** | M15 Process Usage classified APP; retain `/api/process-usage`, SQLite and API semantics, distinct from M18 diagnostics. |
| ES-D06 | **A** | Preserve `ENABLE_TEST_PEERS === '1'`, programmatic top-level/nested `enableTestPeers` distinction, CLI default PServer configuration and SQLite defaults. |
| ES-D07 | **A** | Independent `testing/` package/processes; no APP→`testing/` import or new workspace. |
| ES-D08 | **A** | Incremental, compatibility-first approach with test evidence and rollback. |
| C-D01 | **A** | Retain and document existing `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` **compatibility exception**. No forced extraction. |
| C-D02 | **A** | Preserve public `startApplication()` implicit demo-rule registration for direct callers. |
| C-D03 | **A** | Retain app-local `TransformationRegistry`; no global/ambient demo registration. |

The approved A/A/A closes the **decision**, not the underlying static coupling. TD16 may remain OPEN. Do not claim an example-extraction code move occurred.

## 2. Mandatory governance/documentation updates

### F01 — Accept R7.8.C ADR

Update `docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md`:

1. Change its **current decision status** to `ACCEPTED`, with owner approval: `C-D01=A`, `C-D02=A`, `C-D03=A`. Preserve its alternatives/tradeoffs and evidence; do not rewrite historical decision history as if approved earlier.
2. Clearly state the consciously retained direct dependency `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` as a **bounded compatibility exception**, not a violation silently hidden behind a new indirection.
3. State that `startApplication()` implicit registration, `onCreated` before registration, and registration before `listen()` remain observable compatibility behavior. A direct `createApplication()` call does not register this demo rule. The top-level and nested peer flags are independent for programmatic callers.
4. Demo rule state stays application-local and retains exact ID, priority, predicate, output, invalid-input error and ACK/`processedBy` behavior.
5. Document the explicit future-reconsideration trigger (e.g., separately approved public startup migration, concrete consumers of an independent demo entrypoint), compatibility requirements, owner approval and tests. Do not schedule or authorize this work implicitly.
6. Capture the known exception-boundary characterization gap: exceptions from `onCreated` and demo registration occur before the existing `listen()`-specific try/catch; callback-throw/duplicate-rule cleanup is not yet fully tested. **Document; do not change error handling.**

### F02 — Synchronize current architecture state

- Update `docs/architecture/PROJECT_STATE.md` with a **new, current closure checkpoint**: all ES-D01–D08 and C-D01–D03 approvals; R7.8.A/B/C dispositions; documented exception; M12/M13 TBD; M14/M15 APP; retained runtime gates; actual verification evidence; pending reviewer final acceptance.
- Fix **current** stale instructions (e.g., unconditional `NO-GO for R7.8` or premature R7.9 authorization) by clearly distinguishing historical snapshot lines from current status; do not alter historic R7.8.A/B/C reports or past results.
- Review `docs/architecture/MODULE_BOUNDARIES.md`, `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md`, `docs/architecture/R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md`, `docs/architecture/TECHNICAL_DEBT.md` for contradictions. Make only narrowly necessary current-document corrections. Keep M12/M13 **TBD** and M14/M15 **APP**. TD16 remains OPEN unless new evidence meets an explicitly documented closure criterion; accepted exception is not debt elimination.
- Preserve previous residuals including R7.7 manifest governance findings, unconfirmed transient test failures and previously stated R7.5/R7.6 limitations.
- Explicitly record: R7.8 is **closed within owner-approved scope only upon final reviewer acceptance**, not that all `demo` naming, coupling or TBD classification has been removed.

### F03 — Final boundary audit (read-only)

Verify against current source, not merely reports:

- `src/main.ts`, `src/app/lifecycle.ts`, `src/app/create-app.ts`, `src/config/configuration.ts`, `src/examples/pserver-to-aaui.ts` and relevant gateway/transform logic;
- retained direct APP→example import is one documented exception and no novel APP→playground import is introduced;
- `testing/` package, launch/test scripts, dependencies and process isolation remain independent;
- `onCreated`/registration/listen order, direct startup semantics, two peer flags, CLI PServer default and SQLite differences remain unchanged;
- M12/M13 workflows, stores, durable paths and named-peer behavior are unchanged; M14/M15 API and SQLite behavior unchanged;
- rule identity/output/errors and no modification to public `ApplicationInstance` or `startApplication` signatures.

If the audit finds an unexpected discrepancy, document exact evidence and mark the closure as conditional/NO-GO as appropriate. Do not make code edits to fix it in this task.

## 3. Explicit no-code-change scope

This checkpoint is **documentation + read-only verification only**.

Do not modify: `src/**`, `tests/**`, `testing/**`, `scripts/**`, `package.json`, lockfiles, CI workflows, public API, database schema/paths, test manifest/profiles or Node runtime policy. No file movement, no new dependencies, no dynamic imports, no compatibility hooks/adapters, no startup registration refactor and no arbitrary formatting of production files.

Retain all approved reliability requirements:
- R7.5 P01–P06: exact ACK and receipt/delivery semantics; uncertain no-unsafe-replay, dedupe, quarantine, quotas, writer locks, safe process-crash limitations; no auto-removal of stale locks.
- R7.6 D01–D06: tracked admission, one bounded monotonic shutdown deadline (default 15s), rollback, late settlement, writer ownership and peer-ACK drain.
- R7.7: manifest validator, Fast/Integration/Full scripts, original serial `npm test`, Node 22.23.5 baseline, native SQLite preflight, all existing regression assertions and playground coverage.
- R7.8: no M12/M13 move or new product ownership claim, no changes to M14/M15 API behavior, feature gate, wire format, HTTP auth/status or external consumers.

## 4. Verification requirements

Use **Node.js v22.23.5** as the authoritative full-gate runtime. Record actual Node/npm versions and commands, exact exits, test counts and skips. Run, if environment supports them:

```bash
node --version
npm --version
git status --short
git diff --check
git diff --cached --check
npm run check:architecture
npm run test:manifest
npm run typecheck
npm run build
npm run test:fast
npm run test:integration
npm run test:full
npm test -- --test-concurrency=1
```

- Full gate should cover backend and playground; the prior R7.8.C evidence was **255/255 backend, 32/32 playground, 55/55 manifest files**, but report **actual** counts rather than hardcoding them as expected proof.
- Confirm changes during this checkpoint are restricted to approved documentation and the final closure report, distinguishing them from pre-existing staged/unstaged files.
- Compare source paths/behavior evidence to the R7.8.C compatibility matrix; do not invent a successful extraction.
- If sandbox policy prevents `git`, listener binding, SQLite addon or child process execution, label blocked commands **BLOCKED**, not PASS. If a transient failure occurs, capture failing file/test, error stack and rerun evidence, and explicitly separate unconfirmed flakiness from an established regression.
- No claims of power-loss durability, remote receiver behavior, exact-once effects or untested environment parity.

## 5. Final deliverable

Create a root report:

**`R7_8_FINAL_CLOSURE_VERIFICATION_REPORT.md`**

Include:
1. Current actual HEAD, branch, initial/final dirty paths, Node/npm/runtime and exact governance-only diff;
2. ES-D01–D08 plus C-D01–D03 approval trace, ADR accepted status and intentionally retained compatibility exception;
3. Explicit source import/dependency findings, current APP/DEMO/TBD classifications, TD16 status and rationale for no extraction;
4. Full compatibility matrix summary for lifecycle callbacks, direct/programmatic and CLI flags, example transform, APIs/persistence and test governance;
5. Focused and full verification commands, exits, counts, skipped/blocked cases, preexisting anomalies and evidence limits;
6. Outstanding risks: TD16, callback exception boundary, consumer inventory unknowns, historical intermittent 254/255, and other unchanged deferred debts;
7. Exactly which documentation files were changed and rollback strategy (restore only checkpoint-specific doc edits; preserve R7.8.A/B/C evidence);
8. **Final recommendation:** `GO`, `CONDITIONAL GO` or `NO-GO` for reviewer acceptance of R7.8 closure **within the approved scope**. Never claim that code extraction happened;
9. R7.9 as **NOT STARTED / NOT AUTHORIZED**, pending a separate explicit owner decision after final R7.8 review and commit.

If a problem is found, do not conceal it or alter unrelated code to obtain a green test. State the blocker and precise remediation proposal for owner approval.

**Stop** after documentation updates, verification and report. **No commit/push, no source changes, no R7.9 work.**
