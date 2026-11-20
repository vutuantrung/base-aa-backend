# R6.2.B — Socket Gateway & Peer Identity Report

**Repository:** `base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68`  
**Implementation baseline:** `46ea64baee2a06df294665773adaaee76109c538`  
**Verification runtime:** Node.js 22.23.5

## 1. Executive Summary

M06 now owns transport-independent peer identity records, including EServer instance identity, single-peer identity, connection ID association and logical presence. M05 owns the Socket.IO server and namespaces, peer handshake validation and narrow physical connection capabilities. The peer gateway consumes the directory and connection capabilities instead of retaining maps of Socket objects.

Socket.IO remains the physical connection registry; the gateway resolves a logical connection ID through the `/peers` namespace socket registry and wraps it in a narrow capability. Directory removal checks the connection ID, so a stale disconnect cannot remove a replacement identity. Existing peer routing, task and resource-selection workflows remain in the peer gateway.

## 2. Before/After Responsibility Mapping

| Responsibility | Before | After |
|---|---|---|
| Socket.IO server creation, CORS, buffer limit and close | `socket-server.ts` | M05 `socket-gateway.ts`; `attachSocketServer` remains a compatibility facade |
| `/session` and `/worker` namespace setup, auth, inbound message parsing and ACKs | `socket-server.ts` | M05 `socket-gateway.ts` |
| `/peers` namespace creation and peer handshake auth | `peer-gateway.ts` | M05 `socket-peer-gateway.ts` |
| Peer identity registration and duplicate checks | `singlePeers` / `eservers` Socket maps and handshake checks | M06 `PeerDirectory`, called during M05 handshake integration |
| Default EServer instance identity and multi-instance map | `peer-gateway.ts` | M06 directory (`default` instance preserved) |
| Single SServer and AAUI connection identity | `peer-gateway.ts` | M06 directory |
| Connection ID to physical connection lookup | Maps stored Socket objects | Socket.IO namespace registry, adapted by M05 connection capability |
| Connection removal and stale-disconnect protection | Conditional map deletion in `peer-gateway.ts` | M05 disconnect capability invokes M06 removal with connection identity |
| Logical EServer presence snapshot | Built from Socket map in `peer-gateway.ts` | M06 directory snapshot, transmitted by peer gateway |
| Presence event publication and AAUI snapshots | `peer-gateway.ts` | Remains peer gateway policy using M05/M06 capabilities |
| Destination selection and ambiguity policy | `PeerMessageService` delivery callbacks in `peer-gateway.ts` | Remains peer gateway policy; identity lookup uses M06 |
| ACK-based delivery, peer ping and welcome | `peer-gateway.ts` direct Socket use | Remains peer gateway behavior using M05 connection methods |
| Message validation and transformations | `PeerMessageService` | Deferred business responsibility; unchanged |
| Task/resource-selection validation, persistence, forwarding and snapshots | `peer-gateway.ts` | Deferred business responsibility; unchanged |
| PServer integration | PServer protocol and peer gateway capability | Unchanged; peer gateway still registers the PServer transport and receives inbound protocol messages |

## 3. Source Structure

```text
src/
├── infrastructure/socket/
│   ├── socket-gateway.ts             # M05 server, namespaces, CORS, channel auth and lifecycle
│   ├── socket-peer-gateway.ts        # M05 /peers auth and physical connection capabilities
│   ├── socket-server.ts              # attachSocketServer compatibility facade
│   ├── socket-outbound-adapter.ts    # broadcast adapter, unchanged
│   └── peer-gateway.ts               # remaining peer message/workflow orchestration
└── modules/peer-messaging/
    └── peer-directory.ts             # M06 logical peer and instance identity
```

## 4. Public Interfaces

M06 exports:

- `PeerDirectory` with `register`, `remove`, `lookup`, `lookupConnection`, `listInstances`, `has` and `presenceSnapshot`;
- `PeerIdentity`, an immutable identity record containing peer ID, connection ID and optional instance ID;
- `DuplicatePeerIdentityError` for identity conflicts.

M05 exposes internal consumer-facing `PeerSocketConnection` capabilities to the peer gateway: logical identity fields, physical `connected` state, `emit`, timeout-bound `emitWithAck`, raw event subscription, disconnect subscription and disconnect. The Socket.IO `Socket` is never returned.

Existing `attachPeerGateway` and `attachSocketServer` entrypoints remain available. `SocketMessageHub` continues to be exported from the existing `socket-server.ts` module for `SocketOutboundAdapter` compatibility.

