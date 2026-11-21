# R7.2.0 Reliability Risk Inventory — Audit Report

## Baseline

- `main`, expected committed HEAD confirmed: `d14a5929a6016f05d23e7f9954231da364483382`.
- At start: tracked tree clean; no staged changes. Pre-existing untracked prompt `prompts/R7_2_0_RELIABILITY_RISK_INVENTORY_CODEX_PROMPT.md` preserved.
- Documentation-only audit. Source/tests/package/checker unchanged.

## Risk summary

| Risk | Evidence and current coverage | Main gap / current behavior |
|---|---|---|
| TD02 M05/M06 handshake | Middleware registers in M06 before namespace `connection`; M05 disconnect cleanup is attached after connection. Directory duplicate and connection-ID-safe removal tests exist. | Aborted-after-register leak is a **Hypothesis**, not reproduced. No test controls the gap between middleware and connection callback. |
| TD03 M03/M04 session ACK | Tests establish transport/session-ready separation, normal resume, and initial missing/negative/rejected ACK. | ACK callbacks have no attempt generation guard. Late ACK races are **Hypotheses**; rejected resume with a known ID is **Unverified**. Existing code retains the ID, remains unready, and reuses it on next connect. |
| TD04 M10/M11/M05/M06 topology | M10 rechecks connection after async transform; a test confirms disconnect -> `DESTINATION_OFFLINE`. Transformation rules are resolved once. | Replacement routing and newly ambiguous untargeted EServer are untested. Current late lookup predicts new-socket delivery and `DELIVERY_FAILED` for newly ambiguous EServer. |

Detailed edge timelines, line references, impact/likelihood, controlled local reproducer designs and policy choices are in [R7.2 reliability risk inventory](docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md).

## Decision and plan

Begin R7.2 with test-first characterization only: A, TD02 namespace identity lifecycle; B, TD03 deferred PServer ACK/resume; C, TD04 mutable destination topology during deferred transformation. Obtain user policy decisions before fixes: aborted-handshake identity cleanup; stale ACK handling and rejected-resume recovery; delivery affinity to logical identity versus original socket; ambiguity ACK classification. Preserve identity semantics, transport/session readiness distinction, ACK shape, APIs and deferred workflow behavior.

R7.1 SCC/checker limitations are existing deferred work, not R7.2 targets. TD05 no-ACK ingress remains R7.3. TD02–TD04 statuses remain Hypothesis/verification work; no reproduction or fix is claimed.

## Verification and changed files

- `npm run check:architecture`: PASS on Node 22.23.5 at the reviewed HEAD; 52 files, 113 edges (51 runtime / 62 type-only), zero file runtime SCCs; one module runtime SCC reported.
- `git diff --check`: PASS after docs edits.
- Typecheck/build, backend 159/159 and playground 32/32 are historical R7.1.E PASS only; not rerun for this docs-only task.
- Changed paths: `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, `R7_2_0_RELIABILITY_RISK_INVENTORY_REPORT.md`, `docs/architecture/PROJECT_STATE.md`, and TD02–TD04 rows in `docs/architecture/TECHNICAL_DEBT.md` updated to reflect observed code and concrete coverage gaps. No commit/push. R7.2 implementation has not started; stop for review.
