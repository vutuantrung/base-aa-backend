# Codex Task — R7.2.0 Reliability Risk Inventory & Prioritization (AUDIT ONLY)

## Baseline / context
- Repository `vutuantrung/base-aa-backend`, branch `main`.
- Expected reviewed Git HEAD: `d14a5929a6016f05d23e7f9954231da364483382` (R7.1 closure committed, CONDITIONALLY CLOSED).
- Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` first. Then read only the relevant sections of `docs/architecture/TECHNICAL_DEBT.md`, `docs/architecture/ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, and targeted implementation/tests. `R7_1_CLOSURE_ARCHITECTURE_REVIEW_REPORT.md` is available for R7.1 limitations; do not reread old R6 reports unless specific contradictory/missing evidence requires it.
- Check `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, and relevant changes. Preserve unrelated/dirty/untracked files; no reset/stash/branch switch. If HEAD differs, inspect relevant deltas before using the baseline.

## Goal
Begin **R7.2 — Connection and Session State** using a **breadth-first, evidence-driven audit**, not a reliability refactor. Produce a bounded inventory and ordered test-first plan to characterize lifecycle and race conditions involving M03/M04/M05/M06/M10, with no behavior changes or speculative fixes.

## Required audit scope
1. **TD02 — aborted peer handshake / identity registration**: inspect M05 socket gateway and M06 peer directory registration/removal ordering, namespace connection middleware/callbacks, duplicate-identity handling, abort/disconnect cleanup and existing tests. Distinguish observed code path from hypothesized identity leak.
2. **TD03 — PServer stale registration ACK / resume rejection**: inspect M03 transport, M04 protocol, session-ready/connection transitions, callbacks, disconnect/reconnect behavior and tests. Identify which in-flight ACKs can arrive after disconnect/new connect, and what happens when session resume returns missing/rejected ACK. Do not assume actual reproduction.
3. **TD04 — destination changes during asynchronous transformation**: inspect M10 peer message service, M11 transformation registry and M05 gateway/directory lookup paths, delivery decisions and existing tests. Document how removal/replacement/disconnect during `await` affects outcomes.
4. Adjacent risks only insofar as necessary to distinguish these three (e.g. no-ACK ingress TD05 is **R7.3**, deferred). Do not expand into R7.3–R7.9, persistence, shutdown drain, full module audit, or production PServer.

## Evidence matrix (deliverable)
Create `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` with one row per bounded scenario/subscenario, including:
- Risk ID and ownership; event timeline or sequence; exact source/test references (file + symbol/line range where possible).
- Existing invariant and actual implemented behavior; test coverage and missing coverage.
- Evidence status: **Observed**, **Hypothesis**, or **Unverified**; impact and likelihood as qualitative assessments, not invented measurements.
- Minimal deterministic reproducer/test design using local mocks, fake transports/sockets, controlled deferred promises; expected result **under current code** separated from proposed desired policy.
- Dependencies, compatibility constraints and recommended implementation/test order.

## Decisions and plan
- Recommend a small R7.2 execution sequence (e.g. R7.2.A, B, C) grounded in risk and testability. Favor test-first characterization, then explicit user approval of behavioral policy, then minimal fixes; identify any behavior choices requiring user decision.
- Explicitly preserve PServer transport-connected versus session-ready semantics, public APIs, existing ACK contracts, peer identity semantics, and deferred workflow behavior. Do not invent a retry/reconnect or late-ACK policy.
- Treat R7.1 module SCC and checker limitations as **existing deferred work**, not R7.2 blockers or targets.

## Allowed changes
- Documentation only: new `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, `R7_2_0_RELIABILITY_RISK_INVENTORY_REPORT.md`, minimal updates to `docs/architecture/PROJECT_STATE.md`, and only affected TD02–TD04 rows in `docs/architecture/TECHNICAL_DEBT.md` if evidence truly changes.
- **Do not edit production source, tests, package scripts, dependencies, schema, public interfaces, or architecture checker**. No commit/push. Do not contact production services or edit real runtime data.

## Verification / reporting
- Run `npm run check:architecture` and `git diff --check` if the environment supports it; since this task is docs-only, label inherited typecheck/build/backend 159/159 and playground 32/32 results as **historical**, not freshly run. If you run other checks, give actual outcomes; never claim unrun checks PASS.
- Compact report (~50–100 lines, shorter if sufficient): base HEAD / working tree, inventory path, risk-by-risk evidence summary, coverage gaps, recommended staged plan, tests run vs inherited, affected files, blockers/decisions required.
- Update `PROJECT_STATE.md` to reflect committed R7.1 closure HEAD `d14a5929a6016f05d23e7f9954231da364483382`, R7.1 CONDITIONALLY CLOSED, and R7.2.0 audit-only working state; do not preclaim future commits or mark R7.2 implementation started.
- Stop after report and request review. Do not advance to R7.2 implementation.
