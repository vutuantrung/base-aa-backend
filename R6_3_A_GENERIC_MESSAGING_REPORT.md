# R6.3.A — Generic Messaging Boundary Report

**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Implementation baseline:** `ced7044f91b2d7ffb84956eb66cb441a04cc62b3`  
**Verification runtime:** Node.js 22.23.5

## 1. Verified Baseline and Summary

- Verified branch `main` and `HEAD` `ced7044f91b2d7ffb84956eb66cb441a04cc62b3`.
- At task start, the only working-tree item was the untracked `prompts/R6_3_A_GENERIC_MESSAGING_CODEX_PROMPT.md`; it was preserved.
- Read `AGENTS.md`, `R6_2_C_HTTP_INTEGRATION_CLIENTS_REPORT.md`, and the repository architecture/structure notes. The R0–R5 decision documents were absent, so no decisions were inferred from missing documents.
- M09 already had the appropriate core owners and runtime wiring. This checkpoint retains their locations, public paths, route semantics and adapter responsibilities. It adds intent-revealing envelope and dispatch planning methods, a narrow sender capability for socket ingress, and focused routing tests.
- No M10/M11 or workflow extraction, message pipeline activation, API/protocol change, dependency, or schema change was made.

## 2. Responsibility Mapping and Source Structure

| Responsibility | Before | After |
|---|---|---|
| Transport-neutral application send entrypoint | `modules/messaging/messaging.ts` (`SendMessage`) | Same; implements the narrow `MessageSender` capability used by ingress adapters |
| Envelope construction and route-based dispatch | `modules/messaging/message-router.ts` (`MessageRouter.publish`) inline | Same owner; `createEnvelope` and `planDispatch` make the lifecycle explicit |
| Route registration, mutation, resolution and defaults | `modules/messaging/route-registry.ts` (`RouteRegistry`) | Same sole mutable route owner |
| Delivery capability | `OutboundTransportAdapter` in `message-router.ts` | Same structural adapter contract; no HTTP, Socket.IO or peer-gateway dependency |
| Trusted webhook delivery | `infrastructure/http/http-outbound-adapter.ts` | Same technical M09 adapter and import path |
| Socket broadcast delivery | `infrastructure/socket/socket-outbound-adapter.ts` | Same technical M09 adapter and import path; broadcast only |
| M07 HTTP ingress | `http-api-router.ts` and `http-server.ts` | Same; narrow HTTP sender contract retained |
| M05 socket ingress | `socket-gateway.ts`, composed through `socket-server.ts` | Same entrypoints and behavior; now depend on `MessageSender` rather than concrete `SendMessage` |
| Runtime assembly and public app handles | `app/create-app.ts` | Same; route config, `router`, `routes`, `sender`, overloads and composition retained |
| Local in-process fanout | `shared/transport/message-bus.ts` | Unchanged, separate and unused by runtime; disposition recorded below |

No source files were moved. Current relevant structure:

```text
src/
├── app/create-app.ts                         # composition root; exposes router/routes/sender
├── modules/messaging/
│   ├── messaging.ts                          # SendMessage + MessageSender
│   ├── message-router.ts                     # envelope + dispatch + adapter capability
│   └── route-registry.ts                     # route state, registration and resolution
├── shared/contracts/message.ts               # Channel, envelope, input, publisher/consumer
├── shared/transport/message-bus.ts            # separate local fanout implementation
└── infrastructure/
    ├── http/http-outbound-adapter.ts           # trusted webhook delivery
    └── socket/socket-outbound-adapter.ts       # Socket.IO hub broadcast
```

## 3. M09 Contracts and State Ownership

- `SendMessage.execute(NewMessage)` remains the transport-neutral application entrypoint. Its publisher is the shared `MessagePublisher` capability; it does not know about HTTP, Socket.IO, persistence or workflows.
- `MessageSender` describes only the `execute` capability required by ingress. Socket HTTP-server and gateway functions consume this contract; existing `SendMessage` values remain structurally compatible. The existing HTTP-facing sender contract is likewise narrow.
- `MessageRouter` implements `MessagePublisher`. It constructs the envelope, asks the registry to resolve destinations, validates the entire adapter plan, then invokes delivery. It does not own route state or perform network I/O.
- `RouteRegistry` remains the sole mutable route owner. Its state is per instance; `register`, `unregister`, `list`, `resolve`, and `defaultRoutes` retain their signatures and behavior.
- `OutboundTransportAdapter` exposes only a transport discriminator and `deliver(envelope, destination)`. HTTP and Socket.IO implementations remain infrastructure details supplied by the composition root.
- Shared contracts contain only channel/message shapes and generic publisher/consumer capabilities. M09 has no dependency on Express, Socket.IO, fetch adapters, peer gateways, task workflows or persistence implementations.

Public compatibility retained: `ApplicationConfig.routes`, `ApplicationInstance.router`, `routes` and `sender`; synchronous `createApplication` overloads; existing constructors, methods and module import paths; HTTP `/api/messages`; Socket.IO `/session` and `/worker`.

## 4. Dependency Direction and Runtime Composition

