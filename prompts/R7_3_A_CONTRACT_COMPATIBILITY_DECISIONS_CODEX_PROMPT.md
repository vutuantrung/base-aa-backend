# Codex Task — R7.3.A: Messaging Contract & API Compatibility Decisions

## 0. Authority, baseline, and task size

Repository: `vutuantrung/base-aa-backend`  
Branch: `main`  
Reviewer-verified HEAD: `986967fcae9176e87e53c792b07e9e68374ad74e` (`updated 11212058`).

**R7.2 has been reviewer-approved as CONDITIONALLY CLOSED and its closure documentation committed in this HEAD.** `docs/architecture/PROJECT_STATE.md` may still say "pending reviewer approval" because it predates this approval. Correct that checkpoint statement as part of this task while preserving TD02 OPEN, TD03 PARTIALLY REMEDIATED, and TD04 deterministic remediation limitations.

This is **one major checkpoint**, R7.3.A, not a sequence of microtasks. Complete source/contract inventory, deterministic characterization, compatibility decision package, and documentation together. Do not implement disputed new policies. R7.3.B will implement specifically approved behavior changes and complete full verification.

At start read `AGENTS.md` (if present), `docs/architecture/PROJECT_STATE.md`, `docs/architecture/ARCHITECTURE_DECISIONS.md`, relevant TD05–TD08 and TD12 rows in `docs/architecture/TECHNICAL_DEBT.md`, then inspect `git branch --show-current`, `git rev-parse HEAD`, `git status --short`. Respect pre-existing local edits; do not reset/stash/overwrite. If HEAD differs, record real source baseline and inspect relevant delta before proceeding. Don't commit/push without explicit approval.

## 1. Outcome and constraints

Produce an **evidence-based, decision-ready compatibility baseline** for R7.3 across four domains, without silently changing public behavior:

- **TD05** (M05/M04): ACK callback presence and no-ACK ingress for authenticated peer messages and direct PServer messages. Capture observed skip/processing/side effects, error ACK shape, event handler behavior, and legitimate differences between ingress paths.
- **TD06** (M11): transformation rule reference ownership, mutations after registration, resolve-once semantics, metadata stability, output schema enforcement and blank-version behavior. Separate existing contract from potential tightening.
- **TD07** (M07): absent/disabled/unmounted capabilities across session, usage, catalog, `/extension`, authentication precedence and HTTP status/body behavior (including currently empty 200/201, 404, etc.). Document exact route/mode matrix; never equate distinct optional capabilities.
- **TD08** (M15): process usage validation for negative PID, fractional memory, unknown/extra fields, `id` overwrite possibility on create, and discrepancy between immediate response and stored record. Identify intended public response/compatibility risks without applying validation tightening.

**TD12 boundary:** If M16 domain record validation/orphan/ID behavior directly overlaps an R7.3 API contract, document dependencies and migration constraints, but defer schema/data-migration changes to an authorized R7.5 policy. Do not broaden into a full persistence refactor.

Respect R5-D06 separate ACK semantics, R5-D08 preserve existing external contracts, R5-D05 explicit dispatch deferred to R7.4; do not fold in TD02/TD03 remediation, durability/retry, shutdown, business workflow changes, dependency restructuring or demo extraction.

## 2. Scope of evidence reading

Start from `docs/architecture/MODULE_BOUNDARIES.md` for actual M04/M05/M07/M11/M15 implementation paths and test locations; follow *only* relevant imports/call sites. Source and tests take precedence over older handoff documents. Read existing targeted reports only when they provide otherwise missing evidence. No repo-wide re-audit or historical report sweep.

For each TD, record:
1. producer/consumer boundary and current external contract (input, transport event/route, auth, error code/status, output/ACK),
2. observed source behavior with file/line references,
3. existing test coverage versus untested hypotheses,
4. exact compatibility risk and external consumer uncertainty,
5. proposed policy choices with default **preserve-current** recommendation and consequences,
6. R7.3.B implementation acceptance criteria only for explicitly authorized or backward-compatible internal changes.

## 3. Characterization-first tests

Add **focused deterministic tests** where needed to establish current behavior across TD05–TD08, following existing test conventions. Tests may characterize undesirable current behavior; name them transparently, assert actual outcomes, and never mark an unimplemented fix as complete.

Coverage priorities:
- ingress with ACK callback vs absent ACK callback; expected calls/side effects and explicit return paths for both M05 peer and M04 PServer paths; keep fake vs real-transport evidence distinct;
- transformation rule object mutation after registration, ordering and single resolution across async execution, output envelope and version validation boundaries;
- auth-first/disabled/absent port and mounted/unmounted API combinations for M07; exact observed responses;
- invalid process usage values, unknown fields, stored vs immediate shape and ability of caller-supplied ID to overwrite generated ID (only report if demonstrated).

Avoid tests that require production PServer or external services. Prefer existing builders and local in-memory fakes. A real loopback scenario is optional only where specifically necessary and supported. Do not fabricate results when sandbox permissions block execution; request narrowly scoped permission or report unverifiable status.

**Do not alter production code or public contracts in R7.3.A.** If test discovery reveals a high-severity defect, characterize and document it instead of making an unreviewed change.

## 4. Decision package for reviewer

Create `R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_REPORT.md` at repo root, containing:

- exact baseline SHA, changed paths and clean/dirty initial state;
- per-TD source evidence vs deterministic tests vs hypotheses/gaps;
- a concise contract compatibility matrix for TD05–TD08 (plus TD12 only if adjacent);
- **decision IDs** such as `R7.3-D01`… with options A/B/C, proposed default and explicit ask, covering no-ACK ingress semantics, transformation mutation/output/version policy, optional HTTP capability error semantics, and process usage validation/response shape;
- a clearly bounded R7.3.B scope with test-based acceptance criteria, compatibility/migration plan and no-go conditions;
- risk/severity and which changes require external product/consumer approval;
- test command results, actual counts, warnings, unverified external integrations.

Record proposed decisions as **PENDING**, not approved. Do not autonomously choose breaking behavior or change ACK/HTTP schemas. Keep decisions in report; update `docs/architecture/PROJECT_STATE.md` for current phase and relevant TD05–TD08 rows only as evidence, without closing them prematurely. Do not overwrite the established R7.2 risk statuses.

If the source proves a question is already answered by a prior approved ADR, cite that ADR, preserve it and avoid asking for an unnecessary new decision.

## 5. Verification and stop

Use Node 22.23.5 baseline if available. Run relevant focused test files, plus:

```bash
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

For every command record actual exit status and case totals. If a dependency/environment blocks a command, identify the specific blocker. Don't call the entire verification suite PASS based on historical evidence.

**STOP for architectural decision review after R7.3.A.** No production implementation, no commit/push, no R7.3.B execution and no R7.4. User and reviewer will decide the R7.3.B policies based on your single consolidated report.
