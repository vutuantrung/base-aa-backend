# Dependency inventory — R7.1.0

Audit-only static view of tracked TypeScript in `src/`, NodeNext resolution, source baseline `08614077a92946ac2718ac5a3c5c46d5d30467fe`; R7.1.0 inventory commit `0bae390fa871aa4797c4d0b44f3cf083f84fdc8e`, closure `61742f6ee7519612f6b412574a147429e4ab84f7`, environment verification `534419855148800e14180f45d719f0e3d9252080`. Based on TypeScript compiler API import/export syntax and compiler settings (`verbatimModuleSyntax` is not enabled; explicit `import type` and type-only named imports erase). 109 resolved internal edges; 53 contain runtime value imports/exports, the remainder are type-only. External package imports excluded from internal graph; no unresolved relative paths, dynamic imports, `require`, or side-effect-only imports found in the scanned tracked source. This is a static syntax inventory, not runtime proof. Counts are the prior full-graph inventory; R7.1.A updates only its targeted edges.

## File ownership map

| Owner | Tracked source files |
|---|---|
| M01 | `config/configuration.ts` |
| M02 | `app/create-app.ts`, `app/lifecycle.ts`, `main.ts` |
| M03 | `infrastructure/socket/pserver-transport.ts`; `pserver-connector.ts` is its compatibility/composition facade |
| M04 | `modules/pserver/{contracts,pserver-protocol}.ts` |
| M05 | `infrastructure/socket/{peer-gateway,resource-selection-snapshot,socket-gateway,socket-outbound-adapter,socket-peer-gateway,socket-peer-message-delivery,socket-server,task-history-snapshot}.ts` |
| M06 | `modules/peer-messaging/peer-directory.ts` |
| M07 | `infrastructure/http/{aa-catalog-router,http-api-router,http-middleware,http-outbound-adapter,http-server}.ts` |
| M08 | `infrastructure/integration-clients/{http-message-client,socket-message-client}.ts` |
| M09 | `modules/messaging/{message-router,messaging,route-registry}.ts` |
| M10 | `modules/peer-messaging/{contracts,peer-destination-policy,peer-message-service,transformation-registry}.ts` (transformation registry is logically M11) |
| M11 | `modules/peer-messaging/transformation-registry.ts` (shared physical folder with M10) |
| M12 | `modules/task-workflow/{task-file-store,task-workflow}.ts` |
| M13 | `modules/resource-selection/{resource-selection-store,resource-selection-workflow}.ts` |
| M14 | `modules/session/{contracts,session}.ts` |
| M15 | `modules/process-usage/{contracts,process-usage}.ts` |
| M16 | `modules/aa-catalog/{contracts,sqlite-catalog}.ts` |
| M17 | `infrastructure/database/{persistence,sqlite}.ts` |
| M18 | `observability/diagnostics.ts` |
| Support/unmapped | `shared/contracts/message.ts`; `shared/transport/{connectable-client,connectable-message-client,message-bus}.ts`; `tools/utils.ts` (no internal consumers found) |
| Example | `examples/pserver-to-aaui.ts` (type dependency from M11; included in app lifecycle only when configured) |

Tests/demo files are not in the production graph. Consumers found in tests include public compatibility imports noted below. `testing/` remains a separate playground, not an imported app module. External package edges include Node built-ins, Zod, Socket.IO, Express and better-sqlite3 types/runtime as declared per source.

## Direct cross-owner edges

Every resolved cross-owner edge is listed; multiple symbols from one file pair are grouped. Unlisted intra-owner edges are represented only in SCC results and source inventory. Type-only means erased under the current compiler options; value imports/re-exports are runtime edges.

