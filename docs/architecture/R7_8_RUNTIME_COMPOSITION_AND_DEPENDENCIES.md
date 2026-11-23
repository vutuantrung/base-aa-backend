# R7.8.A — Runtime Composition and Dependencies

## Observed composition from source

```mermaid
flowchart TD
  ENV[process.env] --> CFG[resolveConfiguration M01]
  CFG --> MAIN[main.ts / startApplication M02]
  MAIN --> APP[createApplication]
  APP --> DB{ENABLE_SQLITE / enableSqlite}
  DB -->|enabled| M17[M17 SQLite handle]
  DB -->|enabled| M14[M14 Session repository]
  DB -->|enabled| M15[M15 Process Usage repository]
  DB -->|enabled| M16[M16 Catalog repository]
  APP --> HTTP[M07 HTTP server]
  APP --> SOCKET[M05 generic Socket.IO gateway]
  SOCKET --> CHANNELS[/session and /worker]
  SOCKET --> PEER_GATE{enableTestPeers}
  PEER_GATE -->|true| PEER[/peers namespace + M06 directory]
  PEER --> M12[M12 task store/workflow/outbox]
  PEER --> M13[M13 selection store/workflow/outbox]
  PEER --> M10[M10 peer policy/service]
  M12 --> STORE1[(./data/tasks or configured directory)]
  M13 --> STORE2[(./data/resource-selections or configured directory)]
  PEER_GATE -->|true and PServer config present| M03[M03 physical PServer client]
  M03 --> M04[M04 session protocol]
  MAIN -->|resolved enableTestPeers true| EXAMPLE[src/examples demo transform]
  EXAMPLE --> M11[M11 app-local transformation registry]
```

This diagram shows construction relationships, not that every branch is enabled. `createApplication` opens M17 before the listener, creates M14/M15/M16 only when the DB is enabled, always attaches the generic socket gateway, and passes the nested `enableTestPeers` value to M05. M05 attaches `/peers` and constructs M12/M13 only when enabled. M02 lifecycle separately registers the example transformation based on the top-level resolved flag. M03/M04 exist only if both the M05 peer gateway and `config.pserver` exist.

At start, M02 calls `peerGateway.start(true)` before HTTP bind. That recovers/opens the M12/M13 stores and runners while delivery remains inactive. After HTTP listens, M02 marks local readiness, activates both runners, then calls PServer `connect()`. M04 `connected` means physical socket plus successful PServer session ACK; it is not equivalent to HTTP `/health` or M02 local readiness. Shutdown starts M02 drain/admission cutoff, stops M12/M13 scheduling, waits tracked peer/app work, then closes connector, gateways/listener, and SQLite. The approved R7.6 single 15-second monotonic default budget and ownership through late mutations remain binding.

## Composition variants

