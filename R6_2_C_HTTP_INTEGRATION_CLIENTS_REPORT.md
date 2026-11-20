# R6.2.C — HTTP Gateway & Integration Clients Report

**Repository:** `base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Implementation baseline / verified HEAD:** `15bfa1a883757fba85fea11e53d674335aede635`  
**Verification runtime:** Node.js 22.23.5

## 1. Executive Summary

M07 now has explicit Express setup, API access/SQLite availability middleware, route registration and error handling boundaries. `createHttpApp` retains its existing import path and call shape. HTTP handlers depend on repository contracts and a narrow message-sender capability; request validation and HTTP response translation remain at the boundary.

M08 now owns reusable `HttpMessageClient` and `SocketMessageClient` implementations under `src/infrastructure/integration-clients/`, with the transport-neutral client contract under `src/shared/transport/`. The previous `shared/transport/connectable-client` import remains a compatibility export. `HttpOutboundAdapter` remains an M09 routing adapter because it delivers to allowlisted webhook endpoint IDs, while the M08 clients submit messages to this app's own API. `MessageBus` remains untouched and unused by runtime composition.

All 87 baseline tests pass, with six focused cases added. Compiled startup was verified with SQLite enabled and disabled.

## 2. Verified Baseline

- `HEAD` was `15bfa1a883757fba85fea11e53d674335aede635` on branch `main`, matching the requested implementation baseline.
- At the start of the task, the only working-tree item was an untracked `prompts/` directory containing the supplied prompt. It was preserved and not modified.
- `AGENTS.md` and the R6.2.B report were read. No additional R0–R5 decision files were present in the repository; architecture constraints in the task and prior phase reports were used as the available confirmed context.

## 3. Responsibility Mapping

| Responsibility | Before | After |
|---|---|---|
| Express app setup, JSON parsing, X-Powered-By setting, health route | `http-server.ts` | M07 `createHttpApp` composition |
| API-key authentication and SQLite feature gate | Inline `/api` middleware in `http-server.ts` | M07 `createApiAccessMiddleware` |
| Session, process-usage and message request parsing/translation | Inline handlers in `http-server.ts` | M07 `createHttpApiRouter` |
| Catalog endpoint translation and route order | `aa-catalog-router.ts` | Remains M07 catalog route adapter; `/browser/all` precedes `/browser/:id` |
| Global HTTP error mapping | Inline error handler in `http-server.ts` | M07 `httpErrorHandler` |
| Session, usage and catalog persistence | Domain repositories passed to HTTP | Remains domain-owned behind repository contracts |
| Calling this app's `/api/messages` over HTTP | `shared/transport/connectable-client.ts` | M08 `HttpMessageClient` |
| Calling this app's `/session` or `/worker` over Socket.IO | `shared/transport/connectable-client.ts` | M08 `SocketMessageClient` |
| Transport-neutral connectable send/close contract | Co-located with implementations | `shared/transport/connectable-message-client.ts` |
| Delivering routed messages to trusted webhook endpoints | `HttpOutboundAdapter` | Remains M09 routing adapter; no generic sender extraction |
| Socket channel broadcast after route selection | `SocketOutboundAdapter` | Remains M09 adapter integrated with M05 |
| Local in-process message fanout | `MessageBus` | Remains transport-neutral and unused by current runtime composition |

## 4. Before/After Source Structure

```text
src/
├── infrastructure/
│   ├── http/
│   │   ├── http-server.ts                 # M07 compatibility composition entrypoint
│   │   ├── http-middleware.ts             # API access, SQLite gate, error mapping
│   │   ├── http-api-router.ts             # sessions, usage and messages routes
│   │   ├── aa-catalog-router.ts           # catalog route adapter
│   │   └── http-outbound-adapter.ts       # M09 trusted webhook routing adapter
│   └── integration-clients/
│       ├── http-message-client.ts         # M08 client to this app's HTTP API
│       └── socket-message-client.ts       # M08 client to this app's Socket.IO API
├── shared/transport/
│   ├── connectable-message-client.ts      # transport-neutral M08 client contract
│   ├── connectable-client.ts              # compatibility re-exports
│   └── message-bus.ts                     # unchanged, transport-neutral and unused
└── infrastructure/socket/
    └── socket-outbound-adapter.ts          # M09 broadcast adapter, unchanged