## 5. Physical and Logical State Ownership

- Socket.IO owns the physical socket instances and IDs. M05 uses `Namespace.sockets.get(connectionId)` rather than maintaining another physical socket map.
- M05 owns physical server/namespace lifecycle, authentication and transport behavior. Its connection adapter provides only the methods required by the peer gateway.
- M06 owns logical peer identity. Its maps contain identity records only and have no Socket.IO import or socket object.
- The peer gateway owns the per-application directory instance and workflow state. `attachPeerGateway` creates a fresh directory each time, so identity state is isolated per application.
- On disconnect, M05 asks M06 to remove the exact identity/connection pair. M06 removes only if that connection ID is still current for the identity.

## 6. Dependency Direction

The compatibility `attachSocketServer` entrypoint delegates to M05 `createSocketGateway`. M05 composes the peer gateway when `ENABLE_TEST_PEERS` is enabled. The peer gateway creates M06 and passes it to the M05 peer-namespace adapter. The adapter uses the M06 capability for registration, lookup and removal. M06 imports peer identity types only and remains transport-independent.

The peer gateway uses M06 to select logical identities and M05 to resolve/deliver to physical connections. M06 does not decide message destinations or transformation policy. No circular imports were introduced.

## 7. Preserved External Contracts

- `/session`, `/worker` and `/peers` namespaces remain available.
- CORS origin, 1,000,000-byte Socket.IO buffer limit, API-key checks, peer identity auth, `ENABLE_TEST_PEERS` behavior and default EServer instance ID remain unchanged.
- EServers remain multi-instance; SServer and AAUI remain single-connection peers. Duplicate registration is rejected with the existing messages.
- `peer:ping`, `aab:welcome`, presence event and snapshot payloads, and refresh events remain unchanged.
- Destination selection, EServer ambiguity errors, peer message ACK timeout of 5,000 ms, and optional ACK callback behavior remain unchanged.
- PServer protocol transport registration and inbound message handling remain unchanged.
- F03/F04 presence and VM flows, F08/F09 task receipt/result flows, task snapshots and resource-selection snapshots and refresh behavior remain in the existing peer gateway.
- Async snapshot reads verify both that the connection remains active and that its connection ID is still the current AAUI identity before sending either success or fallback snapshots.

## 8. Remaining Peer-Gateway Responsibilities

`peer-gateway.ts` still owns messaging and workflow policy that is outside M05/M06: destination selection, ambiguity handling, `PeerMessageService` integration, task and task-result validation/persistence/forwarding, resource-selection validation/persistence/forwarding, AAUI lifecycle events and disk-backed snapshots. M05 and M06 do not own those workflows.

## 9. Changed Files

- `src/modules/peer-messaging/peer-directory.ts`
- `src/infrastructure/socket/socket-peer-gateway.ts`
- `src/infrastructure/socket/socket-gateway.ts`
- `src/infrastructure/socket/socket-server.ts`
- `src/infrastructure/socket/peer-gateway.ts`
- `tests/peer-directory.test.ts`
- `R6_2_B_SOCKET_PEER_IDENTITY_REPORT.md`

## 10. Verification Results

All commands used Node.js 22.23.5.

| Verification | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 55 tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |
| Focused directory, peer connection, presence, multi-instance and PServer protocol tests | PASS — 15 tests, 0 failures |

The 83 existing backend and playground tests remain passing; four directory tests were added, bringing the total to 87. Existing workflows remain covered by the integration suite, including peer connections, duplicate instances, EServer multi-instance ambiguity/targeted delivery, presence snapshots, PServer messaging, task flows and resource-selection flows.

Integration tests require local listeners; the sandbox denied local binding in an isolated run, so the full requested checks were run with local-bind permission.

## 11. Technical Debt and R6.2.C Readiness

- The peer gateway still combines generic peer-message delivery with task and resource-selection orchestration; those responsibilities remain intentionally deferred.
- M05 connection wrappers use a generic event interface because Socket.IO's event map is dynamically defined. Future protocol-specific event typing can be handled without exposing Socket objects.
- Peer protocol and workflow diagnostics still use direct console calls.

**Ready for R6.2.C.** M05 and M06 now have explicit ownership, no duplicate Socket object maps remain, identity state is transport-independent and per application, and all requested regression suites pass. R6.2.C and later phases were not implemented.