| From | To | Kind / symbols and interpretation |
|---|---|---|
| M01 configuration | M04 contracts (`modules/pserver/contracts`) | type-only: canonical `PServerConnectionConfig`, `VmInfo`; no infrastructure import |
| M02 app/create-app | M03 facade; M04 contracts | runtime: `connectToPServer`; type-only canonical config type |
| M02 app/create-app | M05 HTTP/socket adapters and gateways | runtime: server composition; intentional composition |
| M02 app/create-app | M09 messaging | runtime: `SendMessage`, `MessageRouter`, `RouteRegistry`, route types |
| M02 app/create-app | M10/M11 | runtime M11 `TransformationRegistry` |
| M02 app/create-app | M14/M15/M16 | runtime concrete SQLite repositories |
| M02 app/create-app | M17 | runtime DB/persistence constructors |
| M02 lifecycle/main | M01/M18 and example | runtime and type: config, diagnostics, optional demo transform |
| M03 facade | M03 transport | runtime: `createPServerTransport` |
| M03 facade | M04 | runtime: protocol factory/events/capability type |
| M03 transport | M04 contracts | type-only: canonical `PServerTransport`, `TransportEventHandler`; adapter structurally implements the port |
| M04 protocol | M04 contracts | type-only: canonical `VmInfo` in public `PServerProtocolConfig` |
| M04 protocol | M10 contracts | type-only: peer message/ACK |
| M05 peer-gateway | M06, M10, M12, M13 | runtime orchestration, stores, workflows, delivery services |
| M05 snapshot adapters | M12/M13 | type-only snapshot DTO dependencies |
| M05 socket gateways | M09, M10, shared contracts | mixed: runtime shared event constants/schema plus type contracts/services |
| M05 outbound adapters | M09 | type-only: outbound adapter/destination contracts |
| M07 API/router/server | M14/M15/M16 and shared contracts | type-only neutral API contracts; suitable infrastructure-to-domain ports |
| M07 HTTP outbound adapter | M09/shared | type-only contracts |
| M08 concrete clients | shared contracts/client port | type-only client interface/message contracts |
| M09 messaging | shared message contract | type-only; shared neutral contract |
| M10 task/resource compatibility facades | M12/M13 | runtime plus type re-exports; consumer compatibility debt, tests still import old paths |
| M10 workflows | M10 contracts and own stores | runtime schema/validation use; type imports also present |
| M10 peer service | M11 transformation | runtime execution dependency |
| M11 transformation | M10 contracts | type-only; reciprocal module-level edge, legitimate dependency but blurs ownership |
| M06 peer directory | M10 contracts | type-only peer identity types |
| shared `connectable-client.ts` | M08 HTTP/socket clients | runtime re-export; inversion/compatibility debt, tests import this public path |

Same-owner resolved imports (for full traceability): M14 session -> M14 contracts (type); M15 process-usage -> M15 contracts (type); M16 sqlite-catalog -> M16 contracts (type); M17 persistence -> sqlite (runtime); M09 message-router -> route-registry (runtime plus type); M07 server -> middleware/API router and API router -> AA catalog router (runtime); M05 socket server -> socket gateway and socket gateway -> peer gateway (runtime); M05 peer-message delivery -> socket peer gateway (type). M12/M13 workflows import their store/schema at runtime and type-only. Shared client interface and MessageBus import shared message types only.

## Cycles and runtime composition

- File-level SCCs: no non-trivial SCCs in runtime graph or all-import graph (all SCCs are singleton; self-imports absent). Graph is source-level static resolution.
- Historical R7.1.0 module-level all-import SCCs included M03↔M04 and M10↔M11. R7.1.B targeted inspection confirms removal of the M04 -> M03 type edge; M10↔M11 remains. No full graph or SCC regeneration was performed for B.
- R7.1.A/B targeted delta: M01 has no infrastructure import; M01 and M02 use M04 canonical config/value contracts. M03 preserves legacy config and transport type exports. M04 protocol config and transport port use canonical contracts; M04 no longer imports infrastructure. M03 transport type-imports the M04 port. These are targeted edge updates, not a fresh full-graph audit; prior full graph counts above remain historical R7.1.0 inventory counts.
- `import type`/type-only named imports erase; ordinary imports containing values are retained, even if some bindings happen to only be used in type positions. No compiler guarantee of DI acyclicity follows from this graph.
- Logical/runtime composition: M02 assembles shared app resources and concrete repositories. `createApplication` exposes concrete `SqliteSessionRepository`, `SqliteProcessUsageRepository`, and `SqliteAaCatalogRepository` handles through overloads; the broad overload returns `ApplicationInstance`. HTTP APIs consume neutral interfaces. Catalog upserts have no production use-case caller; tests use public `app.catalog` concrete methods and instantiate the concrete repository directly.
- `createApplication` uses a late-bound `router` closure: sender is built before router, then router is assigned before listeners/start. This resolves a construction dependency but is still a runtime composition cycle not inferable solely from static imports. M05 peer gateway constructs M12/M13 stores/workflows and supplies transport callbacks; this is an infrastructure composition edge, not inherently a violation. Injected callbacks are absent from graph semantics.

