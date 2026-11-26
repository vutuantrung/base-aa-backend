# Codex Prompt — R8.0 Roadmap Reconciliation & Scope Planning

## Mission / authorization

Execute **R8.0 — Roadmap Reconciliation & Scope Planning** as **one bounded, documentation-only architecture planning checkpoint** for `vutuantrung/base-aa-backend`, branch `main`.

**Expected committed HEAD at prompt preparation:** `72b31e54e266743fbfd18b6169e4a85c843ddeb7` (`checkpoint R7.10 final architecture closure`). Verify actual HEAD, current branch, tracked/untracked/index state, Node/npm versions *before doing any work*. If HEAD diverges, stop and report unless differences can be unambiguously reconciled read-only; do not silently use an outdated baseline or overwrite unrelated work.

**Authorization:** The Architecture Owner has asked to start **R8.0 planning only**. This is **not** approval to execute R8.1–R8.5, R7.10.D, R7.11, external surveys, production verification against live peers, remediation, refactoring, or implementation. Do not stage, commit, push, merge, reset, clean, or alter branches.

## Source hierarchy and provenance

Read actual current repository files before forming conclusions; inspect source/tests selectively where necessary for a disputed claim. At minimum:

1. `docs/architecture/ARCHITECTURE.md` — historical R8.1–R8.5 outline (architecture conformance, external compatibility, runtime reliability, environment isolation, final review/documentation).
2. `docs/architecture/TECHNICAL_DEBT.md` — TD01–TD21; distinguish `OPEN`, partial remediation, verified local behavior, compatibility intentionally preserved, and unproven external guarantees. The registry explicitly links **TD18 → R8.3/R8.4** and **TD19 → R8.2/R8.4/R8.5**; other mappings require provenance or are proposals.
3. `docs/architecture/PROJECT_STATE.md`, `docs/architecture/ARCHITECTURE_DECISIONS.md`, and `docs/architecture/MODULE_BOUNDARIES.md` (if present) — architectural decisions and actual bounded baseline.
4. `docs/architecture/R7_10_FINAL_CLOSURE_DECISION_AND_HANDOFF.md` and `R7_10_FINAL_ARCHITECTURE_CLOSURE_VERIFICATION_REPORT.md` — R7.10 closure limitations and owner disposition.
5. `docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md`, `docs/architecture/R7_10_C_ARCHITECTURE_SCOPE_DECISION_POLICY.md`, `docs/architecture/R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_MATRIX.md`, and `docs/architecture/R7_10_C_RESPONSIBILITY_EVIDENCE_NEXT_SCOPE.md` — explicit owner-approved AS/SC decisions and frozen feature-mode behavior.
6. Relevant accepted R7.1–R7.9 reports/policies selectively where an R8 mapping or completion status needs clarification. Do not assume an old proposed roadmap item is unfinished merely because an old document says so.

**Precedence:** explicit later owner decisions and accepted verification evidence control over historical proposal/pending snapshots. Preserve old snapshots as history, not as current authorization. R7.10 was accepted as CLOSED by the Architecture Owner in conversation and subsequently committed; if `PROJECT_STATE.md` still contains historical `PENDING ... REVIEW` snapshot, report that documentary lag precisely and propose a bounded current-state annotation rather than rewriting or deleting prior history.

Classify every material claim as one of: **source-confirmed**, **test-observed**, **approved decision**, **historical/proposed**, **inferred R8 mapping**, **external unknown**, or **requires owner confirmation**. Do not conflate mock/loopback with production, process crash with power loss, or a construction path with a successful PServer connection.

## Hard architectural and governance invariants

Preserve R7.5 P01–P06 receipt vs delivery vs ACK, proven-unsent retry only, uncertain no-replay, lock/quota/attempt bounds, receiver-deduplication and power-loss proof limits. Preserve R7.6 D01–D06 one-shot lifecycle, admission cutoff, bounded deadline, late mutation/writer ownership, rollback and graceful drain limits. Preserve R7.7 55-file test manifest, Fast/Integration/Full profiles, maintained serial backend, independent playground, Node 22.23.5/npm 10.9.9 authoritative baseline, and unclassified/`unknown` rows. Preserve R7.8 accepted static lifecycle-to-example edge and per-app transformation registry. Preserve all R7.9 RC/FI constraints and unverified F1 native DB handle release / F2 async socket close / historical unattributed failures.

