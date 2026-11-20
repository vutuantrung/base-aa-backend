# R6.3.A — Generic Messaging Boundary Extraction

Repository: `vutuantrung/base-aa-backend`
Branch: `main`
Architecture baseline: `82b6cb68e2016594d42731c2ae022ce43b638557`
Implementation baseline: `ced7044f91b2d7ffb84956eb66cb441a04cc62b3`

## Objective

Establish M09 Generic Messaging as an explicit, cohesive application boundary. R6.0, R6.1 and R6.2.A–C are completed. This is breadth-first boundary extraction, not a redesign. Do not implement M10/M11 or business workflow extraction. Existing M09 components already exist; retain sound boundaries rather than moving files or inventing abstractions for their own sake.

## 1. Baseline and responsibility audit

Verify branch, HEAD and working tree; preserve user changes. Read AGENTS.md, R6.2.C report and available architecture decisions. If R0–R5 documents are absent, record that limitation and use the constraints below; do not invent decisions.

Inspect actual consumers of:
- `src/modules/messaging/{messaging,message-router,route-registry}.ts`
- `src/shared/contracts/message.ts`, `src/shared/transport/message-bus.ts`
- `src/infrastructure/http/http-outbound-adapter.ts`
- `src/infrastructure/socket/socket-outbound-adapter.ts`
- HTTP API router, Socket Gateway, integration clients and `src/app/create-app.ts`
- Routing, forwarding, integration and webhook tests.

Map publishing, envelope construction, route registration/resolution, dispatch planning, delivery execution and technical adapters to their actual owners. Distinguish active runtime components from reusable APIs and unused code.

## 2. Establish M09 boundary

- Preserve `SendMessage` as the transport-neutral application entrypoint.
- Clarify the responsibilities of `MessageRouter` and `RouteRegistry`. Routing owns destination selection, not network I/O.
- Make envelope construction and dispatch planning intent-revealing where warranted. Preserve ID generation, timestamps, payload, correlationId and current origin semantics.
- Keep the complete adapter-availability validation before any delivery begins. Preserve concurrent delivery, deduplication, exact/wildcard matching, insertion ordering, default routes, empty destination behavior, error semantics and per-instance route state.
- Keep route registry as sole mutable route owner. Do not add parallel registries or new configuration semantics.
- Use narrow consumer-driven contracts where useful. M09 must not depend on Express, Socket.IO, fetch-based adapters, peer gateway, task workflows or persistence implementations.
- Keep existing public types, constructor signatures, methods and imports compatible, including `ApplicationConfig.routes`, `ApplicationInstance.router`, `routes`, `sender` and synchronous `createApplication` overloads.
- Do not impose unnecessary classes, interfaces, barrel files or folder moves. Explain if existing code already satisfies any boundary requirements.

## 3. Outbound delivery wiring

`HttpOutboundAdapter` and `SocketOutboundAdapter` implement M09 delivery capabilities but remain technical infrastructure implementations. Preserve their public import paths and runtime composition. Keep trusted endpoint IDs, HTTP(S) URL validation, headers, request body, timeout, redirect rejection and failure behavior. Socket delivery remains broadcast-only and never re-enters the router.

M08 `HttpMessageClient` and `SocketMessageClient` submit messages to AAB's inbound API; they are not routed outbound adapters. Do not merge or activate those clients in runtime composition.

Keep M07 HTTP and M05 socket entrypoints compatible. Adapt only necessary narrow sender dependencies and wiring; no namespace, authentication, HTTP response or ACK changes. Preserve `/api/messages`, `/session`, `/worker`, and SQLite-independent messaging.

## 4. MessageBus disposition

Audit all source, tests, exports and documentation consumers of `MessageBus`. Previous report found no active consumer. It is a separate local fanout implementation, not the runtime MessageRouter. Record its actual status and recommended ownership/disposition. Keep its existing import and behavior in this checkpoint; do not wire it in, merge it with MessageRouter, remove it, or introduce another message pipeline. Any removal or semantic consolidation requires a later explicit decision.

## 5. Verification

Use Node.js 22 (previous runtime 22.23.5). Preserve all 93 baseline tests (61 backend, 32 playground) and meaningful assertions. Add focused tests where missing for:
- Transport-independent publishing with fake adapters.
- Exact and wildcard route resolution, deduplication and isolated registry state.
- Dispatch preflight rejects missing adapters before any side effects.
- Duplicate adapter rejection, zero destinations and existing delivery failure behavior; no claim of transactional delivery.
- HTTP/webhook and socket broadcast compatibility, no outbound re-publication.
- Envelope shape and correlation ID preservation.

Run `npm run typecheck`, `npm run build`, `npm test -- --test-concurrency=1`, `npm --prefix testing run test:playground`. Report actual results and any environment blockers. Use local test servers only; no production services. Do not weaken tests or count focused reruns twice.

## Constraints and deferred work

Follow AGENTS.md, intent-revealing methods, natural TypeScript inference, single state ownership, consumer-driven ports and acyclic runtime dependencies. No new features, dependencies, schemas, retry policies, durable delivery, queue, event bus activation, ACK correction, peer routing changes, automatic .env loading, ARM changes or unrelated cleanup. Keep R7.1 dependency enforcement, R7.2 stale handshake/registration ACK validation, R7.5 ACK semantics and R7.6 graceful drain deferred. Do not change M10–M16.

## Deliverable

Create `R6_3_A_GENERIC_MESSAGING_REPORT.md` with:
1. Verified baseline and executive summary.
2. Before/after responsibility mapping and source structure.
3. M09 public contracts and state ownership.
4. Dependency direction and actual runtime composition.
5. Message lifecycle and dispatch semantics, including failure behavior.
6. Adapter integration and compatibility verification.
7. MessageBus consumer audit and disposition.
8. Changed files and test results (baseline/new totals).
9. Remaining technical debt and R6.3.B readiness.

Stop after R6.3.A. Do not commit or push. Do not mark later modules extracted.
