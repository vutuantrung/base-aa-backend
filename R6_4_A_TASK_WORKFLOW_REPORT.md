# R6.4.A — Task Workflow Boundary Report

**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Implementation baseline:** `ae6f22f7034f885c68635e4f8984aa8d350daf1c`  
**Verification runtime:** Node.js 22.23.5

## 1. Verified Baseline and Summary

- Verified `main` at the requested `HEAD` `ae6f22f7034f885c68635e4f8984aa8d350daf1c`.
- The only pre-existing worktree item was the untracked `prompts/R6_4_A_TASK_WORKFLOW_CODEX_PROMPT.md`; it was preserved.
- Read `AGENTS.md`, the R6.2.A/B/C and R6.3.A/B/C reports, `AAB_PROJECT_FOLDER_STRUCTURE_R6_2_A.md`, and task/workflow architecture documentation. R0–R5 decision records were absent; no decisions were invented.
- Historical implementation SHAs in phase reports describe their own checkpoints and do not conflict with the verified required baseline.
- M12 now owns F08/F09 validation and receipt lifecycle, persistence coordination, target selection timing, deferred forwarding, lifecycle payloads and task history projection. Socket connection state and event bindings remain in infrastructure. M09–M11, M13 and M17 were not redesigned.
- M12 remains unclassified as APP versus DEMO. Existing `enableTestPeers` behavior and demo message names are unchanged.

## 2. Before/After Responsibility Mapping

| Responsibility | Before | After |
|---|---|---|
| F08 envelope/task validation, target capture, persistence-before-receipt and deferred forward | `receiveTask` in infrastructure `peer-gateway.ts` | `TaskWorkflow.receiveTask` in M12 |
| F09 envelope/result validation, original request correlation through store, receipt and deferred PServer forward | `receiveTaskResult` in `peer-gateway.ts` | `TaskWorkflow.receiveTaskResult` in M12 |
| Task received/forwarded/forwardFailed payload construction | `publishTaskEvent` / `publishResultEvent` in gateway | M12 notification payload builders |
| Task history projection and 50-item limit | Inline mapping in `sendTaskSnapshot` | M12 `createHistorySnapshot` |
| Physical EServer socket readiness for F08 | Inline `getConnection(...).connected` in workflow body | Narrow `isEServerConnectionReady` callback still backed by the same physical predicate |
| PServer readiness for F09 | Gateway policy query | Narrow `isPServerConnected` callback backed by M10/M04 readiness capability |
| Task JSON schema/store and history file implementation | `peer-messaging/task-file-store.ts` | M12 `task-workflow/task-file-store.ts`; old path is a compatibility re-export |
| Socket event binding, authenticated peer branch precedence, current AAUI check and snapshot delivery | `peer-gateway.ts` connection handlers | Remain infrastructure responsibilities; snapshot guard/delivery uses a small testable infrastructure helper |
| M10 generic processing/transformation and M13 resource selection | Peer service and resource-selection gateway branch | Unchanged |

## 3. Source Structure and Runtime Consumers

```text
src/
├── modules/task-workflow/
│   ├── task-workflow.ts                    # M12 F08/F09 lifecycle and history projection
│   └── task-file-store.ts                  # task schema, store contract and JSON implementation
├── modules/peer-messaging/
│   ├── task-file-store.ts                  # compatibility re-exports for existing imports
│   ├── contracts.ts                        # M10 peer envelope/ACK contracts
│   ├── peer-message-service.ts              # M10 generic processing
│   ├── peer-destination-policy.ts           # M10 destination policy
│   ├── peer-directory.ts                   # M06 logical identity owner
│   └── transformation-registry.ts           # M11; unchanged
└── infrastructure/socket/
    ├── peer-gateway.ts                     # auth branch dispatch, wiring and event binding
    ├── socket-peer-gateway.ts              # M05 physical connections and identity integration
    └── task-history-snapshot.ts             # current-connection guards and snapshot event delivery
```

`createApplication` still supplies one transformation registry to the socket composition. Each `attachPeerGateway` creates exactly one `JsonTaskFileStore` and one `TaskWorkflow`, then injects narrow capabilities. M12's file implementation and schema were moved together from the generic peer-messaging folder because they are task-specific; the original `peer-messaging/task-file-store.js` module re-exports `taskSchema`, `StoredTask`, `TaskFileStore`, and `JsonTaskFileStore` for existing callers. The moved implementation was checked byte-for-byte against the baseline file.