R7.10 approvals remain binding:

- AS-D01=A, AS-D02=B, AS-D03=A, AS-D04=A, AS-D05=A (scoped), AS-D06=A.
- SC-D01=A, SC-D02=C, SC-D03=A, SC-D04=A, SC-D05=A.
- Feature-mode semantics FROZEN: exact CLI env `'1'` gates; top-level demo registration vs nested peer gateway/workflow/connector eligibility; both mismatch cases allowed; factory SQLite default differs from resolved config; app-local registry; `onCreated` → conditional registration → `listen`; `/health` remains `{status:'ok'}`.
- M12/M13 business ownership **TBD**, M14/M15 **APP**. M02 extraction **DEFERRED — EQUIVALENCE NOT PROVEN**. TD15–TD17 and all other unresolved debts retain status; additive capability design **NOT ELIGIBLE** without an accepted named requirement. No unsupported reclassification, gate normalization, public surface change or debt closure.
- SC-D02=C: no active external caller/product-owner survey until a named evidence provider and supported target/channel/boundary are supplied. Do not infer non-use from private package metadata or local grep.

## R8.0 workstreams

### R8.0-01 — Baseline and roadmap inventory

- Capture HEAD, branch, current worktree/index, toolchain, authoritative latest owner decisions, current R7 status and documentary contradictions.
- Locate *all available* R8-related planning artifacts in repo. Confirm whether R8.1–R8.5 have detailed accepted scopes beyond the outline. If not, explicitly state **high-level roadmap only** and do not invent historical R8 approval.
- Create a source-linked inventory of existing R8 targets versus current verified state after R7.10.

### R8.0-02 — Work-to-roadmap reconciliation

- Make a traceability matrix for **TD01–TD21** and material R7.5–R7.10 deferred/unknown items; group duplicates instead of double counting.
- For each: owner/module, actual status (complete/local partial/open/deferred/unknown/approved preserve), existing evidence/report/decision, proposed R8.1–R8.5 destination or **unassigned**, whether mapping is **explicit in repo vs inferred proposal**, residual outcome/contract gap, prerequisite/evidence provider, and whether code work is currently eligible.
- Explicitly retain TD02 supported namespace terminal-boundary blocker; TD03 real PServer gap; TD10/11 process-crash vs deployed filesystem/power-loss/receiver dedupe; TD12 catalog schema compatibility; TD13 current `Promise.all` semantics; TD14 event-loop-stall limits; TD15 M18/readiness; TD16 frozen gates; TD17 legacy external consumers; TD18 Node 24/native SQLite and env; TD19 originals/production PServer/GUI evidence; TD20 benchmark first; TD21 duplication without demonstrated need. Clearly distinguish already-remediated local cases (e.g. TD04, TD09) from remaining external proof.
- Identify false starts, redundant R8 tasks, and tasks that remain blocked until operator/maintainer/product owner evidence exists.

### R8.0-03 — Proposed bounded R8 execution plan

Create a candidate plan for **R8.1 Architecture Conformance**, **R8.2 External Compatibility**, **R8.3 Runtime Reliability**, **R8.4 Environment Isolation**, **R8.5 Final Review/Documentation**. For each provide:

- Objective and **specific out-of-scope** items; candidate sub-checkpoints no larger than one testable/discoverable boundary each.
- Entry prerequisites and named *role* of evidence owner (do not invent people, production systems, environments, release channels, or timelines).
- Output evidence, acceptance criteria, external vs local proof limits, risk and rollback/stop conditions.
- Dependencies, sequencing/parallelizable discovery, and explicit **BLOCKED / ELIGIBLE FOR DOCS-ONLY DISCOVERY / PENDING OWNER APPROVAL / NOT ELIGIBLE** categorization.
- Proportional verification: docs-only architecture/manifest/diff; code/test scopes (only if separately authorized later) use focused/typecheck/build as applicable plus maintained serial/Full/playground checks, complete logs/metadata and bounded attempts. Do not prescribe fresh Full for this docs-only R8.0.

