# R7.10.C — Architecture Scope Reassessment & Decision (Codex Prompt)

**Repository:** `vutuantrung/base-aa-backend`
**Branch:** `main`
**Expected committed HEAD:** `3af7920814e2260ae3cdfeef220ef75fbea0daeb` (`update 11240954`)
**Authoritative Node baseline:** Node.js `v22.23.5`, npm `10.9.9`
**Mode:** **Decision-only architecture discovery / documentation.** No production, test, config, CI, manifest, script, dependency, schema, API, runtime, or ownership changes. No staging, committing, or pushing. Do not start R7.10.D or R7.11.

## Mission

Complete one bounded **R7.10.C — Architecture Scope Reassessment & Decision** checkpoint. After the committed R7.10.A/B assessment and exact feature-mode characterization, decide whether any further architecture work is justified by concrete business/operational evidence. Make a defensible owner-facing decision package rather than a predetermined implementation roadmap.

Three valid outcomes must remain independently available:

- **A — Preserve feature-mode behavior and close that bounded topic.** Record that existing CLI exact-string gates, top-level/nested divergence, `createApplication` vs `startApplication` defaults and demo registration are intentional compatibility semantics, not evidence of a defect. Leave TD16 open for broader unresolved caller/ownership questions; no production redesign.
- **B — Separately scope external caller / product ownership discovery.** Identify **which** public surface, supported distribution, product owner, operator, or deployment owner must provide affirmative evidence. Define a bounded survey/inventory and stop if evidence cannot be obtained. Do not infer external nonuse from local grep or reclassify modules.
- **C — Explore additive/versioned capability design only when a specific accepted requirement exists.** Specify the motivating requirement, observable benefit, compatibility/versioning and migration contracts, decision owner, tests, rollback and guardrails; if absent, mark NOT ELIGIBLE and do not design speculative abstractions.

These options are not mutually exclusive across separate objectives: option A can be the disposition of feature-mode semantics while B is proposed as *separate* future discovery. Do not present a choice for B as approval to implement C or change flags.

## Baseline and required reading

1. Read `AGENTS.md` and current `docs/architecture/PROJECT_STATE.md`; verify branch, `git rev-parse HEAD`, `git status --short`, and staged paths. Compare with expected SHA. Preserve dirty/untracked/staged user work including all R7.10.A/B artifacts; never reset, stash, switch branch, stage, commit or push. If HEAD deviates, report exact differences and reassess the scope safely before proceeding.
2. Read **targeted** relevant sections of:
   - `R7_10_A_ARCHITECTURE_SCOPE_RESPONSIBILITY_ASSESSMENT_REPORT.md`
   - `docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md` (the *later explicit approval record* governs; earlier PENDING/recommendation prose is historical)
   - `docs/architecture/R7_10_A_CANDIDATE_SCOPE_PRIORITIZATION.md`
   - `docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_RESPONSIBILITY_MATRIX.md`
   - `R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_CHARACTERIZATION_VERIFICATION_REPORT.md`
   - `docs/architecture/R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_MATRIX.md`
   - `docs/architecture/R7_10_B_FEATURE_MODE_COMPATIBILITY_DISPOSITION.md`
   - `docs/testing/R7_10_B_FEATURE_MODE_CHARACTERIZATION_COVERAGE.md`
   - `docs/architecture/TECHNICAL_DEBT.md` (target TD01/15/16/17/18/19 and other relevant entries only)
   - `docs/architecture/MODULE_BOUNDARIES.md`, `docs/architecture/APPLICATION_SURFACE_INVENTORY.md` as needed.
3. Preserve approved **AS-D01=A, AS-D02=B, AS-D03=A, AS-D04=A, AS-D05=A scoped, AS-D06=A**. Preserve prior accepted R7.5–R7.9 policies and their unverified limitations. Read only necessary references; avoid regenerating historical inventories.

## Workstreams (one checkpoint)

### C01 — Evidence reconciliation and contract freeze

- Distinguish **source-confirmed**, **test-observed**, **historical report**, **unknown external**, and **proposal** evidence; provide traceable file paths/test names for material claims.
- Record exact current mode distinctions: CLI env flags enable only on string `'1'`; resolved config sets both peer flags; top-level demo-registration vs nested peer-gateway/workflow/connector enablement; mismatched combinations; `createApplication` default SQLite enabled vs resolved CLI/default `startApplication` SQLite disabled; PServer connector construction vs external connection; `onCreated` -> conditional registration -> `listen`; app-local `TransformationRegistry`.
- Confirm existing R7.10.B test characterization is committed, not a behavior migration; do not use local-only tests as proof of deployed environment or external peer semantics.
- Record accepted R7.8 explicit lifecycle -> example static compatibility exception, direct caller behavior, `/health` semantics, public app handles, ACK/error precedence, persistence paths, startup/shutdown/late-settlement invariants and R7.7 profile/manifest/serial requirements.

### C02 — Scope and responsibility reassessment

Produce a concise **three-track disposition** with confidence and evidence for:

