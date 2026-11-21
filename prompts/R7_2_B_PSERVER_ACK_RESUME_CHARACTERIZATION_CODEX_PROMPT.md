# Codex Task — R7.2.B: PServer Deferred ACK & Resume Characterization (TD03)

## Prerequisite and boundaries

**Run only after R7.2.A.4 has been reviewed, its backend suite is green, and the reviewer authorizes moving to B.** The reviewer will provide an updated committed SHA; don't assume the old SHA is current. At task start read `AGENTS.md`, `docs/architecture/PROJECT_STATE.md`, then check `main`, `git rev-parse HEAD`, and `git status --short`. Preserve unrelated changes and existing commits. Never reset/stash. User selected Option B for TD02; **TD02 stays OPEN** and is **out of scope** for this TD03 task.

Goal: test-first deterministic characterization of current PServer session-ACK races and failed resume behavior. **Tests and narrowly relevant docs only; no production fixes, policy changes, protocol changes, new retry/fallback, or altered ACK semantics.** Stop after report and review before any TD03 remediation or R7.2.C.

## Read only relevant evidence/source

- `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` — TD03-A/B/C.
- `src/modules/pserver/pserver-protocol.ts` and `src/modules/pserver/contracts.ts`.
- `tests/pserver-protocol.test.ts` (current `FakeTransport`/`makeGateway` and existing readiness/resume coverage).
- `docs/architecture/TECHNICAL_DEBT.md` — TD03; `docs/architecture/PROJECT_STATE.md`.
- Inspect a small relevant delta only if HEAD differs from the A.4 acceptance commit. No broad history rereads.

## Required deterministic test matrix

Use a deferred-promise fake transport with explicit externally controlled ACK resolve/reject for each `SESSION_CONNECT_EVENT`. No arbitrary sleeps or production PServer connections. Distinguish `transport.connected`, `protocol.connected`, registered gateway transport `isConnected()`, `protocol.sessionId`, emitted registration/resume payload and outbound delivery gating.

1. **Baseline**: connected socket before ACK stays not session-ready; after valid ACK, `sessionId` and readiness match. Preserve existing 10,000 ms session ACK timeout, 5,000 ms peer delivery ACK timeout, event names, and VM payload.
2. **ACK1 arrives after disconnect, before reconnection**: hold ACK1; fire connect, disconnect and settle ACK1. Characterize state mutation, exposed readiness and retained session ID accurately; distinguish internal readiness from public `connected` (requires transport connected).
3. **ACK1 arrives after connect2, before ACK2**: hold ACK1, disconnect, reconnect and hold ACK2, then settle ACK1. Check whether stale ACK affects readiness, session ID, outbound gateway readiness and delivery, and what connect2 transmitted. Finally settle ACK2; record current final state. This sequence tests the suspected absence of attempt generation guard.
4. **Out-of-order ACK responses**: if distinct from scenario 3, settle ACK2 first then ACK1 to characterize whether older session IDs overwrite newer ones. Use only stable fake events.
5. **Resume after established session**: ACK initial registration with known ID; disconnect and reconnect. For resumed ACK missing/negative/rejected promise, characterize current unready state, retained `sessionId`, and next reconnect payload using the retained ID. Avoid silently clearing session ID or implementing fresh registration. Control console noise locally if necessary and restore mocks in `finally`.
6. **Inbound/outbound gate preservation**: while session is unready, inbound peer ACK and outbound deliver behavior retain existing contracts; no speculative recovery.

Prefer tests that **PASS while asserting observed current behavior**, even when exposing a defect (explicit characterization rather than proposed-fix assertion). If you find that current behavior cannot be characterized without intentionally failing tests, stop, document the reason, and request review instead of leaving the default suite red. Keep test count and scenarios independently readable.

## Verification and report

Node 22.23.5: run focused `node --import tsx --test tests/pserver-protocol.test.ts`, `npm run check:architecture`, `npm run typecheck`, `npm run build`, `npm test -- --test-concurrency=1`, `npm --prefix testing run test:playground`, `git diff --check`. If the backend suite is already red at start, stop and return to A.4 gate. Record exact fresh results; never mark inherited tests newly PASS. Prefer mocks and loopback only, no production connections. Do not weaken tests.

Create `R7_2_B_PSERVER_ACK_RESUME_CHARACTERIZATION_REPORT.md`; update only `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` TD03, `docs/architecture/TECHNICAL_DEBT.md` TD03, and `docs/architecture/PROJECT_STATE.md`. Explicitly separate reproduced stale ACK mutations from hypothesized production timing and record choices for stale ACK ignore / resume-reject policy **without deciding them**. Report any compatibility concerns. Do not modify production source or public interfaces, do not commit/push, and **STOP before fixes/R7.2.C**.