Runtime consumers include `peer-gateway.ts`, which creates the one workflow/store pair and delegates only authenticated F08/F09 branches; M04 invokes the existing `receiveFromPServer` facade; existing tests and documentation use the legacy store import; and playground AAUI/EServer/PServer flows consume the unchanged wire events and payloads. `startApplication` and demo transform registration are unchanged.

## 4. Public Interfaces, State Ownership and Dependencies

- Existing task-store exports and import path remain compatible through explicit value/type re-exports.
- New `TaskWorkflow` is instantiated once per peer gateway with a capability object containing the task store, EServer enumeration, physical EServer readiness, PServer readiness, M10 `process` function, deferred scheduler and two lifecycle notification functions.
- M12 does not import Socket.IO, Express, concrete gateways, the application, peer directory implementation, or M13. It receives only the narrow results it needs. It does not retain a second task database or copied EServer registry.
- M06 remains sole owner of logical peer identity. Infrastructure's `listEServerInstances` capability delegates to that directory, while the separate F08 readiness callback calls `getConnection('eserver', targetId)?.connected`, preserving physical readiness semantics.
- M10 remains the generic processor. Workflow forwarding invokes its `process` operation with the captured envelope, authenticated `pserver` or `eserver` source and source instance when applicable; it does not call M09 or create another message pipeline.
- M04 continues to own PServer session readiness. F09's capability delegates to M10's registered M04-aware availability check.
- Infrastructure retains `handleMessage` branch precedence, raw event-type detection, authenticated peer identity, ACK callback condition, `/peers` event binding, AAUI connection selection, current-connection checks and Socket.IO emission. Resource-selection handling and snapshot code were not moved.

## 5. F08/F09 Sequence and ACK Semantics

### F08 PServer task request

1. Infrastructure retains the condition: authenticated PServer and raw payload type `automation.task.request`; AAUI resource-selection branch remains earlier.
2. M12 validates the existing strict peer envelope (`from: pserver`, `to: eserver`, matching type) and task schema/status `inProgress`; it adds no kind restriction.
3. Before persistence, M12 captures an explicit `toInstanceId`, otherwise the sole registered EServer instance, otherwise `undefined`. It does not reselect after persistence.
4. M12 awaits `store.save`. Failure returns `{ok:false, code:'DELIVERY_FAILED', error:'Could not persist task at AAB'}` and emits no receipt event or forward.
5. After successful write completion, M12 publishes the existing `task:lifecycle` received payload and schedules downstream work through an infrastructure-provided scheduler that uses `setImmediate`. It then returns the established received receipt with generated/provided message ID, timestamp, cloned original payload and captured optional target. The receipt does not wait for EServer delivery/ACK.
6. Deferred M12 forwarding reports unresolved target as `No unique EServer destination; specify toInstanceId`; it checks the captured target's physical connection using the prior `getConnection(...).connected` predicate and reports `EServer is offline` when unavailable. It then calls M10 `process` with authenticated PServer identity. Forward and failure lifecycle events remain independent of the receipt.

### F09 EServer task result

1. Infrastructure retains the authenticated EServer plus `automation.task.result` condition after the F08 branch.
2. M12 validates `from: eserver`, `to: pserver`, the type and task status `finished`. `saveResult` retains original task ID/config/createdTime and nondecreasing updatedTime validation, plus exclusive result-file creation. Invalid/mismatched/duplicate results return the existing invalid or persistence ACK without forwarding.
3. M12 awaits `saveResult` before emitting `task.result.received` or returning `{ok:true,status:'received',data}`. Persistence failure remains `DELIVERY_FAILED` with `Could not persist task result at AAB`.
4. After receipt, M12 schedules deferred work. It checks readiness-aware PServer availability, reports `PServer is offline` if unavailable, and otherwise invokes M10 with authenticated EServer identity and source instance. `task.result.forwarded`/`task.result.forwardFailed` remain separate lifecycle outcomes.

Workflow receipt ACKs remain distinct from the M10 generic processing ACK. Socket and PServer ingress still process only when the ACK callback is present. No-ACK processing remains deferred debt.

