# Codex Task — R7.2 Closure Review: Connection, Session & Destination Reliability

## Authority, baseline and scope

Repository: `vutuantrung/base-aa-backend`; branch `main`.
Reviewer-verified expected HEAD: `dce8537cff84d0968589fafa9e55dac8c52c518b` (R7.2.C.1 committed).

Perform **one complete R7.2 closure review**, not another series of micro-phases. This task is evidence-based verification, debt classification, documentation and a closure recommendation; **no production behavior changes** are authorized. Stop for reviewer approval before R7.3. Do not commit/push.

At start read `AGENTS.md`, `docs/architecture/PROJECT_STATE.md`, and the applicable R7.2 risk inventory. Run `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git log -1 --oneline`. Record actual HEAD and preserve all pre-existing local modifications/untracked files (no reset/stash/overwrite). If HEAD differs, inspect only the intervening relevant delta and report any baseline conflicts.

## Closure evidence to reconcile

Read **only the necessary targeted source, tests and current summaries**, avoiding a broad historical codebase re-audit:

- `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`
- `docs/architecture/R7_2_NAMESPACE_ADMISSION_DESIGN.md`
- `docs/architecture/TECHNICAL_DEBT.md` (TD02–TD04)
- `docs/architecture/ARCHITECTURE_DECISIONS.md` (relevant invariant decisions)
- `R7_2_A_4_TD02_PASSING_CHARACTERIZATION_REPORT.md`
- `R7_2_B_PSERVER_ACK_RESUME_CHARACTERIZATION_REPORT.md`
- `R7_2_B_1_PSERVER_STALE_ACK_GUARD_REMEDIATION_REPORT.md`
- `R7_2_C_DESTINATION_TOPOLOGY_CHARACTERIZATION_REPORT.md`
- `R7_2_C_1_LOGICAL_INSTANCE_AFFINITY_REMEDIATION_REPORT.md`
- `src/infrastructure/socket/socket-peer-gateway.ts`, `src/modules/peer-messaging/peer-directory.ts`, `tests/socket-peer-gateway-handshake.test.ts` as needed for TD02
- `src/modules/pserver/pserver-protocol.ts`, `tests/pserver-protocol.test.ts` as needed for TD03
- `src/modules/peer-messaging/peer-message-service.ts`, `src/modules/peer-messaging/peer-destination-policy.ts`, `tests/peer-destination-policy.test.ts`, `tests/peer-message-service.test.ts` as needed for TD04.

Explicitly differentiate **source-verified behavior**, **local deterministic-model tests**, **Socket.IO local loopback evidence**, and **unverified real-world conditions**.

## Review questions and required disposition

### TD02 — Handshake identity cleanup (must remain OPEN)

- Confirm the controlled downstream `/peers` rejection remains a **passing characterization of retained identity**, not a fix. Record that `/session` can keep shared Engine.IO transport open and that a duplicate retry is rejected.
- Preserve user-approved **Option B**: retain the all-aborts cleanup requirement. Do not introduce a partial pending reservation, timers as rollback, private Socket.IO hooks, monkey-patching, or weakened guarantee.
- Current single-middleware spontaneous transport-abort reachability remains unverified; do not claim it is either proved impossible or repaired.
- State precise next trigger/dependency for revisiting TD02: a supported namespace-scoped terminal lifecycle boundary or newly validated approach that preserves atomic duplicate rejection and connection-ID-safe cleanup.

### TD03 — PServer ACK/session reliability (partially remediated)

- Confirm generation invalidation at connect, disconnect and explicit close, stale ACK rejection, readiness gating for public, inbound, dispatch and outbound paths.
- Check retained session ID and current failed-resume behavior, event names, timeout and payload compatibility.
- Record separately that real PServer timings, rejected-resume contract and already-started outbound delivery after disconnect remain outside verified scope. Do not close these as fixed.
- Do not add auto-retry, session ID clearing, new recovery policy or cancellation.

### TD04 — Logical EServer instance affinity (remediated with residual limits)

- Confirm explicit target stays bound; untargeted sole instance binds before async transformation; same-instance socket replacement permitted; different instance never substituted; initial ambiguity/offline classifications preserved; post-transform bound-instance absence classified `DESTINATION_OFFLINE`; physical send rejection remains `DELIVERY_FAILED`.
- Confirm internal `PeerDeliveryContext` does not leak into wire `PeerMessage` envelopes, ACKs, payload, source metadata or event schemas.
- Record non-atomic identity-lookup-to-send race and real socket timing as residual limits, not as a claim of end-to-end guarantee.

### Cross-cutting checks

- Confirm R7.2 changed only relevant boundaries and did not unintentionally alter R7.1 architecture constraints, M12/M13 workflow semantics, M09 generic messaging, public HTTP/socket contracts or other module ownership.
- Acknowledge the previously documented module-level M10/M12/M13 SCC and architecture checker limitations; do not invent a new issue or silently claim they are fixed.
- Inspect test naming/expected-result semantics: a passing characterization of a defect is not a remediation proof.
- Decide **CLOSED / CONDITIONALLY CLOSED / BLOCKED** for R7.2, with evidence. The presence of an open TD02 must be explicit: do not claim fully CLOSED. If conditionally closing, list unambiguous acceptance limits, owners/next phase for any deferred work, and reasons R7.3 may safely proceed independently.
- Do not automatically advance to R7.3 or expand into contract fixes.

## Verification — run fresh on Node 22.23.5

Run and record exact outcomes, never substituting historical counts for a fresh run:

```bash
node --import tsx --test tests/socket-peer-gateway-handshake.test.ts tests/pserver-protocol.test.ts tests/peer-message-service.test.ts tests/peer-destination-policy.test.ts
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

Use only local fakes/loopback. If sandbox blocks port binding or streams, request narrow authorization and accurately record any non-run steps. Do not weaken tests or change business code simply to get green. If any verification fails, diagnose scope and report BLOCKED without claiming closure.

## Outputs

1. Root report `R7_2_CLOSURE_REVIEW_REPORT.md` with: actual HEAD and delta; concise R7.2 timeline; per-TD evidence and decision matrix; independent source review findings; fresh test results; backward-compatibility limitations; unresolved risks; recommended closure classification and explicit go/no-go recommendation for R7.3.
2. Update `docs/architecture/PROJECT_STATE.md` to a **short current checkpoint** reflecting the real review, preserving R7.1 history only as useful references.
3. Update only TD02–TD04 closure/status evidence in `docs/architecture/TECHNICAL_DEBT.md` and R7.2 risk inventory if actual findings justify it. Preserve Option B and all TBD module classifications.
4. Where necessary, record a concise R7.2 closure decision in existing architecture decisions documentation without inventing missing historical ADRs.
5. Summarize the agreed **future task granularity**: starting R7.3, one phase-level task by default; high-risk phases split into 2, critical into 2–3 meaningful checkpoints only when necessary, and no micro-task decomposition unless a real blocker forces it. This is planning guidance, not authorization to begin R7.3.

**STOP** after reporting. No commit/push, no TD02/TD03 new remediation, no R7.3 implementation.