## Targeted findings

| Finding | Classification / evidence |
|---|---|
| M01 config -> M03 connector types | Resolved in R7.1.A: canonical PServer config/value types live in M04 contracts; M03 connector re-exports legacy types. M04 -> M03 concrete transport type remains for step B. |
| M04 protocol -> M03 concrete transport | Resolved in R7.1.B: M04 owns the unchanged `PServerTransport`/`TransportEventHandler` port; M03 adapter implements it structurally and re-exports legacy types. Other TD01 findings remain. |
| M08 shared compatibility barrel -> infra | Compatibility debt under R5-D08; `tests/integration*.test.ts` import clients from this path. Preserve/re-export strategy before moving public import path. |
| M10/M11 reciprocal relationship | M10 service runtime executes M11; M11 only type-imports M10 contracts. Legitimate contract use, but physical shared folder and aggregated SCC hide direction. R5-D01/07 suggest separating neutral contracts if desired. |
| M02 concrete repository handles | Intentional composition plus public test API: app exposes concrete handles and tests call catalog upserts. M07 depends on neutral contracts; no production upsert caller was found. R5-D07 supports domain repositories, but do not narrow/remove concrete test/public surface without compatibility approval. |
| M05 peer-gateway -> M12/M13 | Intentional composition/runtime orchestration; callbacks provide readiness/delivery/scheduling. Candidate for explicit composition boundary only if R7.1 scope calls for it. |
| M09 shared contracts/MessageBus | Shared message DTO/channel contracts are neutral and used by M09/M05/M07/M08. `MessageBus` has no source or test consumers; candidate cleanup only after public API/consumer policy is established (TD17). |
| Legacy store exports | M10 compatibility modules re-export M12/M13 canonical stores. Multiple tests import those old paths. Compatibility debt; no removal in inventory task (R5-D08). |

## Bounded R7.1 plan (proposal)

| Step | Files / allowed direction | Compatibility risk, prerequisite and acceptance |
|---|---|---|
| A — configuration contracts | `config/configuration.ts`, `app/create-app.ts`, `infrastructure/socket/pserver-connector.ts`, `modules/pserver/contracts.ts`, protocol config. M01/M02 consume canonical contracts; no M01 -> infrastructure import. | Complete at tested base HEAD recorded in R7.1.A report; preserve config shapes and legacy connector type exports. Focused config and compatibility coverage added. |
| B — protocol transport port | `modules/pserver/contracts.ts`, `modules/pserver/pserver-protocol.ts`, `infrastructure/socket/pserver-transport.ts`, connector facade. M04 owns port; M03 adapter implements structurally; no M04 -> infrastructure edge. | Completed in R7.1.B report; exact port and legacy type exports retained, protocol behavior covered by fake-transport tests. |
| C — integration-client boundary | `shared/transport/connectable-client.ts`, `connectable-message-client.ts`, M08 clients, integration tests. Shared public API may depend on neutral interface; app/infrastructure implementation depends inward on interface; shared must not re-export implementations. | Existing consumers import old barrel. Retain compatibility entrypoint or staged deprecation; tests for both legacy public paths and concrete clients; no client behavior changes. |
| D — application composition surface | `app/create-app.ts`, HTTP/session/process/catalog contracts and tests. M02 composes M07/M14–M17; API consumers depend on neutral ports; domain use cases must not acquire gateway imports. Keep concrete public handles until explicit compatibility decision. | Catalog test/public upserts make surface narrowing risky. Add type-level compile coverage for overloads and runtime tests for SQLite enabled/disabled, API optional ports; clarify public API policy first. M05 composition remains explicit; avoid broad gateway refactor. |
| E — dependency enforcement | Add a static graph check only after A–D contracts/allowlist are approved; include type/runtime distinction, NodeNext alias resolution, SCC and boundary rules. No dependency until separately authorized. | Prerequisites: approved ownership exceptions and compatibility inventory. Acceptance: deterministic check over tracked `src`, fixtures for legal type-only and illegal runtime edges, zero unapproved cycles, stable command in CI; run typecheck/build/backend/playground suites. |

R7.2–R7.9 behavior/runtime/test/demo work remains deferred; preserve M12–M15 TBD. No implementation is authorized by this audit.
