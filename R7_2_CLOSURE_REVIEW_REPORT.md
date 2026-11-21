# R7.2 Closure Review — Connection, Session & Destination Reliability

## Baseline and scope

- Branch `main`; reviewed committed source HEAD `dce8537cff84d0968589fafa9e55dac8c52c518b` (`fix(r7.2.c): enforce logical instance affinity during async transformation`), matching the expected baseline.
- At start, the only local change was the pre-existing untracked `prompts/R7_2_CLOSURE_REVIEW_CODEX_PROMPT.md`; it is preserved. No staged or unstaged tracked changes existed.
- Review is evidence reconciliation and documentation only. No production or test source changed; no commit or push.
- R7.2 sequence: TD02 A.4 passing current-behavior characterization; TD03 B characterization then B.1 stale ACK/readiness remediation; TD04 C characterization then approved C.1 logical-instance affinity remediation.

## Disposition matrix

| Debt | Source-verified behavior | Test evidence and boundary | Disposition |
|---|---|---|---|
| **TD02 — M05/M06 admission cleanup** | `/peers` middleware registers in M06 before `next()`; accepted `connection` installs the connection wrapper/disconnect cleanup. `PeerDirectory.remove` checks connection ID, so stale removal cannot erase a newer identity. | A.4 is a passing **current-behavior characterization**: real local Socket.IO loopback with a deliberately added later rejecting middleware retains the identity and rejects same-peer retry. `/session` remains connected over the shared open Engine.IO transport; no namespace disconnect or transport close is observed. The separate fake middleware-gap test is only a state-sequence simulation. Spontaneous abort in the production single-middleware composition is **unverified**. | **OPEN — Option B retained.** All-aborts cleanup remains required. Revisit when a supported namespace-scoped terminal lifecycle boundary (or newly validated equivalent) can roll back every pending outcome while preserving atomic duplicate rejection and connection-ID-safe cleanup. No pending reservation, timer rollback, private hook, monkey-patch or weaker guarantee. This is not fixed by the passing test. |
| **TD03 — PServer ACK/session state** | M04 uses a monotonic generation invalidated on each connect, disconnect and explicit close. Only current-generation ACK callbacks mutate session ID/readiness. `isSessionReady` requires transport connected and session ready; public readiness, gateway readiness, inbound messages, dispatch validation and outbound delivery use it. Current failed resume retains the established ID and leaves session unready; next connect resends `{ session_id }`. Event names and 10,000 ms registration / 5,000 ms delivery ACK timeouts remain unchanged. | B.1 controlled fake tests cover stale fulfillment/rejection, out-of-order ACKs, close while ACK is pending, readiness gates and resume outcomes. They prove protocol callback ordering, not remote PServer behavior. | **PARTIALLY REMEDIATED, NOT CLOSED.** Real PServer timing and rejected-resume contract remain unverified. An outbound delivery already sent before disconnect is not cancelled. No auto-retry, ID clearing or fallback policy was introduced. |
| **TD04 — topology during async transformation** | M10 binds an explicit EServer instance or initial sole instance before awaiting transformations. Opaque internal `PeerDeliveryContext` carries the binding; M06 lookup at delivery resolves a current physical connection only for that instance. Initial ambiguity remains `AMBIGUOUS_DESTINATION`; missing bound instance is `DESTINATION_OFFLINE`; transport delivery rejection remains `DELIVERY_FAILED`. | C.1 deterministic tests integrate `PeerMessageService`, `PeerDestinationPolicy`, real in-memory `PeerDirectory`, controlled transform promises and a delivery recorder. They cover disconnection, same-instance socket replacement, additional/different instances, initial ambiguous/offline cases and send rejection. The public message envelope remains unchanged. This is a deterministic model, not proof of real socket timing. | **REMEDIATED UNDER DETERMINISTIC CHARACTERIZATION.** The M06 identity lookup and physical send are not atomic; disappearance after lookup can still produce `DELIVERY_FAILED`. No retry or delivery guarantee was added. |