## 6. Snapshot Safety and Persistence Compatibility

M12 `createHistorySnapshot()` calls `listRecent(50)` and owns the success projection: `{timestamp,tasks:[{task,status,event:'task.snapshot'}]}`, with `finished` for finished task records and `received` otherwise. The infrastructure snapshot adapter checks the original AAUI connection before the query and again after success or failure; it emits only to that same connection if still connected/current. The fallback remains `{timestamp,tasks:[],error:'Unable to load persisted task history'}` and is also suppressed for stale connections.

The existing store implementation was moved without content changes. It retains `AAB_TASK_STORE_DIR` or `./data/tasks`, path resolution, task ID pattern and strict schema, `.json` and `.result.json` names, JSON indentation/newline, exclusive `wx` writes, mode `0o600`, result correlation, `read`, `save`, `saveResult`, and `listRecent` signatures. History still sorts original task file mtime descending, applies the limit before reading, selects a valid finished result, and handles missing directories/files as before. Existing files are not migrated or overwritten.

The receipt boundary is completion of the existing file write. This is not an fsync or crash-durability guarantee. No atomic-write, retry, idempotency or durability changes were made.

## 7. Residual Gateway Responsibilities

`peer-gateway.ts` still detects task message branches, preserving authentication and established precedence, and delegates to M12. It owns one workflow/store pair's composition; supplies directory/readiness, M10 processing, `setImmediate`, and current-AAUI notification capabilities; binds initial connect/reconnect and `task:lifecycle:refresh`; and verifies the original AAUI is current around snapshot reads through the infrastructure adapter. These remain transport integration responsibilities. Resource selection, peer presence, welcome/ping and connection lifecycle remain untouched.

## 8. Changed Files and Verification

Changed files:

- `src/modules/task-workflow/task-workflow.ts` (new)
- `src/modules/task-workflow/task-file-store.ts` (moved implementation/schema)
- `src/modules/peer-messaging/task-file-store.ts` (compatibility re-exports)
- `src/infrastructure/socket/peer-gateway.ts`
- `src/infrastructure/socket/task-history-snapshot.ts` (new)
- `tests/task-workflow.test.ts` (new)
- `tests/task-history-snapshot-adapter.test.ts` (new)
- `R6_4_A_TASK_WORKFLOW_REPORT.md`

Thirteen new deterministic backend cases were added: ten M12 workflow tests and three snapshot-adapter tests. Starting from 86 backend and 32 playground tests, final counts are 99 backend and 32 playground (131 total).

| Check | Result |
|---|---|
| Node version | `v22.23.5` |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 99 tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |
| `git diff --check` | PASS |

Focused tests cover F08/F09 invalid ACKs, deferred persistence and rejection, explicit/single/unresolved target capture, physical offline readiness, receipt independent of deferred failure, result correlation/duplicate writes, authenticated instance propagation, PServer offline receipt, history projection, and stale snapshot success/failure suppression. Existing integration tests continued to cover F03/F04/F08/F09, resource selection, PServer session, multi-EServer behavior, late AAUI snapshot and refresh. Test servers were local mocks; no production PServer compatibility is claimed. Local-bind permission was used for the full integration suite.

## 9. Discretionary Choices, Remaining Debt and R6.4.B Readiness

- A `TaskWorkflow` class groups three related entrypoints (F08 receipt, F09 receipt and history projection) around one per-gateway set of injected capabilities. It holds no duplicate task state. The scheduler is injected so tests can control forwarding without sleeps; runtime still uses `setImmediate`.
- The task store moved into M12 because its schema, persistence and task history are task-owned; the original path remains a compatibility module. This is the only source move.
- APP versus DEMO classification remains explicitly TBD. Existing `enableTestPeers` gating and event names stay unchanged.
- Forwarding remains best-effort and in-memory after receipt; process crashes can lose scheduled forwarding. File write completion does not guarantee crash durability. No retry, outbox, idempotency, fsync or atomic replacement was added.
- The gateway retains raw dispatch conditions and physical connection safety; R7.4 handler-registry extraction remains deferred.

R6.4.A establishes M12's task receipt and history boundary while preserving existing public contracts and flows. It does not claim R6.4.B or M14–M16 extraction.
