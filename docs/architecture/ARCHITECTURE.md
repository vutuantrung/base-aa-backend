# AS — System architecture at R6.4.E

> **Current runtime overlay:** The R6.4.E material that follows is retained as historical architecture evidence, not current service naming or deployment status. Current source uses AS, CDC, EServer, SPA, and standalone AA. AS accepts enabled peers on `/peers` and connects as a Socket.IO client to CDC on Engine.IO path `/ws`, namespace `/`; CDC serves that connection. Current identities are `as`, `cdc`, `eserver`, `spa`, and `aa`; EServer instances use separate deployment identities. AS emits `as:welcome`. Generic `/session`, `/worker`, `peer:message`, and `peer:ping` names remain unchanged. See [current Socket.IO inventory](SOCKET_IO_HOSTS_NAMESPACES_EVENTS_INVENTORY.md), [Naming Migration closure](../../NAMING_MIGRATION_CLOSURE.md), and [PROJECT_STATE](PROJECT_STATE.md). The remaining R6.4.E descriptions and R6/R7 decisions below are historical and are not rewritten.

Prepared from R0–R8 conversation handoff and R6 implementation evidence. Design targets are not guarantees of current conformance. See PROJECT_STATE for baseline and evidence status.

## System and runtime
TypeScript/ESM/NodeNext, Express, Socket.IO, optional better-sqlite3, native node:test + tsx. Modular monolith message router/integration hub. AAB default :3000; PServer mock :3001 (AAB outbound client, Engine.IO path `/ws`, root namespace); EServer mock :3002 and additional instances, SServer :3003, AAUI Electron :3004, all named inbound peers on `/peers`. Generic clients use `/session` and `/worker`. External HTTP clients and configured HTTP webhook endpoints are separate actors. Mock ports are examples, not production configuration.

`main.ts` resolves M01 config and invokes M02 lifecycle; `create-app.ts` composes one app-local registry/router, optional M17 DB and domain repositories, HTTP and socket servers. `ENABLE_TEST_PEERS=1` gates named-peer runtime and demo transform in standalone mode; PServer only connects when configured and peer gateway exists. SQLite standalone opt-in (`ENABLE_SQLITE=1`), programmatic default enabled. Native driver loads lazily; `.env` is not automatically loaded. Health is not aggregate readiness. Build entry `dist/src/main.js`.

## Communication models
- GM (M09): HTTP `/api/messages` + generic socket ingress, channel/event rules, deduplicated destinations, socket broadcast or configured HTTP POST, concurrent best-effort fan-out. No peer identity or per-client ACK guarantee.
- PM (M10/M11): authenticated sender/recipient, optional EServer instance target, strict envelope v1.0, transformation then targeted delivery. AAB local destination supported. PServer readiness separate from transport connectivity. M06 owns logical identities; M05 physical inbound sockets; M03 outbound PServer socket.
- Direct PServer protocol (M04): registration/resume, session ID/readiness, dispatch validation; not GM or PM. Separate transport and protocol. Direct peer events: presence, ping/welcome, snapshots and workflow notifications; not GM fan-out.
- Direct HTTP (M07): session, usage, read-only AA catalog and health. Authentication before SQLite-disabled gate. See `../HTTP_API_DESIGN.md`.

## Workflow invariants
F03 SServer status and F04 EServer VM info forwarded to AAUI through existing PM paths. F08 PServer task request: validate, capture EServer target, persist, notify receipt, ACK received, defer forwarding; unresolved/offline target fails later. F09 EServer result: validate correlation with stored request, persist result, ACK received, defer PServer delivery using authenticated source instance. M12 history prefers finished results. M13 selection: validate, save normalized receipt, emit pending record, capture distinct message ID, ACK original parsed payload, defer M10 processing, independently persist delivery outcome and publish update. Status write failure does not reclassify delivery. Both snapshot adapters guard original current/connected AAUI around async reads. Receipt is write completion, not fsync or downstream ACK; no durable forwarding queue. Catalog ExtensionTask is not M12 task; generic session is not M04 session or GM channel; catalog AaConnection is not live peer identity.

## Roadmap
R0–R5: System Context, Responsibility Discovery, L2 Decomposition, Module Boundaries, Dependency/State, Public Contracts. R6: extraction and behavior preservation (R6.0, R6.1, R6.2 A–C, R6.3 A–C, R6.4 A–E); closure accepted. R7.1.0 dependency inventory is audit-only; R7.1.A implementation awaits review/authorization. R7:
| Step | Scope |
|---|---|
| R7.1 | Dependency direction / contract ownership |
| R7.2 | Connection and session state |
| R7.3 | Messaging contracts / related API consistency review |
| R7.4 | Explicit inbound operation dispatch |
| R7.5 | Business persistence, receipt/delivery semantics |
| R7.6 | Lifecycle, readiness and bounded shutdown |
| R7.7 | Test organization and independence |
| R7.8 | Demo extraction |
| R7.9 | Application runtime cleanup, preserve TBD behavior |
R8.1–5: architecture conformance, external compatibility, runtime reliability, environment isolation, final review/documentation. Earlier E1–E6 suspended; no experimental branch merge. R7 changes must be scoped and explicitly approved; decisions are in ARCHITECTURE_DECISIONS.

## Detailed references (on demand)
`../CDC_SESSION_PROTOCOL.md`, `../MULTIPLE_ESERVERS.md`, `../PEER_MESSAGE_TRANSFORMATION.md`, `../PHASE_2_MESSAGE_ROUTING.md`, `../DEMO_CDC_AA.md`, `../HTTP_API_DESIGN.md`. Existing R6/R7 reports remain historical evidence. Dynamic event library discussion in `../upcomming-features/AS_DYNAMIC_EVENT_LIBRARY_HANDOFF.md` is deferred.
