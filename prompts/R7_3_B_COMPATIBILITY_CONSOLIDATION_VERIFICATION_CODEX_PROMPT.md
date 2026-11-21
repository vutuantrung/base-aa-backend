# Codex Task — R7.3.B: Compatibility Consolidation & Verification

## 0. Authority, checkpoint gate, and execution constraints

Repository: `vutuantrung/base-aa-backend`. Target branch: `main`.

The last independently reviewer-verified GitHub `main` HEAD when this prompt was prepared was:
`986967fcae9176e87e53c792b07e9e68374ad74e` (`updated 11212058`).
This is **the starting R7.3.A baseline, NOT proof that R7.3.A was committed**.

R7.3.A's characterization report was accepted for review, with local uncommitted work reported in:
`R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_REPORT.md`.
Before any R7.3.B work:
1. Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` once. Run `git branch --show-current`, `git rev-parse HEAD`, `git log -1 --oneline`, `git status --short`.
2. Verify that the reviewed **R7.3.A characterization changes** (its report, five focused test files, and TD05–TD08/checkpoint documentation) are **committed in current `main` history**, and that they are not merely present as untracked or unstaged changes. Confirm against the actual commit/history and inspect related files. If R7.3.A is not committed, **STOP** and issue a brief checkpoint report requesting it be committed/pushed. Do not start B, auto-commit A, cherry-pick, reset, or stash.
3. Record the actual new R7.3.B base commit SHA. Never treat `986967f` as the post-A baseline. Preserve unrelated working-tree edits and existing task prompts; do not overwrite them. If changes overlap with B scope, STOP and report the conflict rather than wiping them.
4. **Do not commit or push without explicit approval.** Do not start R7.4. This is one complete B-phase task, not a micro-task chain.

## 1. Approved architecture policy — binding decisions

The architecture owner explicitly APPROVED all four current-behavior options:

| Decision | Approved | Binding semantics |
|---|---|---|
| **R7.3-D01 — TD05** | **A** | Preserve existing ACK-gated ingress: no ACK callback means no peer-message/workflow processing in M05 or M04; retain the existing M04 readiness-specific behavior and logging, including its difference from M05. No fire-and-forget processing, synthetic ACK, retry, or implicit rejection. |
| **R7.3-D02 — TD06** | **A** | Preserve rule-reference mutability after registration, resolved-once execution, current transformer ordering/matching/clone behavior and existing output checks. Blank output `version` and `data: null` stay accepted where currently accepted. No snapshot/freeze or validation tightening. |
| **R7.3-D03 — TD07** | **A** | Preserve the exact current per-route HTTP status/body matrix and middleware ordering: absent session/usage ports can produce empty 200/201; unmounted catalog 404; mounted catalog missing record uses existing route-specific JSON 404; SQLite-disabled gated paths use existing 503 behavior; API auth 401 precedes disabled gate; preserve exact `/extension` vs `/extension/…` handling. No normalization to 404/503 or new error JSON. |
| **R7.3-D04 — TD08** | **A** | Preserve layered validation: HTTP PID/CPU/memory constraints and unknown-key stripping; direct repository inputs remain permissive where SQLite accepts; preserve current direct create response including the runtime extra-`id` overwrite possibility. Document the mismatch without changing return shape, DB schema or write validation. |

Compatibility principle: **R5-D05 explicit handler composition, R5-D06 separate acknowledgment semantics, R5-D08 preserve external contracts**. This approval is **not** approval to change any external behavior. TD12 persistence/catalog schema and migration stay deferred to R7.5.

## 2. Objective and scope

Complete R7.3 as **compatibility consolidation, documentation, and regression verification**, not as a behavior-remediation exercise.

Produce a concise, authoritative, test-grounded compatibility baseline for TD05–TD08, explicitly record the approved D01–D04 decisions, and ensure stable regression protection for known behavioral distinctions. Close R7.3 only within this approved scope; do not falsely mark TD05–TD08 defects fully fixed where intentional behavior or residual compatibility risk remains.

Read only relevant sources, extending outward when a targeted test or contract forces it:
- `R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_REPORT.md` and corresponding R7.3.A tests.
- `docs/architecture/TECHNICAL_DEBT.md` (TD05–TD08 and TD12 only), `PROJECT_STATE.md`, `ARCHITECTURE_DECISIONS.md`, and directly relevant public contract documentation.
- M05 peer ingress (`peer-gateway.ts` / focused gateway tests), M04 PServer protocol, M11 transformation registry/executor, M07 HTTP routes/middleware, M15 process-usage repository.
- Relevant test files: `peer-connections.test.ts`, `pserver-protocol.test.ts`, `transformation-executor.test.ts`, `process-usage-http-api.test.ts`, `process-usage-repository.test.ts`, `session-http-api.test.ts`, `http-gateway.test.ts`, `aa-catalog-boundary.test.ts` and immediate peers only if necessary.

Do not broadly re-audit the codebase or reopen unrelated earlier reports. Follow Intent-Revealing Methods and Extract Method. Prefer tests/docs-only changes. Avoid production-code edits; if a genuine contradiction requires production changes, STOP with a focused finding and ask for explicit review rather than silently changing behavior.

## 3. Implementation requirements (one bounded checkpoint)

### A. Record four approved decisions

Add or update the architecture decision record in `docs/architecture/ARCHITECTURE_DECISIONS.md` (or a directly linked R7.3 decision document if it better preserves existing structure) with D01=A, D02=A, D03=A, D04=A; list explicit accepted invariants, their evidence boundaries and consequences. Distinguish **approved compatibility preservation** from statements that current behavior is ideal. Do not rewrite historical ADRs. Cross-link the R7.3.A characterization and B verification.

### B. Build a stable contract matrix

Create/update a focused `docs/architecture/R7_3_COMPATIBILITY_BASELINE.md` (name may match existing repo convention), including:
- M05 vs M04 with/no ACK, readiness/logging differences, expected processing/side effects and ACK/no-ACK outcomes.
- M11 registration mutation, rule resolution/order, transformer output semantics, original routing metadata invariants.
- M07 routes and statuses/bodies for authenticated/unauthenticated, SQLite-disabled, absent optional ports, unmounted catalog, missing catalog record, and exact `/extension` path edge case. Clearly indicate combinations actually tested vs inferred from source.
- M15 HTTP vs direct repository validation, unknown fields, persisted ID vs immediate returned ID, and response compatibility caveat.
- Callers/consumers known from repo; mark unknown external clients **unknown**, not verified compatible.
- TD12 explicitly deferred to R7.5; no catalog-data migration.

Keep the matrix precise and concise; avoid duplicate explanatory prose and unstated guarantees.

### C. Focused regression test gap closure

Inspect R7.3.A's new tests first (report recorded focused 50/50, backend 180/180, playground 32/32). Keep them; add **only** meaningful missing deterministic assertions for the approved behaviors, especially where code/contract is not yet covered. Test cases must preserve actual current behavior rather than assume normalized semantics.

Possible important gaps to evaluate, not a requirement to add redundant tests:
- No-ACK M05 vs M04 negative/ready paths and side-effect absence.
- Rule mutations/blank output version/null data and resolve-once behavior.
- Exact HTTP response body and status for absent optional ports and `/extension` boundary (including auth priority).
- Runtime extra ID response vs persisted row identity for direct repository calls; HTTP stripping invariant.

Avoid arbitrary sleeps, real external PServer requests and production data. Use existing fakes, in-memory DB and local test harness. Do not create a test solely to increase test counts.

### D. Reconcile technical-debt and checkpoint status

Update only TD05–TD08 sections of `docs/architecture/TECHNICAL_DEBT.md` and R7.3 summary of `PROJECT_STATE.md` to distinguish:
1. Preserved current behavior under explicit decision A.
2. Deterministic contract coverage and any verified residual risks.
3. External consumer or real-system evidence gaps (no claims of verified compatibility where no external testing exists).
4. Deferred future change, requiring new approval and migration/contract assessment.

Keep TD12 deferred. Do not modify TD02–TD04 status, R7.1 closure limits or unrelated technical debt.

## 4. Verification requirements

Use the repository-supported Node baseline (R7.3.A used Node **22.23.5**) and report the actual version. Execute and report actual exit codes and test counts:

```bash
node --import tsx --test --test-reporter=spec \
  tests/peer-connections.test.ts \
  tests/pserver-protocol.test.ts \
  tests/transformation-executor.test.ts \
  tests/process-usage-repository.test.ts \
  tests/session-http-api.test.ts \
  tests/process-usage-http-api.test.ts \
  tests/http-gateway.test.ts \
  tests/aa-catalog-boundary.test.ts
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

If loopback tests are blocked by sandbox permission, seek narrowly scoped permission and rerun; report failures and successful reruns separately. Do not silently classify environment failures as application defects or claim PASS without a successful run.

Acceptance requires no production behavior change, no wire/API/ACK/schema changes, no new dependency or data migration, passing applicable suites (or documented blocker that prevents closure), and explicit decision-to-test traceability. Preserve pre-existing unrelated changes.

## 5. Deliverables and STOP

Deliver:
- `R7_3_B_COMPATIBILITY_CONSOLIDATION_VERIFICATION_REPORT.md` at repository root: actual committed A baseline SHA, files changed, D01–D04 decisions applied, evidence matrix references, added/unchanged tests, outcomes, residual compatibility risks and closure recommendation (`CLOSED` / `CONDITIONALLY CLOSED` / `BLOCKED`, with reason).
- Architecture decisions and contract baseline documents.
- Relevant TD05–TD08 and `PROJECT_STATE` updates, with status claims calibrated to what was tested.
- Focused additional tests only if genuine coverage gaps exist.

Conclude with one reviewer-ready phase report, not multiple subtask reports. **STOP for reviewer approval. No commit/push. No R7.4.**