## Cross-cutting review

- Reviewed current source and focused tests; R7.2 production edits are confined to M04 PServer protocol generation/readiness behavior and M10 peer-message service/destination policy affinity. TD02 source remains unchanged. No changed schemas, event names, ACK shapes, public HTTP/socket contracts, or workflow implementation were found in the reviewed R7.2 changes.
- `PeerDeliveryContext` is internal routing state. Tests preserve the original untargeted message envelope; the context is not copied into the wire `PeerMessage` or ACK. Existing tests cover source-instance metadata and PServer/AAB delivery paths.
- M09 generic messaging, M12/M13 workflow behavior and ownership are unchanged. R7.1 constraints remain as recorded: zero file-level runtime SCCs; the M10↔M12↔M13 module runtime SCC is reported for review, not blanket-failed; the M10↔M11 all-import relation is type-only; checker syntax/CI limitations remain deferred. No new architecture decision record was needed: Option B and Option A were already explicitly approved and are referenced by the debt/inventory records.
- Evidence categories stay distinct: direct source review verifies control flow; TD03/TD04 promise-controlled tests verify modeled orderings; TD02 A.4 verifies its deliberately controlled local Socket.IO loopback; spontaneous abort, real PServer timings and production topology interleavings remain unverified.

## Fresh verification — Node 22.23.5

- Focused `node --import tsx --test tests/socket-peer-gateway-handshake.test.ts tests/pserver-protocol.test.ts tests/peer-message-service.test.ts tests/peer-destination-policy.test.ts`: **43/43 passed** (permissioned rerun for local Socket.IO loopback). The initial sandboxed invocation failed at the handshake test-file process level; the focused permissioned handshake run passed **2/2**.
- `npm run check:architecture`: **PASS**; 52 files, 113 resolved edges (51 runtime, 62 type-only), 0 file runtime SCCs; M10↔M12↔M13 module runtime SCC reported; M06↔M10↔M11↔M12↔M13 all-import SCC reported; M10↔M11 warning is type-only, not a runtime SCC.
- `npm run typecheck`: **PASS**. `npm run build`: **PASS**.
- `npm test -- --test-concurrency=1`: first sandboxed run exited 1 (17 passed / 24 failed at test-file subtest level); after narrowly authorized execution, **177/177 cases passed**, 0 failed. The initial failure was not accepted as a code result; only the permissioned rerun is the suite acceptance result.
- `npm --prefix testing run test:playground`: **32/32 passed**.
- `git diff --check`: **PASS** after documentation changes. No production endpoint or runtime data was accessed.

## Closure decision and next checkpoint

**Recommendation: CONDITIONALLY CLOSED**, pending reviewer approval. The approved R7.2 scope has been characterized and the approved B.1/C.1 corrections are covered by fresh tests. R7.2 is not fully closed in the sense of resolving all three risks: TD02 remains OPEN by explicit Option B decision, and TD03 retains remote-protocol and in-flight-delivery limits. TD04 is addressed only within the stated deterministic boundary and retains the check-to-send race.

**Conditional go for R7.3 after review approval:** R7.3 can be considered independently because TD02’s missing lifecycle boundary is isolated to M05/M06 admission cleanup, TD03’s limits are explicitly retained, and R7.2 did not alter M12/M13 workflows or public message contracts. This is a recommendation, not authorization to start R7.3.

Future task granularity: one phase-level task by default; split high-risk phases into two checkpoints, and critical phases into two or three meaningful checkpoints only when necessary. Avoid micro-task decomposition unless a concrete blocker requires it.

## Changed paths for this review

- `R7_2_CLOSURE_REVIEW_REPORT.md`
- `docs/architecture/PROJECT_STATE.md`
- `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`
- `docs/architecture/TECHNICAL_DEBT.md`

Stop for reviewer approval. No commit/push and no R7.3 implementation.
