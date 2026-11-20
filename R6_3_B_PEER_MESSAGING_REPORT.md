# R6.3.B — Peer Messaging Boundary Report

**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Implementation baseline:** `b6c62e0911de14db3ac20d71072220d409abe931`  
**Verification runtime:** Node.js 22.23.5

## 1. Verified Baseline and Summary

- Verified `main` at the requested `HEAD` `b6c62e0911de14db3ac20d71072220d409abe931`.
- The only pre-existing worktree item was the untracked `prompts/R6_3_B_PEER_MESSAGING_CODEX_PROMPT.md`. It was preserved.
- Read `AGENTS.md`, R6.2.A/B/C reports, R6.3.A report, and `AAB_PROJECT_FOLDER_STRUCTURE_R6_2_A.md`. R0–R5 decision records were not present. The architecture baseline and prior phase reports were used as available context; no missing decisions were invented.
- The historical implementation SHAs in R6.2.A/B/C and R6.3.A refer to earlier checkpoints. They do not conflict with this task's requested current implementation baseline, which was verified exactly.
- M10 now owns generic peer destination policy and generic processing-to-ACK mapping. Socket physical lookup and ACK transmission remain in infrastructure. Existing workflow branches retain their order and behavior. `PeerMessageService.process`, its constructor and transformation property, `PeerDelivery`, `PeerMessageError`, `attachPeerGateway`, `attachSocketServer`, PServer registration and receive APIs remain compatible.

## 2. Responsibility Inventory Before and After

| Responsibility | Before | After |
|---|---|---|
| Peer envelope schema, defaults, sender validation, envelope construction and transformation pipeline | M10 `PeerMessageService` | Remains M10, unchanged process contract and transformation behavior |
| Logical destination availability, ambiguity and target choice | Callback closures inside `peer-gateway.ts` | M10 `PeerDestinationPolicy`, consuming narrow M06 directory capabilities |
| PServer transport capability reference | Mutable variable in `peer-gateway.ts` | One per-gateway `PeerDestinationPolicy` instance; compatibility method delegates to it |
| Physical socket connection lookup, event emission, timeout and peer ACK interpretation | Inline in `peer-gateway.ts` | M05 infrastructure `SocketPeerMessageDelivery` |
| Generic processing result/error mapping to `PeerMessageAck` and diagnostics | `handleMessage` in `peer-gateway.ts` | M10 `processPeerMessageForAck` |
| PServer session readiness and PServer wire ACK | M04 `pserver-protocol.ts` | Remains M04 |
| Logical peer identity and availability state | M06 `PeerDirectory` | Remains M06 sole owner |
| Presence, welcome, ping, socket handshake and lifecycle | M05/M06 with gateway coordination | Remain in existing owners |
| F08/F09 task and result validation, persistence, async delivery and receipt ACKs | Workflow branches in `peer-gateway.ts` | Remain there, before generic processing dispatch |
| Resource-selection validation, persistence, async forwarding, status and snapshots | Workflow branch in `peer-gateway.ts` | Remains there, before generic processing dispatch |
| F03 SServer status and F04 EServer VM info | Existing gateway/application message flows | Unchanged |

The service continues to own generic processing orchestration: parse and validate, preserve authenticated identity, resolve and execute the existing transformation registry, attach processing metadata, recheck availability after async transformation, run the optional pre-delivery hook and deliver. No M11 or workflow implementation was moved into M10.

## 3. Source Structure

```text
src/
├── modules/peer-messaging/
│   ├── contracts.ts                       # Peer envelope schema and ACK contract
│   ├── peer-message-service.ts             # Generic processing + ACK result mapping
│   ├── peer-destination-policy.ts          # M10 destination and PServer policy
│   ├── peer-directory.ts                   # M06 logical identity/state owner
│   ├── transformation-registry.ts          # M11; unchanged
│   ├── task-file-store.ts                  # M12; unchanged
│   └── resource-selection-store.ts         # M13; unchanged
├── infrastructure/socket/
│   ├── peer-gateway.ts                     # workflow/presence coordination and compatibility API
│   ├── socket-peer-gateway.ts              # M05 physical socket and handshake capabilities
│   └── socket-peer-message-delivery.ts     # M05 peer event/ACK technical adapter
└── modules/pserver/pserver-protocol.ts      # M04 session readiness and PServer wire delivery
```