1. **Feature-mode compatibility:** whether to freeze current mode behavior with no further technical work. A testable matrix alone is not proof that normalization adds value; explicitly decide whether there is a named unresolved material gap that can be scoped without redesign.
2. **External caller and product ownership:** identify exact candidate surfaces, channels or supported consumers (direct `createApplication` / `startApplication`, package/legacy facades, M12/M13 domain users, operator deployment targets). Distinguish repo-known evidence from contacts/repositories/releases unavailable locally. Recommend *one* bounded discovery target only if an accountable evidence provider can be identified; otherwise defer with a precise prerequisite. No guessing external callers or product ownership.
3. **Additive capability proposal:** mark eligible only if a concrete product/operational requirement, change budget and versioning/migration boundary are visible. Otherwise defer, with no speculative design or code.

Make explicit that AS-D01=A is a longer-term business-boundary evidence objective and does not require immediately picking M12/M13 or rewriting M02. Rank based on actionable evidence and contract value, not code size or number of phases.

### C03 — Architecture owner decision package

Prepare **SC-D01–SC-D05**, each with A/B/C or other clearly defined bounded choices, recommendation, pros/cons, required evidence, affected contracts, stop/rollback gates, and **PENDING OWNER APPROVAL** status:

- **SC-D01 — Feature-mode disposition:** preserve current compatibility vs bounded extra characterization vs separately justified versioned change.
- **SC-D02 — Next responsibility evidence target:** external caller/package surface vs M12/M13 product ownership vs no further discovery without evidence. Do not automatically prefer a particular module.
- **SC-D03 — Requirement threshold for additive design:** require named observable need/versioning/migration vs additional research vs reject speculative design.
- **SC-D04 — Verification/evidence policy:** documentation-only minimal checks; if a later test/code checkpoint is separately approved use scoped targeted checks plus maintained Full/serial/playground gates, with bounded attempts and captured logs.
- **SC-D05 — R7.10 exit/governance:** close after owner decisions and record unresolved debts; permit separate discovery only with owner approval; prohibit standing permission for broad implementation.

Decisions are proposals **until the user explicitly chooses**. Do not misrepresent R7.10.C completion as preapproval of R7.10.D, a production change, technical debt closure, or new business ownership.

### C04 — Read-only verification and final report

- Under Node 22.23.5, run `npm run check:architecture`, `npm run test:manifest`, `git diff --check`, and `git diff --cached --check`; record exact command/environment, exit status and observed counts.
- No automatic Full/serial tests are necessary for documentation-only checkpoint. If any unplanned change or suspicious regression forces a verification question, **stop and report** rather than modifying source/tests/runners or spending unapproved test budget.
- Diagnose sandbox `EPERM`/Node-version mismatch as environment limitations; do not report a blocked run as PASS or an application defect. Never claim tests were rerun if they were not.
- Provide source baseline, initial/final worktree and index state, changed-path inventory, evidence limitations and explicit owner GO/NO-GO gate.

## Allowed edits and required deliverables

Create only these new documentation artifacts:

1. `docs/architecture/R7_10_C_FEATURE_MODE_SCOPE_REASSESSMENT.md` — exact compatibility disposition; scope/no-go rationale, remaining evidence limits.
2. `docs/architecture/R7_10_C_RESPONSIBILITY_EVIDENCE_NEXT_SCOPE.md` — targeted external caller/product/operations candidate, named evidence prerequisites and no-action alternative.
3. `docs/architecture/R7_10_C_ARCHITECTURE_SCOPE_DECISION_POLICY.md` — SC-D01–SC-D05 choices and pending owner approval record.
4. `R7_10_C_ARCHITECTURE_SCOPE_REASSESSMENT_DECISION_REPORT.md` — source-backed consolidated evidence, verification, recommended decisions, changed paths and stop.
5. Prepend **one compact current-state section** to `docs/architecture/PROJECT_STATE.md` linking artifacts, without altering historical entries.

All Codex prompts reside exclusively in `prompts/`. The supplied prompt is input and must remain untouched. Preserve prior R7.10.A/B reports and their approval record exactly as-is. Do not update `TECHNICAL_DEBT.md` statuses or module classifications; carry open issues forward by citation/reference.

## Non-negotiable protections

- No production source/tests/scripts/manifest/CI/config/schema/package/lockfile/API/public contract/feature-gate/default/ownership changes.
- M12/M13 stay **TBD**, M14/M15 **APP**. TD15–TD17 and other existing debts remain open. M02 extraction remains **DEFERRED — EQUIVALENCE NOT PROVEN**.
- Protect R7.5 no unsafe replay, receipt/ACK, locks/quotas; R7.6 deadline/admission/late mutations; R7.7 manifest/test profiles/serial and playground; R7.8 feature-mode/demo compatibility; R7.9 F1/F2 evidence limits; and approved R7.10 AS decisions.
- F1 DB reopen does not prove original native handle release; F2 async socket cleanup completion remains **NOT PROVEN**; old 254/255 identity and historical focused/Full discrepancy remain unresolved. Do not infer production, power-loss, remote deduplication or exactly-once evidence.
- No staging, commit, push, background work, or beginning R7.10.D/R7.11.

## Completion / stop conditions

Stop and give owner review once C01–C04 and the exact docs are complete, even if the recommendation is no implementation. If required evidence is absent, label it UNKNOWN and state the next external input required. Report `R7_10_C_ARCHITECTURE_SCOPE_REASSESSMENT_DECISION_REPORT.md` and the pending **SC-D01–SC-D05** selections. **Never self-approve decisions.**
