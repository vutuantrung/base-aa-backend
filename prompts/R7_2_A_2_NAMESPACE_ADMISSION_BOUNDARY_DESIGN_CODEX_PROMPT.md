# Codex Task — R7.2.A.2 Namespace Admission Boundary Design (TD02)

## Mission

Design and verify a **M05-owned `/peers` namespace admission pipeline** that preserves existing duplicate rejection semantics and connection-ID-safe cleanup, while ensuring only accepted namespace connections are observable as active identities. **Design/evidence phase only; do not change production code or tests.** Do not start R7.2.B.

## Provenance / start protocol

- Repository: `vutuantrung/base-aa-backend`, branch `main`; expected committed baseline `d3aee608d35f180a8e0df9a322241c1f422df8bb` (R7.2.A characterization). Check actual `git branch --show-current`, `git rev-parse HEAD`, `git status --short`; reconcile unexpected changes and never overwrite, reset or discard user work.
- Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` once, then only relevant sections of `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` (TD02) and `docs/architecture/TECHNICAL_DEBT.md` (TD02). Read `R7_2_A_1_HANDSHAKE_IDENTITY_REMEDIATION_REPORT.md` and source/tests relevant to this issue. Avoid re-reading full R6/R7 reports or auditing unrelated modules.
- Existing committed baseline includes one intentionally failing assertion in `tests/socket-peer-gateway-handshake.test.ts` (160 pass / 1 fail backend, 32/32 playground, per report). Do not claim a green backend baseline; **do not silently delete, skip, change or weaken the failing test**.
- Baseline source targets: `src/infrastructure/socket/socket-peer-gateway.ts`, `src/modules/peer-messaging/peer-directory.ts`, `src/infrastructure/socket/peer-gateway.ts`; relevant peer authentication/duplicate/connection test files. Socket.IO observed version 4.8.4 in prior investigation; verify actual installed version if relying on implementation internals.

## Approved architecture policy

1. M05 owns the **entire `/peers` namespace admission pipeline** (including sequencing and registration of authentication/other rejecting middleware).
2. All rejecting middleware **must run before** the final admission gate. No externally registered downstream rejecting middleware is permitted after the final gate as an architectural invariant; assess how to enforce/prevent accidental violation rather than merely documenting it.
3. Uniqueness must be atomic for AAUI, SServer, and `(EServer, instanceId)`. Preserve existing duplicate `connect_error` behavior where the public Socket.IO lifecycle permits it.
4. Only accepted namespace connections may be visible as **active** in M06 lookup, presence snapshots, peer delivery, and `getConnection`.
5. Pending claims/reservations (if justified) must be invisible to active queries and must have an explicit terminal outcome/rollback for rejection/abort, not a timeout guess.
6. Cleanup must be connection-ID-safe: disconnect/late cleanup from connection A cannot remove active identity for connection B.
7. Preserve public APIs, peer identity semantics, named namespace `/peers`, error contracts, EServer multi-instance rules, workflow behavior. No Socket.IO private API/monkey-patching without separate approval.

## Design investigation — bounded questions

A. Trace Socket.IO's **publicly supported** namespace middleware and `connection` lifecycle. Define what 'accepted' means and precisely when duplicate identity claims may be made. Distinguish *middleware rejection*, *transport abort between final `next()` and `connection`*, and *ordinary disconnect*. Do not presume `disconnect` or Engine.IO `close` fires for a rejected namespace (prior test proves it need not, especially with another namespace open).

B. Evaluate **at least two concrete designs**, including: (i) validation middleware + terminal M05 admission gate + activation at accepted `connection`, and (ii) a claim/reservation model with explicit rollback. For each, identify claim point, visibility, duplicate behavior, rejection propagation, rollback trigger, concurrency/TOCTOU exposure, and possible Socket.IO public-API limitations. A final gate ordering rule alone does **not** prove cleanup on a transport abort after `next()`. Do not claim completeness without a mechanism and evidence.

C. Inspect actual application wiring: who owns `io.of('/peers').use(...)`; whether any other code can append middleware; whether M05 can enforce a single supported admission-registration entry point. Explicitly distinguish a project-level convention from enforceable guarantees in the Socket.IO public API.

D. Define a **test matrix** using deterministic, local-only scenarios:
- valid AAUI/SServer and EServer instance admission;
- duplicates for each identity class, including concurrent handshakes;
- rejection in an upstream middleware and attempts to add a downstream rejection middleware;
- aborted transport in the gap between final `next()` and namespace `connection`, and shared Engine.IO transport with `/session` still open;
- stale A disconnect/cleanup after B identity replacement;
- active directory/presence/delivery visibility during pending claim versus accepted connection;
- preserved `connect_error` error shape and no production connections.
For each scenario specify exact controllable synchronization seam, expected invariant, and whether it is *testable through public Socket.IO API* or requires an unresolved design decision. Do not label a mock-only result as real Socket.IO proof.

E. Make an explicit feasibility decision: **IMPLEMENTABLE_WITH_PUBLIC_API**, **IMPLEMENTABLE_WITH_CONSTRAINTS**, or **BLOCKED_NEEDS_POLICY_CHANGE**; defend the choice with observed source/runtime evidence. If no design can guarantee both atomic admission and complete rollback across every abort using public APIs, say so plainly. Present smallest possible user decision/options (e.g. scope the guarantee to an M05-owned final gate and treat transport-abort as a remaining risk; or authorize an alternative integration boundary) **without implementing**.

## Deliverables (docs only)

1. `R7_2_A_2_NAMESPACE_ADMISSION_BOUNDARY_DESIGN_REPORT.md` (concise, roughly 60–110 lines): baseline, exact observed lifecycle evidence, design alternatives/tradeoffs, recommended design, feasibility verdict, residual risks, proposed implementation/test sequence, explicit decisions needed.
2. `docs/architecture/R7_2_NAMESPACE_ADMISSION_DESIGN.md`: ownership/active-vs-pending model, state transitions, failure/rollback cases, duplicate invariants and a compact test matrix. Diagrams optional; distinguish fact from proposal.
3. Update only TD02 in `docs/architecture/TECHNICAL_DEBT.md`, relevant TD02 portions of `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, and `docs/architecture/PROJECT_STATE.md`. Record actual committed base SHA and local dirty docs delta; do not call the new work committed.
4. Do not commit/push; stop after design review. Do not make production/test/code changes or automatically move to remediation/R7.2.B.

## Verification and reporting

- Run `git diff --check` and `npm run check:architecture` if the environment supports them. As docs-only task, existing typecheck/build/backend/playground results may be called **historical**, not newly PASS, unless actually executed. If you do run backend tests, **expect the known intentional failure** and report exact counts; never call this regression green.
- No production endpoints or data. Node 22.23.5 comparison baseline; clearly state if another runtime is used.
- Prioritize evidence-grounded, intent-revealing architecture, no speculative generic frameworks, and keep context/token usage bounded.