The runtime composition in `createApplication` creates one registry, one `SendMessage`, one `MessageRouter`, and the HTTP and socket adapters. `SendMessage` delegates to the router through `MessagePublisher`. HTTP and socket ingress invoke the sender. The router resolves using the registry and calls only the selected adapter's `deliver` method. Adapters do not route messages back into the router.

`createApplication` continues to expose the same route registry and router instances. `ApplicationConfig.routes` initializes that instance; there is no second registry, copied route configuration layer or new configuration semantic. The established late-bound closure still handles construction order between inbound servers and router wiring.

The HTTP and Socket.IO outbound adapters remain infrastructure implementations of an M09 delivery capability, with their original paths and runtime composition. The M08 `HttpMessageClient` and `SocketMessageClient` are reusable clients to AAB's inbound endpoints, used by tests and not constructed in application runtime composition.

## 5. Message Lifecycle and Dispatch Semantics

1. HTTP or socket ingress validates its existing boundary payload and calls `SendMessage.execute`.
2. `SendMessage` delegates the `NewMessage` to `MessageRouter.publish`.
3. `MessageRouter.createEnvelope` generates a UUID and ISO timestamp and carries the input channel, event, payload and optional `correlationId`. `NewMessage` does not accept `origin`, as before; no origin is introduced or rewritten.
4. `MessageRouter.planDispatch` resolves routes and checks every destination's adapter before the first delivery starts. A missing adapter rejects with `Missing adapter for transport: <transport>` and no delivery side effects.
5. `RouteRegistry.resolve` matches exact event names and `'*'`, retains registration and destination insertion order, deduplicates destinations by transport plus channel/endpoint ID, and allows zero destinations. Default session/worker routes are unchanged.
6. Planned deliveries run concurrently with `Promise.all`, sharing the same envelope. Duplicate adapter transports are rejected during router construction. A delivery failure rejects `publish`; already-started siblings may have delivered, so delivery is not transactional. No retries or durable delivery are claimed.

Focused tests cover exact/wildcard matching, deduplication and order, per-instance registry state, complete adapter preflight, duplicate adapter rejection, zero destinations, failure after concurrent starts, envelope shape and correlation ID. Existing integration cases cover HTTP and socket ingress, webhook delivery, socket broadcast and shared message identity. Socket outbound delivery only broadcasts through the hub and does not re-publish.

## 6. Adapter Integration and Compatibility

- `HttpOutboundAdapter` remains allowlist-based: routes select trusted endpoint IDs, never client-provided URLs. HTTP(S) validation, headers, serialized envelope body, 5,000 ms default timeout, redirect rejection and non-success response errors are unchanged.
- `SocketOutboundAdapter` remains broadcast-only via `SocketMessageHub`; it does not call the sender or router.
- M07 HTTP API/router and M05 socket gateway/server retain their paths, response/ACK behavior, authentication and namespace behavior. Only the socket sender dependency was narrowed structurally.
- `/api/messages` remains available when SQLite is disabled. The existing test verifies this compatibility.
- The integration HTTP and socket clients remain separate M08 components and are not merged into or activated as outbound routed adapters.

## 7. MessageBus Audit and Disposition

`rg` audit found `MessageBus` implemented/exported from `src/shared/transport/message-bus.ts`; there are no source or test imports/instances, no barrel export, and no runtime composition use. The R6.2.A structure document inventories the file, and the R6.2.C report and supplied checkpoint prompt describe its unused status; these are documentation references, not consumers. The class is a separate in-process local fanout publisher/consumer with per-channel handler sets, its own envelope generation, concurrent handler invocation and unsubscribe closures. It is not the runtime `MessageRouter` and has no route/delivery adapter semantics.

Recommended disposition: retain it as a separate shared local fanout API until an explicit later decision identifies ownership and whether it remains useful. This checkpoint preserves its import path and behavior; it neither wires it into runtime nor merges/removes it or creates another pipeline.

## 8. Changed Files and Verification

Changed files:

- `src/modules/messaging/messaging.ts`
- `src/modules/messaging/message-router.ts`
- `src/infrastructure/socket/socket-server.ts`
- `src/infrastructure/socket/socket-gateway.ts`
- `tests/routing.test.ts`
- `R6_3_A_GENERIC_MESSAGING_REPORT.md`

All requested verification ran with Node.js 22.23.5:

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 66 backend tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |

The R6.2.C checkpoint records the 93-test baseline (61 backend and 32 playground). Five focused backend tests were added, giving 98 passing tests across the two suites. The complete backend suite was run once; its 66 count includes existing tests and the five additions, without counting focused reruns. Tests use local test servers; no production services were used. No environment blocker occurred.

## 9. Remaining Debt and R6.3.B Readiness

M09 retains existing synchronous route mutation and best-effort concurrent delivery semantics. Runtime delivery failures can produce partial side effects; durable delivery and retries remain out of scope. `MessageBus` ownership remains a later explicit decision. The HTTP and Socket.IO infrastructure adapters reference M09 structural contracts, which is the intended inward-facing implementation dependency; R7.1 dependency enforcement remains deferred.

R6.3.A is complete. This checkpoint does not claim M10/M11 or any later module extraction. R6.3.B can proceed from the explicit `SendMessage` entrypoint, router/registry ownership, adapter contract, runtime composition and preserved compatibility documented here.