| Variant | Actual namespaces / listeners | M12/M13 and durable effects | M14/M15 and SQLite | PServer/session | Important distinction |
|---|---|---|---|---|---|
| 1. CLI default (`node dist/src/main.js`, no test flag) | HTTP and Socket.IO listener; generic `/session` and `/worker`; no `/peers` | No peer gateway, workflows, stores or outbox writer locks | CLI resolves `ENABLE_SQLITE === '1'`; default is **disabled**, so repositories are absent and `/api` capability behavior remains the disabled-SQLite matrix. `/health` is still `{status:"ok"}`. | No PServer config/connector | Program default differs: `createApplication({dbPath,corsOrigin})` defaults SQLite **on**. `enableTestPeers` defaults false. |
| 2. Programmatic named peers, no PServer config (`createApplication({enableTestPeers:true,...})`) | HTTP + generic namespaces + `/peers` | M05 creates M12/M13 stores/runners. At `listen/start`, default directories are `./data/tasks` and `./data/resource-selections` unless `AAB_TASK_STORE_DIR` / `AAB_SELECTION_STORE_DIR` were set before construction. Startup recovery and writer ownership occur even with no PServer. | Independent: programmatic SQLite defaults on unless explicitly false. | `pserverConnector` is `undefined`; no session handshake or PServer delivery. | Tests exercise this shape (`tests/f03-sserver-routing.test.ts`, surface compatibility). Direct factory use does not automatically register the PServer-to-AAUI example transform. |
| 3. Named peers with PServer config | Same `/peers` plus `/ws` outbound client to configured server | Same M12/M13 state ownership and runner startup | Still controlled independently by `enableSqlite` | M03 opens physical Socket.IO transport. M04 sends `automation_vm:session:connect`, retains session ID, and becomes ready only after positive session ACK. On reconnect it resumes with `session_id`; `activity:task:dispatch` is validated and not implicitly forwarded. | CLI with `ENABLE_TEST_PEERS=1` always supplies a PServer object: default URL `http://127.0.0.1:3001`, path `/ws`, VM UDID `aab-demo-vm`. There is no CLI env switch here for “named peers on, PServer config absent”; that variant is programmatic. |
| 4. Playground (`testing/`) | PServer server on 3001 `/ws`; EServer/SServer servers plus clients to AAB `/peers`; Electron AAUI local HTTP on 3004 plus `/peers` client | Playground peers maintain in-memory mock sessions/tasks/scheduler state; AAB’s M12/M13 still own durable workflow files when enabled | AAB DB behavior remains controlled by its own environment; playground does not share M17 | PServer is an inbound server for AAB; EServer/SServer/AAUI connect outward to AAB. Mock PServer session/task maps are not production persistence. | Independently launched Node/Electron processes; no `testing/*` source imports from `src/*`. Wire protocol is a runtime dependency, not a TypeScript import. |
| 5. Tests | Unit/contract tests often instantiate workflows with fake stores; integration tests bind local HTTP/Socket.IO and child processes. | Workflow suites use fake stores or unique temp dirs; app composition tests with peers enabled instantiate real JSON stores/runners. | SQLite tests use `:memory:` and optional native add-on; disabled routes are separately characterized. | Some tests configure local PServer fixture; others test no configured connector. `tests/support/mock-pserver.ts` is test-only. | `tests/` is compiled with root TypeScript but not imported by production `src`; manifest covers 50 backend test files in this baseline. |

### Flag and environment trace

`src/config/configuration.ts:resolveConfiguration` reads `ENABLE_TEST_PEERS` as an exact string comparison to `'1'`. It places the same boolean in both `ResolvedConfiguration.enableTestPeers` and `ResolvedConfiguration.application.enableTestPeers`. When true, it also creates a PServer config with:

- `PSERVER_URL` or `http://127.0.0.1:3001`;
- `PSERVER_SOCKET_PATH` or `/ws`;
- `VM_UDID`, `VM_SDK`, `VM_MODEL`, `VM_ABI`, `VM_FOR_SEARCH === 'true'`, and comma-separated `VM_PLATFORMS` with defaults.

`src/main.ts` passes resolved config to `startApplication`. `src/app/lifecycle.ts` registers `registerPServerToAauiDemo()` when the **top-level** flag is true. `src/app/create-app.ts` passes the nested `application.enableTestPeers` to M05 and uses that to instantiate `/peers`, M12/M13 and connector. These two booleans are equal when produced by `resolveConfiguration`, but are distinct fields in the public config shape; a programmatic `ResolvedConfiguration` can make them disagree. If only the top-level bit is true, the rule is registered but the named gateway may not exist; if only the nested bit is true, `/peers` and workflows exist without lifecycle auto-registration of the example rule. This is a compatibility-sensitive seam, not a recommendation to change it in discovery.

Other AAB environment inputs: `PORT`, `DB_PATH`, `ENABLE_SQLITE`, `SOCKET_CORS_ORIGIN`, `API_KEY`, `SHUTDOWN_TIMEOUT_MS`, and the two workflow store directory variables. `resolveConfiguration` does not load `.env`. `API_KEY` is used by HTTP and peer authentication and forwarded to the PServer connector; do not print its value. `ENABLE_SQLITE` is also exact `'1'` and is independent of the peer flag.

Playground env inputs include `AAB_URL` (default `http://127.0.0.1:3000`), `PEER_HOST` (default loopback for E/S/P servers), `API_KEY`, `ESERVER_PORT`, `ESERVER_INSTANCE_ID`, and `PORT` for selected playground process options. AAUI uses fixed local port 3004 and AAB URL. Tests set the two store directory env variables around app construction; the manifest maps affected test files. These values are separate process configuration, not AAB app imports.

## Static imports versus wire/runtime dependencies

The architecture checker parses tracked `src/**/*.ts` static imports/exports, not Socket.IO namespaces, HTTP requests or `testing/`. Exact cross-owner **runtime** edges at this baseline are:

```text
M02 -> M03, M05, M07, M09, M11, M14, M15, M16, M17, M18, Example
M03 -> M04
M05 -> M06, M10, M12, M13, Support
M10 -> M11, M12, M13, Support
M12 -> M10, Support
M13 -> M10, Support
M04 -> Support
Support -> M08 (one exact R5-D08 compatibility re-export)
```