No M09 files or shared M09 router were changed. Peer messaging remains a distinct peer-to-peer system.

## 4. Public Interfaces and Runtime Composition

- `PeerMessageService.process(value, authenticatedFrom, authenticatedInstanceId?)`, its public constructor, `transformations` property, `PeerDelivery`, and `PeerMessageError` remain available with their existing contracts.
- `PeerDestinationPolicy` implements the existing `PeerDelivery` capability and consumes `PeerDirectoryCapabilities` plus `PeerSocketDelivery`. It imports no Socket.IO, HTTP, stores or workflow modules.
- `SocketPeerMessageDelivery` receives a connection lookup capability and performs M05 physical lookup, `peer:message` emission, 5,000 ms ACK wait and existing positive/negative ACK interpretation.
- `ExternalPeerTransport` remains exported by `peer-gateway.ts`; it extends the M10 PServer transport capability without changing its shape. `registerPServerTransport(transport)` remains public and delegates to the single policy instance created for that attached gateway.
- `receiveFromPServer(value)`, `attachPeerGateway`, `attachSocketServer`, and existing Socket Gateway composition paths remain unchanged.
- `processPeerMessageForAck` maps the generic service result to the existing `{ ok: true, data }` or `{ ok: false, code, error }` ACK. It retains `TRANSFORMATION_FAILED` as the fallback code and `Internal message error` as fallback text for non-`Error` throws.

`createApplication` still creates the M05 socket gateway and attaches one peer gateway when enabled, then passes the returned gateway capability into the M04 PServer connector. M10 policy state is instantiated per attached peer gateway. The M04 protocol registers its readiness-aware transport exactly once through the established compatibility method. M06's directory remains the only logical identity registry; no socket state is duplicated in M10.

## 5. Dependency Direction and State Ownership

- M10 depends on its peer contracts and narrow M06 directory identity/availability types. It does not depend on concrete infrastructure, persistence, task or selection workflows.
- M05 infrastructure implements the physical delivery capability and continues to own Socket.IO connection lookup and event mechanics. M10 receives only a connection ID and a result-capable delivery operation, never a socket object.
- M06 `PeerDirectory` remains the sole owner of peer identities and logical availability. Availability checks are intentionally distinct from subsequent physical connection lookup.
- M04 remains the owner of PServer session readiness and wire delivery. M10 stores only the registered transport capability, not M04 session state.
- The PServer capability reference now lives in the per-instance `PeerDestinationPolicy`; the previous gateway-local variable was removed, so there is one mutable reference owner per application gateway.
- Workflow stores and records remain owned by their existing M12/M13 modules and gateway workflow branches.

## 6. Message Lifecycle, Destination Policy, Errors and ACKs

1. The M05 peer gateway authenticates the physical connection, obtains its M06 identity, and invokes `handleMessage` only when a Socket.IO ACK callback is present. M04 likewise invokes `receiveFromPServer` only when its inbound ACK callback is present.
2. `handleMessage` preserves existing branch precedence: AAUI resource selection, PServer task request, EServer task result, then generic M10 processing. The first three retain workflow-specific persistence/receipt ACKs.
3. Generic M10 processing validates the strict schema and defaults, checks sender identity and the `toInstanceId` restriction, validates destination ambiguity, checks logical availability, creates the envelope, clones payload data, adds authenticated EServer source instance metadata, and runs existing transformation resolution/execution.
4. After asynchronous transformations, M10 checks logical availability again. `to: aab` returns locally without outbound delivery. For other destinations, policy selects a registered target and calls the narrow delivery capability.
5. PServer must be registered and ready according to the M04 capability. EServer explicit instance IDs are honored; an untargeted single instance is selected; multiple instances produce `AMBIGUOUS_DESTINATION`; zero instances produce `DESTINATION_OFFLINE`. SServer and AAUI use their single logical directory lookup.
6. If logical availability passed but the physical socket is then absent, delivery still fails as a delivery error, preserving the existing distinction. Socket delivery uses `peer:message`, a 5,000 ms timeout and the existing `{ ok: true }` positive ACK interpretation. Missing/negative ACKs reject and are mapped by the service to `DELIVERY_FAILED`. PServer M04 transport behavior remains readiness-aware and uses its existing wire ACK handling.
7. Generic processing success has no workflow `status` field. Workflow receipt ACKs such as `{ ok: true, status: 'received', data }` remain distinct and are returned only by the existing task/resource-selection branches.