Do **not** assume R8.1 must precede R8.3 if R8.3 has independently verifiable local characterization; compare risk-first and original-number order transparently. Do not bundle R8.2 external caller survey with M12/M13 ownership unless each has separately named provider/target. R8.4 may depend on operator deployment targets. Clarify that R8.5 is not automatic production certification.

### R8.0-04 — Architecture Owner decision package

Propose **R8-D01 through R8-D06** (recommendations, options, trade-offs, explicit owner questions), all **PENDING OWNER APPROVAL**:

- R8-D01: R8 overall objective/scope and treatment of the historical R8.1–R8.5 outline.
- R8-D02: first bounded checkpoint / order (risk-driven vs numbered; compare readiness and blockers).
- R8-D03: external evidence prerequisites and no-provider stopping rules.
- R8-D04: production/runtime target matrix and strict distinction local proof vs operator proof.
- R8-D05: compatibility, ownership and technical-debt handling (including R7.10 freeze and no speculative refactors).
- R8-D06: proportional verification, checkpoint authorization and exit criteria.

Make explicit that even approving a roadmap does not automatically authorize implementation; each execution checkpoint needs bounded owner approval. No decision may be marked approved by Codex.

### R8.0-05 — Documentation verification and reporting

- Run read-only/documentation-scope verification with Node.js **22.23.5** and npm **10.9.9**, or report exact available versions and qualification: `npm run check:architecture`, `npm run test:manifest`, `git diff --check`, `git diff --cached --check`. Check newly authored Markdown relative links and whitespace; validate no production/test/package/manifest/CI modifications and empty index.
- No Full/serial/playground/typecheck/build rerun required for docs-only; historical regression may be cited **with its originating checkpoint**, never as new R8.0 tests.
- Provide path-by-path diff inventory and candid unresolved evidence; stop for Architecture Owner review.

## Required deliverables / allowed paths

Create only:

1. `docs/architecture/R8_0_ROADMAP_RECONCILIATION_MATRIX.md` — traceability, explicit vs inferred mappings, statuses and evidence.
2. `docs/architecture/R8_0_BOUNDED_SCOPE_AND_EXECUTION_PLAN.md` — R8.1–R8.5 candidate checkpoints, priorities, prerequisites, acceptance and boundaries.
3. `docs/architecture/R8_0_ARCHITECTURE_OWNER_DECISION_POLICY.md` — R8-D01–R8-D06 options and recommendations, **all pending**.
4. `R8_0_ROADMAP_RECONCILIATION_SCOPE_PLANNING_REPORT.md` — one comprehensive verification/report artifact at repository root.
5. `docs/architecture/PROJECT_STATE.md` — **prepend only** a concise R8.0 planning status with links; preserve historical timeline and avoid converting old records into false claims.

The supplied prompt **must remain within** `prompts/R8_0_ROADMAP_RECONCILIATION_SCOPE_PLANNING_CODEX_PROMPT.md` and unmodified. If existing unrelated dirty files are present, preserve them; stop rather than overwrite conflicts. Do not change `ARCHITECTURE.md`, `TECHNICAL_DEBT.md` or prior ADR/policy files at R8.0: record discrepancies and recommended future edits in planning documents only.

## Final acceptance and stop

R8.0 succeeds only if: (a) current baseline and provenance verified; (b) TD01–TD21 and essential residual contracts reconciled without false closure; (c) R8.1–R8.5 have bounded, evidence-gated proposed scopes; (d) R8-D01–R8-D06 remain pending; (e) only allowed documentation paths change; (f) required checks and limitations are transparently reported; (g) no staging/commit/push occurs.

Conclude with **GO FOR ARCHITECTURE OWNER REVIEW ONLY** or **BLOCKED** with reasons. **STOP. Do not start R8.1, R8.2, R8.3, R8.4, R8.5, or any implementation/production connectivity.**