M02’s `src/app/lifecycle.ts` has one accepted, bounded runtime import of `src/examples/pserver-to-aaui.ts`, which registers an M11 transform. C-D01=A/C-D02=A/C-D03=A retain this edge to preserve the exported `startApplication()` contract and app-local registry lifetime; see the [accepted C ADR](R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md). M05’s `peer-gateway.ts` imports M12/M13 workflows/stores and constructs them; this remains the strongest direct APP-to-TBD coupling, and M12/M13 formal classifications remain TBD. There is no static import from `testing/` to `src/` or the reverse.

Observed wire/runtime edges are distinct:

| Producer → consumer | Transport/address | Contract carried |
|---|---|---|
| AAB M03 → PServer | Socket.IO client, root namespace, Engine.IO path `/ws`; auth `peerId:aab`, optional token | Session connect/resume ACK; peer message delivery ACK; dispatch event listener. |
| PServer → AAB M04/M05 | Same accepted `/ws` socket | `peer:message` (requires ACK callback for processing), `activity:task:dispatch`, session registration ACK. |
| EServer/SServer/AAUI → AAB M05 | Socket.IO namespace `/peers`; `auth.peerId`, optional EServer `instanceId`, optional token | `peer:ping`, `peer:message`, identity/presence, lifecycle and snapshot events. |
| AAB → peers | Authenticated current Socket.IO connection | Targeted message ACK, `aab:welcome`, EServer presence/snapshot and AAUI workflow snapshots/notifications. |
| Playground HTTP clients → peer servers | Separate local ports `/messages`, `/health`, and `/demo/*` | Local trigger/inspection API; not AAB `/api` contract. |
| External clients → AAB M07 | HTTP `/health`, `/api/*` with optional API key | Session, process usage, AA catalog, generic message. `/health` is not aggregate readiness. |

`testing/shared/create-peer-server.mjs` is imported by EServer/SServer; PServer has separate server code. `testing/shared/task-flow.cjs` and `resource-selection.cjs` duplicate mock-side validation/catalog behavior intentionally at the process boundary. Similar data shape does not make them shared production modules.

### Current versus historical flow descriptions

Current source and latest tests define F03 as SServer → AAB → AAUI on the 10-second schedule (`testing/sserver.mjs`); F04 is EServer → AAB → AAUI VM information every 20 seconds (`testing/eserver.mjs`). `docs/architecture/ARCHITECTURE.md` and the final “F03 migration” section of `testing/README.md` agree. Earlier sections in that README still describe the historical EServer 10-second status producer and list it alongside VM info; the README later says those sections are superseded. Older R6 handoffs/reports may reflect earlier flow versions. This discovery treats HEAD source and current tests as implemented behavior, while preserving historical reports as historical evidence; no simulator or flow was changed.

## Extraction blockers and boundary candidates

1. M02’s static example import is an accepted bounded compatibility exception, not an open extraction task. Reconsider only under the trigger and approval requirements in the [accepted C ADR](R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md). Moving `testing/` cannot satisfy this import.
2. M05 currently owns peer auth, namespaces, workflow construction, durable stores/runners, snapshots and notifications in one runtime composition. M12/M13 cannot be moved wholesale to `testing/` without either changing AAB behavior or introducing an unsupported dependency from production to the demo package.
3. M12/M13 rely on M10 schemas/services, M06 identities, M05 sockets, M04 PServer readiness, shared reliability store/runner, and M02 lifecycle settlement. Any future split must preserve direction and capability ownership; the existing M10/M12/M13 module aggregation SCC remains.
4. M14/M15 are app-composed independently of the peer gate. Moving them with demos would change public `/api` behavior, SQLite persistence and auth/disabled responses even if no current external caller is known.
5. The root TypeScript config includes `src/**/*.ts` and `tests/**/*.ts`, emits `dist`, and starts `dist/src/main.js`; `testing/` is separate MJS/CJS/Electron with its own package scripts/dependencies. Root `package.json` has app dependencies and `better-sqlite3` optional. Package/workspace/build or lockfile changes require a separate implementation approval; none are made here.
6. `ENABLE_TEST_PEERS` name and breadth exceed “test peers”: it enables named `/peers`, M12/M13 and the CLI PServer connector/default while the same lifecycle flag registers a sample transform. Renaming/removing it changes environment and programmatic compatibility.

