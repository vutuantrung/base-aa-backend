# R7.2.C.1 — Logical-Instance Affinity & Topology Consistency

## Baseline and changed paths

- Branch `main`; starting HEAD `5d843813636e36d8a7710c2b0bcf7be6e8b382c9` (expected, includes reviewed/committed C characterization). Initial tree was clean apart from the C.1 task prompt.
- Changed: `src/modules/peer-messaging/peer-message-service.ts`, `src/modules/peer-messaging/peer-destination-policy.ts`, `tests/peer-destination-policy.test.ts`, TD04 in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` and `docs/architecture/TECHNICAL_DEBT.md`, current checkpoint in `docs/architecture/PROJECT_STATE.md`, and this report.
- No network schema, public peer message envelope, ACK shape/code, protocol event, M05/M06 membership, TD02 or TD03 behavior was changed.

## Design choice

1. **Binding point:** after sender/schema and destination validation, synchronously before `executeTransformations()` can await. For explicit EServer targets, capture that instance ID. For untargeted messages, capture the sole initial EServer instance ID; initial multiple instances still fail validation, and zero instances fail connectivity.
2. **Carrying the decision:** `PeerDeliveryContext` is opaque per-message internal routing state. `PeerMessageService` passes it to contextual connectivity checks and delivery; it is not spread into or stored on the `PeerMessage`. Non-EServer destinations receive no context and retain existing routing.
3. **Classification:** a missing bound instance is reported as `PeerMessageError('DESTINATION_OFFLINE')`, preserved by service error mapping. Actual delivery exceptions remain `DELIVERY_FAILED`. Pre-existing untargeted ambiguity remains `AMBIGUOUS_DESTINATION` with the same message.
4. **Check-to-send race:** policy checks and looks up the current identity immediately before calling socket delivery, but M06 lookup and physical send are not atomic. If the identity is absent at the final policy lookup, classify offline. If it disappears after lookup and the socket send rejects, preserve `DELIVERY_FAILED`. No retry or delivery guarantee is added.

The only seam adjustment is optional routing context on the internal `PeerDelivery` capability. Existing non-contextual implementations remain valid; the application-facing peer message and wire contracts are unchanged.

## Scenario results: old characterization to approved behavior

| Scenario | C characterization | C.1 behavior and evidence |
|---|---|---|
| Stable explicit `worker-1/socket-old` | Success to old socket | Preserved; one delivery, same ID/target/payload and transform processing metadata. |
| Explicit worker disconnects during transform | Offline, zero delivery | Preserved as `DESTINATION_OFFLINE`. |
| Explicit `worker-1` socket replacement | Success to new socket | Preserved; current socket for bound `worker-1` is resolved. |
| Untargeted sole worker-1, then worker-2 is added | Old code could fail `DELIVERY_FAILED` due late ambiguity | Now remains bound to worker-1 and succeeds to its current socket; public envelope remains untargeted. |
| Untargeted worker-1 removed, sole worker-2 remains | Old code retargeted to worker-2 | Now `DESTINATION_OFFLINE`, zero deliveries to worker-2. |
| Untargeted worker-1 reconnects on new socket | Old code selected whichever sole worker existed | Now succeeds to new socket only when logical ID remains worker-1; envelope remains untargeted. |
| Multiple EServers initially | `AMBIGUOUS_DESTINATION` | Preserved before transformation starts; zero delivery. |
| No EServer initially | `DESTINATION_OFFLINE` | Preserved before transformation starts; zero delivery. |
| Actual socket delivery throws | `DELIVERY_FAILED` contract | Preserved, including a deterministic check-to-send disconnect failure. |

Tests use a manually released transformer, mutable real `PeerDirectory`, `PeerDestinationPolicy`, and socket delivery recorder. This proves deterministic service/policy behavior, not real socket event timing. Existing tests continue to cover source-instance metadata, transformation metadata, PServer/AAB and other peer behavior.

## Verification (Node 22.23.5)

- Focused `node --import tsx --test tests/peer-message-service.test.ts tests/peer-destination-policy.test.ts`: **both files passed**; 25 `node:test` cases ran (15 policy, 10 service; Node's default reporter aggregates them under two file subtests).
- `npm run check:architecture`: **PASS**; 52 files, 113 edges (51 runtime / 62 type-only), zero runtime file SCCs; one module runtime SCC reported.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `npm test -- --test-concurrency=1`: **177/177 passed**.
- `npm --prefix testing run test:playground`: **32/32 passed**.
- `git diff --check`: **PASS**.

Typecheck/build and focused test commands printed sandbox stream-descriptor warnings but exited 0; playground and all suites exited 0.

TD04 is fixed under deterministic characterization for the approved logical-instance policy; real topology/socket timing and the non-atomic lookup-to-send race remain. TD02 remains OPEN under Option B; TD03 is not declared resolved. Stop for reviewer approval before R7.2 closure. No commit or push.