```

## 5. Public Interfaces and Compatibility Exports

- `createHttpApp(deps): Express` remains exported from `src/infrastructure/http/http-server.ts` with the existing fields: optional sessions/usage/catalog repositories, `sqliteEnabled`, sender and API key.
- `HttpApplicationDependencies` describes the existing composition input; its `sender` is now expressed as the consumer-facing `{ execute(NewMessage): Promise<MessageEnvelope> }` capability.
- `HttpMessageClient` and `SocketMessageClient` retain their constructors, `send` and `close` methods and behavior. They are implemented in M08 modules.
- `ConnectableMessageClient` remains available through the old `src/shared/transport/connectable-client.ts` path, which re-exports the new contract and client implementations. The contract is also directly exported from `connectable-message-client.ts`.
- `HttpOutboundAdapter`, `WebhookEndpoint`, `SocketOutboundAdapter`, `SocketMessageHub`, `MessageBus`, and programmatic `createApplication` contracts are unchanged.

## 6. Dependency Direction

Application composition continues to create repositories and `SendMessage`, then passes them structurally into `createHttpApp`. M07 depends on repository interfaces and an HTTP-facing sender capability; it does not import repository implementations or application composition.

M08 implementations depend on shared message contracts. The compatibility barrel re-exports implementation classes but implementations do not import the barrel, so no runtime cycle is introduced. M09 routing still selects destinations; `HttpOutboundAdapter` and `SocketOutboundAdapter` only deliver. Socket broadcast does not re-enter the router. `MessageBus` is not wired into the application.

## 7. Actual Consumers and Runtime Wiring

- `HttpMessageClient` and `SocketMessageClient` are consumed by `tests/integration.test.ts`. No application runtime or other source module currently constructs them. Their existence is a reusable client API, not active runtime wiring.
- `ConnectableMessageClient` is currently an exported structural contract without another source consumer.
- `HttpOutboundAdapter` is created by `createApplication` and given to `MessageRouter`; webhook destinations come from server-side route configuration and endpoint IDs resolve through its trusted endpoint map.
- `SocketOutboundAdapter` is also created by `createApplication` and broadcasts through the socket message hub selected by the router.
- `MessageBus` has no source or test consumer in current runtime wiring; it was not activated or moved.

## 8. Preserved HTTP, Client and Security Behavior

- The health route remains public. `/api` authentication executes before the SQLite-disabled feature response. SQLite-backed paths still return status 503 with `{ error: 'SQLITE_DISABLED' }` when disabled; `/api/messages` remains available in that mode.
- Existing endpoint paths and response/status behavior remain in the same order. JSON remains limited to `1mb`; X-Powered-By remains disabled; validation, error bodies and error mapping are unchanged. Catalog route ordering keeps `/browser/all` before `/browser/:id`.
- No schema, repository, `createApplication` overload or SQLite default changed.
- HTTP client URL construction, API-key header, status error and no-op close behavior are preserved. Socket client per-channel connection reuse, authentication, 5,000-ms connection and ACK timeouts, negative-ACK error and disconnect/clear close behavior are preserved.
- The webhook adapter still accepts only configured endpoint IDs, validates HTTP(S) URLs during construction, sends the same headers/body, defaults to 5,000 ms, rejects redirects and reports non-success HTTP statuses as before. Client payloads cannot select arbitrary URLs.
- `HttpOutboundAdapter` was not combined with the `/api/messages` client because their routing and security semantics differ.

## 9. Changed Files

- `src/infrastructure/http/http-server.ts`
- `src/infrastructure/http/http-middleware.ts`
- `src/infrastructure/http/http-api-router.ts`
- `src/shared/transport/connectable-message-client.ts`
- `src/shared/transport/connectable-client.ts`
- `src/infrastructure/integration-clients/http-message-client.ts`
- `src/infrastructure/integration-clients/socket-message-client.ts`
- `tests/http-gateway.test.ts`
- `tests/integration-clients.test.ts`
- `tests/http-outbound-adapter.test.ts`
- `R6_2_C_HTTP_INTEGRATION_CLIENTS_REPORT.md`

## 10. Verification Results

All checks used Node.js 22.23.5 and the existing installed dependency set; no dependency or lockfile changes were made.

| Verification | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 61 backend tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |
| Focused HTTP gateway, client, webhook adapter and existing integration tests | PASS — 8 tests, 0 failures |
| Compiled `dist/src/main.js`, SQLite disabled | PASS — server started; timeout stopped it |
| Compiled `dist/src/main.js`, SQLite enabled | PASS — server started with temporary `/tmp` database; timeout stopped it |

The 55 backend and 32 playground baseline cases remain passing; six focused backend tests were added, bringing the current total to 93. The sandbox denied local listener creation during integration verification, so listener-dependent checks ran with local-bind permission. No production services were used.

## 11. Remaining Debt and R6.3 Readiness

**Verified carry-forward observation:** R6.2.B registers a logical identity in Socket.IO namespace middleware before the namespace connection callback. Source inspection alone does not establish that an aborted handshake leaves stale state.

**Proposed R7.2 test:** Add a controlled integration seam that pauses namespace establishment immediately after successful identity registration and before the connection callback. Abort the Engine.IO transport during that pause, then attempt a new connection using the same peer/instance identity. Assert the second handshake can register and the directory contains no stale first connection ID. Do not alter peer lifecycle behavior in R6.2.C based only on source inspection.

Other deferred concerns remain: PServer protocol stale ACK handling; placement of some type-only dependencies; existing optional ACK processing semantics; automatic `.env` loading; Node 24 compatibility; and graceful drain. This checkpoint did not change M03–M06, peer workflows, HTTP APIs, schemas or production protocol behavior.

**Ready for R6.3.** M07 and M08 ownership and compatibility paths are explicit, the 87 baseline tests remain green, focused security/client tests pass, and compiled startup succeeds in both SQLite modes. R6.3 and later phases were not implemented.
