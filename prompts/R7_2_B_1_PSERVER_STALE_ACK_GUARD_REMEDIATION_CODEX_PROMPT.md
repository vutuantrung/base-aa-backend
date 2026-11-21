# Codex Task — R7.2.B.1: PServer Stale ACK Guard & Readiness Hardening (TD03)

## Baseline, permissions, stop condition

- Repository: `vutuantrung/base-aa-backend`; branch: `main`.
- Expected committed HEAD: `9ea072113d636e37e181722c2ec882a832f438fb` (`test(r7.2.b): characterize stale PServer ACK and resume behavior`). Check `git branch --show-current`, `git rev-parse HEAD`, and `git status --short` first; stop if the expected base/source has changed materially and report the delta. Preserve all existing uncommitted work; do not reset or stash.
- Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` once. Review only TD03 in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, `docs/architecture/TECHNICAL_DEBT.md`, and `R7_2_B_PSERVER_ACK_RESUME_CHARACTERIZATION_REPORT.md`. Inspect relevant source/test paths below. Do not re-audit unrelated architecture or history.
- **Authorized scope:** narrowly scoped TD03 production fix and regression tests for attempt-generation protection and transport/session readiness gating. TD02 remains OPEN under Option B, and TD04 is out of scope. No new protocol contract or automatic PServer recovery behavior is authorized.
- **Stop after writing report; do not commit, push, or proceed to R7.2.C.**

## Source ownership and compatibility invariants

- Primary source: `src/modules/pserver/pserver-protocol.ts` (M04).
- Focused tests: `tests/pserver-protocol.test.ts`; reuse its `FakeTransport`, controlled `sessionAcks`, and deferred helper. Inspect adjacent types `src/modules/pserver/contracts.ts` only if needed.
- Keep `SESSION_CONNECT_EVENT = 'automation_vm:session:connect'`, `DISPATCH_EVENT = 'activity:task:dispatch'`, `peer:message`, all payload shapes, and `PServerProtocolConfig`, `PServerGatewayCapabilities`, and factory return surface unchanged.
- Preserve **10,000 ms** registration/resume ACK timeout and **5,000 ms** peer delivery ACK timeout.
- Preserve valid initial connect and valid resume behavior. After a missing, negative or rejected resume ACK for the **current attempt**, remain unready, retain the established `sessionId`, and on a future reconnect use `{ session_id: <retained-id> }`. Do not auto-clear ID, re-register with VM info, retry, back off, or take over another session.
- Preserve pre-ready inbound ACK `{ ok:false, code:'UNSUPPORTED_DESTINATION', error:'PServer session not ready' }`, existing no-ACK behavior (TD05), dispatch validation, and outbound rejected-ACK errors. No changes to M05/M06 identity lifecycle, TD02 characterization, workflows, or public interfaces.

## Implementation design constraints

1. Introduce a **monotonic connection/registration generation** local to `createPServerProtocol`. Each `connect` establishes a new generation; each `disconnect` invalidates prior generations. Ensure `close()` also invalidates in-flight callbacks even when a fake/custom transport does not immediately emit `disconnect`, without changing external API. Do not rely solely on `transport.connected`, because a stale ACK can arrive while a *new* transport attempt is connected.
2. Capture the generation in each `SESSION_CONNECT_EVENT` `emitWithAck` completion. **Only current-generation ACKs** may update `sessionId` or `sessionReady`. Stale fulfillment and rejection must not mutate current state or produce misleading current-attempt errors; preserve appropriate diagnostics for genuine current failures.
3. Define one small, intent-revealing readiness predicate for **transport connected AND current session ready**; use consistently for public `protocol.connected`, gateway `isConnected()`, inbound `peer:message`, task dispatch readiness, and outbound `deliver`. Preserve old message ACK/error contract.
4. Verify synchronous `connect`/`disconnect` ordering and `close()` behavior using existing fake semantics. Avoid introducing duplicate event listeners or background timers. Keep changes localized and readable (intent-revealing methods/extracted helpers where useful); avoid unnecessary casts, `any`, speculative abstractions, refactors, or dependencies.
5. Preserve pending outbound behavior unless specifically covered by the approved gating change. In particular, do not invent cancellation of messages already sent before disconnect; note such cases as a separate risk if observed.

## Deterministic test-first acceptance matrix

Update existing characterization tests to assert the **approved new invariants**; do not delete tests or silently weaken the existing baseline. No arbitrary sleeps, live PServer connections, or production data.

- **Initial registration:** transport connected but ACK pending => protocol/gateway unready, inbound message rejected, outbound delivery rejected; valid current ACK => ready and ID set; exact event/payload/timeouts unchanged.
- **ACK after disconnect before reconnect:** resolve old ACK => `sessionId` unchanged (undefined if initial), protocol/gateway unready, no inbound delivery to gateway and no outbound `peer:message` emission, even if the fake transport can emit.
- **Old ACK during new connection:** connect1/hold ACK1, disconnect, connect2/hold ACK2, resolve ACK1 => remain unready; no ID mutation and no outbound/inbound admission. Resolve ACK2 => ready with ACK2 ID.
- **Out-of-order responses:** ACK2 first makes connection2 ready with newer ID, then ACK1 cannot overwrite ID, change readiness, or confuse dispatch validation.
- **Rejected/missing/negative old ACK after a later connect:** stale outcome cannot poison/clear current attempt; current negative/rejected ACK keeps it unready.
- **Resume after known ID:** retain ID across disconnect, missing/negative/rejected current resume ACK, and next reconnect; valid current resume ACK restores readiness. No fallback/retry policy change.
- **Close while ACK pending:** no late ACK should re-arm session state or allow delivery; verify custom fake semantics without assuming a `disconnect` callback is always fired immediately.
- **Regression:** preserve valid dispatch, correct inbound ACK behavior, outbound ACK failure behavior, no-ACK ingress characterization, and both timeout values.

If implementation reveals a conflict with current public semantics or cannot satisfy an invariant without new policy, stop and document it rather than inventing behavior.

## Verification

Use Node **22.23.5**. Record **fresh actual** results of:

```bash
node --import tsx --test tests/pserver-protocol.test.ts
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

If infrastructure denies loopback or stream access (`EPERM`), distinguish environment failure from application failure and use only narrowly authorized reruns. Do not mark unexecuted checks PASS. Report focused and full test counts with failures/exceptions accurately.

## Deliverables

1. Implement the smallest M04 source change and focused tests.
2. Create root `R7_2_B_1_PSERVER_STALE_ACK_GUARD_REMEDIATION_REPORT.md` including: starting HEAD/status, exact paths changed, before/after behavioral matrix, generation/close/gating rationale, edge-case evidence, compatibility considerations, test commands/results, remaining TD03 concerns, and explicit STOP status.
3. Update only TD03 evidence/status in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, TD03 in `docs/architecture/TECHNICAL_DEBT.md`, and the current checkpoint in `docs/architecture/PROJECT_STATE.md`; do **not** declare TD03 fully closed unless all acceptance evidence genuinely supports it, and explicitly retain TD02 OPEN.
4. Do not commit/push; await architectural review before R7.2.C.
