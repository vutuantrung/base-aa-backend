# R6.2.C — HTTP Gateway & Integration Clients Extraction

Repository: `base-aa-backend`  
Branch: `main`  
Architecture baseline: `82b6cb68e2016594d42731c2ae022ce43b638557`  
Implementation baseline: `15bfa1a883757fba85fea11e53d674335aede635`

## Objective

Complete Communication & Identity boundary extraction by establishing M07 (HTTP Gateway) and M08 (Integration Clients). R6.0, R6.1, R6.2.A and R6.2.B are complete. Preserve all 87 baseline tests and existing application behavior. This is boundary extraction, not a new feature or protocol redesign.

## 1. Scope and responsibility audit

Verify HEAD and working tree; preserve unrelated changes. Read AGENTS.md, the R6.2.B report, and the confirmed R0–R5 decisions available in the project context. Inspect:

- `src/infrastructure/http/http-server.ts`, `aa-catalog-router.ts`, `http-outbound-adapter.ts`
- `src/shared/transport/connectable-client.ts`, `message-bus.ts`
- `src/infrastructure/socket/socket-outbound-adapter.ts`
- `src/app/create-app.ts`, `src/modules/messaging/` and affected repository contracts
- Existing HTTP, routing, forwarding, integration and catalog tests.

Inventory actual consumers of each integration client. Distinguish runtime wiring, reusable client APIs, and unused capabilities; do not activate currently unused code merely to establish a boundary. Map responsibilities to M07, M08 or deferred modules before editing.

## 2. M07 — HTTP Gateway

Establish an explicit inbound HTTP boundary. Preserve `createHttpApp` call-site and import compatibility. Separate Express setup, authentication middleware, feature availability checks, error handling and route registration from application operations using small, intent-revealing functions or route adapters where useful. Keep request/response translation and validation at the HTTP boundary. Depend on narrow consumer-facing capabilities rather than concrete application services where feasible. Keep domain rules and persistence outside the HTTP boundary; do not extract new domain use cases in this checkpoint.

Preserve the exact existing behavior of:

- `/health`, `/api/messages`, `/api/sessions`, `/api/sessions/:id`, `/api/process-usage`, `/api/aa`, `/api/browser/all`, `/api/browser/:id`, `/api/extension/:id` and extension activities/tasks routes.
- API-key checks and middleware order (authenticate before SQLite availability response), public health endpoint, SQLite-disabled 503 `SQLITE_DISABLED` behavior and existing route matching.
- JSON body limit, X-Powered-By setting, request validation, response bodies, status codes, error mapping and route ordering (`/browser/all` before parameterized route).
- Programmatic `createApplication()` overloads and SQLite defaults; no schema or repository behavior changes.

Do not redesign APIs, fix unrelated HTTP semantics, add dependencies or move business repositories into HTTP modules.

## 3. M08 — Integration Clients

Establish explicit ownership for reusable outbound integration client implementations. Audit `ConnectableMessageClient`, `HttpMessageClient`, `SocketMessageClient`, and the HTTP outbound webhook adapter. Separate transport-neutral contracts from technology-specific implementations where it reduces coupling. Keep old import paths as compatibility exports when required. Preserve client send/close behavior, connection reuse, authentication, error and timeout semantics exactly. Do not infer new retry or reconnect policies.

Distinguish integration clients from M09 routing adapters: the router decides destinations; outbound adapters deliver to those destinations. If a technical HTTP sending capability is extracted from `HttpOutboundAdapter`, preserve its existing adapter interface, endpoint-ID allowlist, URL scheme validation, headers, 5,000-ms default timeout, redirect rejection, and error behavior. Never allow inbound payloads to choose raw webhook URLs. Do not combine outbound webhook delivery with the HTTP client calling AAB's own `/api/messages` if their semantics differ. Keep `SocketOutboundAdapter` broadcast behavior under its existing integration with M05/M09; do not re-enter the router on outbound delivery. M03/M04 PServer transport and protocol stay unchanged. `MessageBus` remains transport-neutral and is not an integration client; do not move or activate it as part of M08 without concrete evidence.

## 4. Composition and compatibility

Update only necessary imports and composition wiring. Preserve synchronous creation, feature gating, lifecycle ordering, public method signatures and structural contracts. Avoid duplicate state, unnecessary abstraction layers, speculative clients and circular imports. Keep diagnostics credential-safe. Do not introduce a framework or generic transport factory just for uniformity.

## 5. Carry-forward findings (report, do not fix here)

R6.2.B registers identities inside Socket.IO middleware before the connection callback; assess the potential for an aborted handshake to leave a stale registration. No failure has been established by source review alone. Record a targeted reproduction or proposed test for R7.2, without changing peer lifecycle behavior in R6.2.C. Also retain the existing deferred concerns about protocol stale ACKs, type-only dependency placement, optional ACK processing, automatic .env loading, Node 24 compatibility and graceful drain. Do not change M05/M06 or peer workflows to solve unrelated issues.

## 6. Verification

Use Node.js 22 (baseline verification used 22.23.5); use the committed lockfile and an isolated verification setup where practical. Run:

```sh
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
```

Preserve all 55 backend and 32 playground baseline cases, including meaningful assertions. Add focused tests as needed for HTTP authentication and SQLite gating precedence, route/validation compatibility, HTTP integration client sending/error behavior, Socket.IO client connection reuse/close, outbound webhook trusted endpoint handling and timeout/redirect behavior. Use local mocks rather than production services. Record any test not executed, sandbox or native-binding blocker, and actual test counts. Verify compiled startup and both SQLite modes where affected. Avoid weakening tests or introducing behavior changes to achieve a green suite.

## 7. Acceptance criteria

- M07 and M08 ownership is explicit, with a before/after responsibility mapping justified by actual code and consumers.
- Existing HTTP endpoints and integration client contracts are preserved, including security checks.
- No new dependency cycles or cross-boundary state duplication.
- M01–M06, M17 and M18 remain intact; no extraction of M09–M16.
- All baseline regression tests pass; focused tests demonstrate the extracted boundaries.
- No production behavior, protocol or database changes beyond approved boundary extraction.

## 8. Deliverable

Create `R6_2_C_HTTP_INTEGRATION_CLIENTS_REPORT.md` with executive summary, verified baseline, responsibility mapping, before/after source tree, public interfaces and compatibility exports, dependency direction, actual consumers and runtime wiring, preserved HTTP/client/security behavior, changed files, verification results, remaining debt and R6.3 readiness. Clearly distinguish verified facts from proposed improvements.

Follow AGENTS.md, use intent-revealing methods and natural TypeScript inference. Do not modify ARM, add features, commit, or push. Stop after R6.2.C.