Schema defaults, ID/timestamp generation, cloning, transform order and metadata, transformation failure mapping, sender mismatch errors and destination recheck behavior are unchanged. The optional `beforeDeliver` hook and `PeerDelivery` contract remain intact.

ACK-callback-dependent processing remains as before: socket and PServer ingress do not process peer messages when no ACK callback was supplied. No-ACK processing behavior is deferred debt; this change adds no ACK protocol or retry policy.

## 7. Preserved Workflow and Integration Behavior

F08 task requests still validate, persist before receipt ACK, choose their target at the same point, schedule EServer forwarding with `setImmediate`, and publish independent lifecycle status. F09 results retain durable receipt before ACK, authenticated source instance, scheduled PServer forwarding, and separate delivery status. Resource selection retains validation, persistence, immediate receipt ACK, scheduled forwarding, delivery-status writes and their independent failure handling, snapshots and refresh safety checks.

F03/F04 routing, presence publication, AAUI snapshots, current-connection safety checks, welcome/ping events, authentication, feature flags, PServer registration/readiness and inbound/outbound direction remain unchanged. Existing local-mock tests cover peer/PServer integration, F03/F04/F08/F09 and resource-selection persistence, forwarding and snapshots. These tests verify the implemented mock protocol surface only; no production PServer verification is claimed.

## 8. Changed Files and Verification

Changed files:

- `src/modules/peer-messaging/peer-destination-policy.ts` (new)
- `src/modules/peer-messaging/peer-message-service.ts`
- `src/infrastructure/socket/socket-peer-message-delivery.ts` (new)
- `src/infrastructure/socket/peer-gateway.ts`
- `tests/peer-destination-policy.test.ts` (new)
- `tests/socket-peer-message-delivery.test.ts` (new)
- `tests/peer-message-service.test.ts`
- `R6_3_B_PEER_MESSAGING_REPORT.md`

Eight focused backend test cases were added. Against the requested baseline of 66 backend and 32 playground tests, the final suites contain 74 backend and 32 playground tests (106 total).

| Verification | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 74 backend tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |
| `git diff --check` | PASS |

The first sandboxed backend run was blocked because tests could not create local listeners. The requested full suites were rerun with local-bind permission and passed. Only local mock/test servers were used; no production service was contacted. Focused cases cover explicit and single-instance EServer targets, ambiguous and missing targets, PServer readiness, local AAB, delivery failure and ACK mapping, authenticated source identity, destination recheck after async transformation, socket event/timeout/ACK behavior, and generic versus workflow ACK shape.

## 9. Remaining Debt and R6.3.C Readiness

- No-ACK inbound peer-message processing remains callback-dependent and deferred.
- Socket and PServer delivery remain best-effort synchronous ACK operations; no retries or durable delivery were introduced.
- Handshake reservation/cleanup and reconnect races remain deferred to the stated later reliability work.
- M11 transformation registry/execution remains in its current module and behavior. M12/M13 workflow branches and stores remain where they were.
- The PServer integration tests use a local mock; production compatibility is not asserted.

R6.3.B is complete and leaves the existing transformation registry, original-envelope matching, priority, cloning, metadata, failure mapping and destination recheck behavior ready for R6.3.C. This report does not claim M11 extraction or R6.4 completion.
