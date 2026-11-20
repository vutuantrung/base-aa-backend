# R6.2.A — PServer Transport & Protocol Extraction Report

**Repository:** `base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68`  
**Implementation baseline:** `4e50644880ff362d99764ee28ce54fca85d79552`  
**Verification runtime:** Node.js 22.23.5

## 1. Executive Summary

The PServer connector is split into M03 transport and M04 protocol boundaries. The Socket.IO client and its options now live in `pserver-transport.ts`; session registration, resumption, readiness, protocol event interpretation, task validation and peer-message ACK handling live in `pserver-protocol.ts`. `connectToPServer` remains the compatibility composition facade.

The transport exposes a small capability interface and never exposes the Socket.IO client. The protocol depends on that interface and a narrow gateway capability. Existing public config/event imports, connector methods, application connector property, Socket.IO behavior, protocol events, payloads and timeout durations are retained. No gateway business behavior or protocol retry policy was added.

## 2. Before/After Responsibility Mapping

| Existing responsibility | Before | Owner after extraction |
|---|---|---|
| Socket.IO client creation | `pserver-connector.ts` | M03 `createPServerTransport` |
| `/ws` default path, default namespace, websocket/polling options | Connector inline options | M03 transport |
| `peerId: aab` authentication and optional token | Connector inline options | M03 transport |
| Reconnection mechanics | Socket.IO client defaults configured by connector | M03 transport (`reconnection: true`) |
| Physical connection state and connect/close | Connector methods and socket client | M03 transport |
| Raw event subscriptions and ACK event transmission | Connector directly used client | M03 capability (`on`, `emitWithAck`) |
| Session registration event and VM payload | Connector | M04 protocol |
| Session ID ownership and resumption request | Connector closure state | M04 protocol |
| Session readiness, including reset on connect/disconnect | Connector closure state | M04 protocol |
| Registration ACK interpretation and 10-second timeout behavior | Connector callback | M04 protocol, using M03 ACK capability |
| Dispatch event and session/VM validation | Connector event handler | M04 protocol |
| PServer inbound peer message and optional ACK delivery | Connector event handler | M04 protocol, through gateway capability |
| Outbound PServer peer message and 5-second ACK behavior | Connector registered a gateway transport | M04 protocol over M03 |
| Gateway registration and facade construction | Connector call-site wiring | Composition in `connectToPServer` / protocol initialization |
| Business message validation, routing and persistence | Peer gateway | Remains peer gateway; not moved |

The mock PServer continues to validate `peerId: aab`, accept initial VM registration, and return the same session ID for a resumption request. Existing PServer integration tests continue to exercise its `/ws` server path and message exchange.

## 3. Source Structure

```text
src/
├── infrastructure/socket/
│   ├── pserver-transport.ts       # M03 Socket.IO mechanics and capability
│   └── pserver-connector.ts       # compatibility facade, config and event re-exports
├── modules/pserver/
│   └── pserver-protocol.ts        # M04 session and PServer protocol behavior
└── infrastructure/socket/peer-gateway.ts
                                    # existing business routing and persistence
```

## 4. Transport and Protocol Interfaces

M03 exports `PServerTransport` with:

- `connected` for physical Socket.IO connection state;
- `on(event, handler)` for raw event subscription;
- `emitWithAck(event, payload, timeoutMs)` for timeout-bound event transmission;
- `connect()` and `close()` for transport lifecycle.

M04 exports `createPServerProtocol(config, transport, gateway)`. Its gateway capability only requires registration of an outbound PServer peer transport and `receiveFromPServer(value)` for inbound messages. The protocol does not import `socket.io-client` or the concrete peer gateway.

The existing connector module keeps `VmInfo`, `PServerConnectionConfig`, `SESSION_CONNECT_EVENT` and `DISPATCH_EVENT` available, and `connectToPServer(config, gateway)` composes M03 with M04.

## 5. State Ownership

- M03 owns the Socket.IO client instance and physical connected state.
- M04 owns `sessionId` and `sessionReady`. Physical connection does not imply protocol readiness. Readiness clears on every connect before registration and on disconnect; the session ID remains available for the next reconnect registration.
- The peer gateway remains owner of business routing, domain message processing and task/resource persistence. It receives only the outbound transport capability and remains the receiver for inbound protocol messages.

## 6. Dependency Direction

`create-app` → connector facade → M03 transport and M04 protocol. M04 depends on the M03 capability and peer-message contracts plus a consumer-driven gateway interface. M03 depends on `socket.io-client` and has no session or business-message dependencies. The concrete gateway satisfies the M04 capability structurally; the protocol no longer imports `peer-gateway.ts`. No circular dependency is introduced.

## 7. Preserved External Contracts

- `connectToPServer` remains exported from its existing module and returns `connect`, `close`, `connected` and `sessionId`.
- `ApplicationInstance.pserverConnector` remains based on `ReturnType<typeof connectToPServer>`.
- Existing `VmInfo`, `PServerConnectionConfig` and event constant imports remain compatible.
- Socket.IO still uses the default namespace, `/ws` default path, `websocket` and `polling`, `peerId: 'aab'`, optional token auth, `autoConnect: false` and reconnection enabled.
- Session event and payload remain `automation_vm:session:connect`, initial VM info and subsequent `{ session_id }` resumption.
- Session ACK timeout remains 10,000 ms; outbound `peer:message` ACK timeout remains 5,000 ms.
- Task dispatch and peer-message event names, payload interpretation, optional ACK behavior, gateway delivery, and registration response behavior remain unchanged.
- Connector diagnostics omit `apiKey`; protocol logs do not include credentials.

## 8. Changed Files

- `src/infrastructure/socket/pserver-connector.ts`
- `src/infrastructure/socket/pserver-transport.ts`
- `src/modules/pserver/pserver-protocol.ts`
- `tests/pserver-protocol.test.ts`
- `R6_2_A_PSERVER_COMMUNICATION_REPORT.md`

Focused tests cover the fake-transport boundary, physical-connected/session-not-ready state, initial registration, session resumption after reconnect, readiness reset on disconnect, dispatch validation, and inbound peer-message delivery with ACK. Existing integration tests continue to cover real Socket.IO registration and message delivery.

## 9. Verification Results

All checks used Node.js 22.23.5.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 51 backend tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |
| Focused protocol test and real PServer session integration | PASS |

The 80 existing backend and playground tests remain passing; three focused protocol tests were added, for 83 total test cases across the two suites. Integration tests require local listeners; the sandbox denied local bind in an isolated attempt, so the requested suites were run with local-bind permission.

## 10. Remaining Technical Debt

- PServer protocol diagnostics still write directly to `console`; a diagnostics capability can be considered in a later observability phase.
- The mock PServer validates the agreed session resumption behavior, but it does not establish production PServer compatibility beyond the tested protocol surface.
- `pserver-connector.ts` remains an infrastructure compatibility facade. Existing imports can continue using it while future callers adopt the M03/M04 boundaries directly where appropriate.

## 11. R6.2.B Readiness

**Ready for R6.2.B.** M03 and M04 are separated, state ownership is explicit, compatibility contracts are preserved, the gateway dependency is narrow and consumer-driven, and all requested regression suites pass. R6.2.B and R6.2.C are not included in this change.