## No-regression matrix for any later proposal

| Current behavior | Boundary under consideration | Primary risk | Required characterization/contract tests before and after a later extraction |
|---|---|---|---|
| `/health` returns `{status:"ok"}` independent of local readiness; `/api` auth precedes SQLite-disabled mapping and preserves exact status/body | Keep M07/M02 APP unless separately authorized | Readiness, auth, route and optional DB precedence changes | `http-gateway.test.ts`, `aa-catalog-boundary.test.ts`, `session-http-api.test.ts`, `process-usage-http-api.test.ts`, `application-lifecycle.test.ts` |
| `/peers` validates identity/token; no ACK callback skips peer processing; dispatcher preserves sender/type precedence and exact negative ACK/error; M06 logical EServer instance binds target | Separate demo clients from APP gateway without moving its contract | Spoofing, synthetic ACK/work, target identity change | `socket-peer-gateway-handshake.test.ts`, `peer-message-handler.test.ts`, `peer-message-service.test.ts`, `peer-destination-policy.test.ts`, `peer-connections.test.ts`, loopback flow tests |
| PServer physical connection is distinct from M04 session readiness; session ACK gates delivery and inbound peer work | Keep M03/M04 application contract even if PServer implementation is mock | Marking connected too early, stale session resume, processing before readiness | `pserver-session.test.ts`, `pserver-protocol.test.ts`, `peer-forwarding.test.ts`, `pserver-aaui-task-roundtrip.test.ts` |
| F03 SServer status and F04 EServer VM stream stay separate; F08 captures target and receipts before deferred delivery; F09 correlates result and source instance | Move simulators/UI independently from flow semantics | Flow names or payload ownership mistaken for business ownership; target/source loss | `f03-sserver-routing.test.ts`, `eserver-vm-info-forwarding.test.ts`, `task-workflow.test.ts`, `f09-task-result-receipt.test.ts`, `task-received-routing.test.ts`, playground dashboard tests |
| M13 saves normalized receipt, ACKs original parsed payload, replays exact stored ACK on duplicate and projects canonical delivered/uncertain status | Separate UI option catalog from M13 receipt/outbox only with owner decision | ACK identity/time/status change, duplicate delivery, unsafe retry | `resource-selection-workflow.test.ts`, `resource-selection-store.test.ts`, `resource-selection-persistence.test.ts`, `reliable-outbox.test.ts`, `reliable-crash-process.test.ts` |
| R7.5 P01–P06: atomic receipt+intent, exact duplicate ACK, stable target/source, retry only proven-unsent, uncertain no-replay, quarantine/conflict block, stale lock fails closed, no expiry/GC; process-wide attempt cap 4; 5,000 records/128 MiB per M12/M13 directory and 10,000/256 MiB aggregate | Persistence stays with its owner unless separately approved | Lost evidence, duplicate side effect, unsafe replay, lock/quota/concurrency drift | `reliable-outbox.test.ts`, `reliable-crash-process.test.ts`, `application-lifecycle.test.ts`; retain process-kill harness |
| R7.6 D01–D06: one-shot lifecycle, unchanged listen/close API, internal readiness, auth/admission precedence, tracked ACK/fan-out/snapshot work, one 15s monotonic total deadline, late mutation keeps writer ownership | M02 controls all compositions and shutdown | Premature close or false settlement after extraction | `application-coordinator.test.ts`, `application-lifecycle.test.ts`, `application-startup-rollback.test.ts`, `application-peer-ack-drain.test.ts`, `shutdown-signals.test.ts`, outbox tests |
| M09 preserves `Promise.all` fail-fast while started siblings settle; M14–M16 SQLite data/API shape remains and schemas unchanged | Keep generic routes and data behavior independent of playground | Partial fan-out or API/database compatibility drift | `routing.test.ts`, `application-lifecycle.test.ts`, `session-repository.test.ts`, `process-usage-repository.test.ts`, `aa-catalog.test.ts`, HTTP route tests |
| R7.7 keeps manifest validation, additive profiles, Node 22.23.5 baseline, serial `npm test`, and full backend/playground gate | Move test files only after mapped and approved | Silent test loss, different default gate, omitted crash/peer evidence | `npm run test:manifest`, `npm run test:fast`, `npm run test:integration`, `npm run test:full`; preserve manifest membership/review and exact counts |

All cited tests passed in the Node 22.23.5 Full gate for this discovery checkpoint. That establishes local test evidence only, not external deployment or power-loss guarantees.
