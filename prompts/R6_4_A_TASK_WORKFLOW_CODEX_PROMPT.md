# Codex Task — R6.4.A: Task Workflow Boundary Extraction

## 1. Context and checkpoint

- Repository: `vutuantrung/base-aa-backend`
- Branch: `main`
- Architecture baseline: `82b6cb68e2016594d42731c2ae022ce43b638557`
- Required implementation baseline: `ae6f22f7034f885c68635e4f8984aa8d350daf1c`
- R6.3.C is closed; 13 of 18 module boundaries are established.
- Regression baseline: Node.js 22.23.5, 86 backend + 32 playground tests = 118.
- Method: Breadth-first Architectural Decomposition. Extract M12 only; do not redesign the system.

Verify branch, HEAD, working tree and AGENTS.md before editing. Read R6.2.A/B/C and R6.3.A/B/C reports, the architecture notes and available R0–R5 decisions. If decisions are absent, document that fact, do not invent them. Preserve unrelated user changes and prompt files. If baseline differs, report the mismatch and avoid blindly applying this task to unrelated changes.

## 2. Objective

Establish M12 — Task Workflow as the owner of F08 request receipt, F09 result receipt, workflow validation, persistence coordination, receipt acknowledgments, deferred forwarding, lifecycle notification payloads and task history projection. Keep physical connection mechanics, current-connection safety and event binding in infrastructure. M12 must not depend on Socket.IO, Express, concrete gateway implementations, or M13. M10 remains the generic peer-message processing and delivery-policy owner. M06 remains logical identity owner; M04 remains PServer readiness owner. No runtime behavior changes are intended.

M12 classification (APP versus DEMO) remains TBD. Preserve current `enableTestPeers` gating and demo payload names; do not promote demo behavior into production or decide its long-term ownership here.

## 3. Required source inventory

Read these exact baseline files and locate all consumers before choosing implementation structure:

- `src/infrastructure/socket/peer-gateway.ts`: `receiveTask`, `receiveTaskResult`, `publishTaskEvent`, `publishResultEvent`, `sendTaskSnapshot`, `handleMessage`, `getConnection`, `isCurrentAaui`, connection and refresh handlers.
- `src/modules/peer-messaging/task-file-store.ts`: `taskSchema`, `StoredTask`, `TaskFileStore`, `JsonTaskFileStore`.
- `src/modules/peer-messaging/contracts.ts`, `peer-message-service.ts`, `peer-destination-policy.ts`, `peer-directory.ts`, `transformation-registry.ts`.
- `src/infrastructure/socket/socket-peer-gateway.ts`, `socket-peer-message-delivery.ts`, `socket-gateway.ts`, `socket-server.ts`.
- `src/modules/pserver/pserver-protocol.ts`, `src/app/create-app.ts`, `src/app/lifecycle.ts`.
- `tests/task-received-routing.test.ts`, `tests/f09-task-result-receipt.test.ts`, `tests/task-history-snapshot.test.ts`, `tests/pserver-aaui-task-roundtrip.test.ts`, other peer/PServer/selection regressions.
- Playground AAUI, EServer and PServer task-flow consumers; relevant docs and environment configuration references.

## 4. Extraction requirements

Create a focused M12 workflow module (for example `src/modules/task-workflow/`, or a clearly owned small module at the existing location if that minimizes churn). Decide class versus functions based on state and readability. Do not introduce an event bus, DI container, command framework or plugin architecture. Use Intent-Revealing Methods and Extract Method; keep the request and result lifecycles understandable from their entrypoints.

- Move F08/F09 validation, receipt/persistence coordination, target-selection timing, deferred forwarding and lifecycle payload construction into M12.
- Inject narrow capabilities for task persistence (reuse `TaskFileStore` or a suitable subset), EServer instance enumeration, physical readiness checks, readiness-aware PServer availability, generic peer processing and lifecycle notification. Do not pass Socket objects, `Server`, the entire gateway or the entire application. Prefer existing structural contracts where appropriate.
- Keep the physical readiness predicate for F08 equivalent to `getConnection('eserver', targetId)?.connected`; do not silently substitute logical directory presence. M10 must still do its normal processing and rechecks when forwarding.
- M12 owns history projection from persisted tasks, including successful snapshot shape and limits. Infrastructure owns the specific AAUI event subscription/target connection, the guard before the async query and the guard after it for both success and error. Preserve notifications to the current AAUI and snapshot delivery to the original requesting connection only if still current. A small infrastructure adapter is acceptable; no duplicated workflow policy.
- Retain one task store and one workflow instance per attached gateway, using the same default directory semantics. Keep existing `task-file-store.ts` public exports and import paths (compatibility re-export if moving is necessary). Avoid file moves merely for aesthetics. If separating persistence implementation from domain schema is useful, keep the change minimal and preserve all interfaces. Do not modify M17 lifecycle or SQLite.
- Replace only task-specific gateway logic with delegation; retain resource-selection branch and its snapshots unchanged. Keep existing `handleMessage` dispatch order and authentication conditions. Do not build a general handler registry (deferred to R7.4).

## 5. Exact behavioral compatibility

### F08 — PServer task request

- Dispatch only for authenticated PServer + raw payload type `automation.task.request`, with existing branch precedence (AAUI resource selection first). Within M12 retain strict incoming schema, `from: pserver`, `to: eserver`, matching type, task schema and `inProgress` status. Do not add a new kind restriction or require extra fields. Preserve the exact current invalid-envelope and invalid-payload ACK codes/text.
- Preserve generated/provided message ID, target resolution before persistence (explicit instance ID wins; otherwise exactly one registered EServer), and target ID captured for deferred work. Do not reselect an unresolved or changed destination after persistence. Preserve undefined target in receipt if unresolved.
- Await `save(task)` before success receipt ACK. Persistence failure => `DELIVERY_FAILED`, `Could not persist task at AAB`, no forwarding or received notification.
- Emit `task:lifecycle` received notification before receipt return; schedule downstream work with existing `setImmediate` timing. Do not await downstream ACK to issue receipt. Preserve exact envelope shape, timestamp, cloned original payload and optional `toInstanceId`.
- Forward through M10 `process` using original authenticated PServer identity and captured target/message ID; preserve errors `No unique EServer destination; specify toInstanceId` and `EServer is offline` at the same checks. Publish forwarded/forwardFailed independently, with current reason conversion and event shapes. No rollback, automatic retries, new delivery status persistence or durable queue.

### F09 — EServer task result

- Dispatch only for authenticated EServer + raw `automation.task.result` payload type. Validate envelope `from: eserver`, `to: pserver`, matching type and task status `finished`; preserve current invalid ACKs/text.
- Await `saveResult` before receipt; preserve failure `DELIVERY_FAILED`, `Could not persist task result at AAB`. Keep correlation to the original persisted request by task ID, config, createdTime and nondecreasing updatedTime. Do not introduce instance ownership checks or new correlation requirements.
- Preserve source instance from authenticated connection, receipt timestamp and cloned payload, `task:result:lifecycle` received/forwarded/forwardFailed notifications, event names `task.result.*`, null fallback for instanceId, error reason and timestamp fields.
- Schedule forwarding via M10 `process` with captured message ID and source instance; check existing readiness-aware `isPServerConnected()` first and keep `PServer is offline` failure. Offline PServer does not invalidate successful persistence receipt.

### Persistence and history

- Preserve strict task schema, permitted task ID pattern, `inProgress` / `finished`, numeric integer nonnegative times and string config.
- Preserve `AAB_TASK_STORE_DIR` / `./data/tasks`, path resolution, original `<id>.json` and result `<id>.result.json`, JSON formatting/newline, exclusive `wx` writes and file mode `0o600`. Do not overwrite or migrate existing records. Duplicate save/result behavior remains unchanged.
- Preserve `read`, `save`, `saveResult`, `listRecent` signatures and existing original/result validation. History sorts by original file mtime descending, limits before reading (default 50), prefers a valid finished result and handles missing directories/files as before; do not sort by result time or redesign partial/corrupt-file behavior.
- Preserve `task:lifecycle:snapshot` with `{timestamp,tasks:[{task,status,event:'task.snapshot'}]}`; finished => finished, otherwise received. Preserve fallback empty tasks and `Unable to load persisted task history`. Both connect/reconnect and `task:lifecycle:refresh` must still work. Do not emit to old/replaced AAUI after async query, including failure path.
- Existing write completion is the receipt boundary, not an fsync/crash-durability guarantee. Record reliability limitations rather than changing them in this extraction.

## 6. Integration and non-goals

Preserve `/peers` namespace, authentication, welcome/ping/presence event behavior, event ordering, M04 registration/readiness, `attachPeerGateway`, `attachSocketServer`, `receiveFromPServer`, `registerPServerTransport`, `createApplication` signatures and configuration. Preserve callback-dependent inbound processing (known debt); do not add no-ACK processing in this checkpoint. Preserve M09/M10/M11 generic messaging, transformations and generic ACK semantics. Workflow receipt ACK is not a generic processing ACK. Preserve F03/F04 and resource selection (M13). No M14–M16 refactoring, new production workflow requirements, ARM, schema changes, `.env` loading, dependency upgrades, retries, idempotency changes, atomic file-write upgrades, graceful drain or new readiness policy. Do not claim production PServer compatibility from mocks.

## 7. Verification

Keep all 118 baseline tests. Add focused deterministic tests for M12 using fake narrow capabilities and temporary directories as useful. Prefer controlled promises over sleeps. Verify actual wire-level compatibility with existing integration tests.

Required coverage (reuse existing tests where sufficient; identify exact coverage in report):

1. Invalid F08/F09 envelope/payload => exact ACK, no persistence, no forward.
2. Deferred persistence proves no successful receipt or forwarding before save resolves; save rejection proves no received lifecycle event/forward.
3. F08 explicit/single/unresolved targets, captured target across async persistence, offline physical socket despite logical identity, successful receipt independent of delayed/failing downstream ACK.
4. F09 original correlation validation, duplicate result rejection, authenticated source instance propagation, PServer offline with successful receipt, forwarding success/failure lifecycle.
5. Original record/result file compatibility and history projection (finished versus received, limit, missing directory), SQLite disabled behavior if applicable.
6. Snapshot success/fallback; stale AAUI replacement or disconnect during async history read cannot receive old snapshot or redirect it to new connection. Test at the appropriate adapter seam; avoid unstable timing. Verify late connect and refresh.
7. Existing F03/F04, F08/F09, Resource Selection, PServer session and multi-EServer tests continue passing. Generic ACK remains distinct from receipt ACK.

Run on Node.js 22.23.5 (report actual version):

```sh
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
```

Use local test servers only. If sandbox listener permission blocks the test run, request permitted local-bind execution or report blocker precisely. Report real test counts and failures; do not count focused reruns twice. Do not delete, weaken or skip baseline tests to obtain green status.

## 8. Deliverable and stop condition

Create `R6_4_A_TASK_WORKFLOW_REPORT.md` at repository root, containing verified baseline, before/after responsibility mapping, exact changed files, public interfaces and compatibility paths, source structure, state owners, dependency direction, actual runtime wiring, F08/F09 sequence (receipt versus forwarding), snapshot safety, persistence compatibility, test evidence and commands, unresolved debt and readiness for R6.4.B. Describe any discretionary class/module choices and why. Identify residual task-specific responsibilities in the gateway and justify each. Explicitly distinguish existing persistence-write completion from crash durability.

Acceptance: M12 owns task workflow policy without concrete transport dependency; no duplicated task state; all baseline contracts and tests preserved; new targeted verification passes; no unrelated phase work. If blocked, report partial completion and exact blocker instead of claiming success. Stop after R6.4.A; do not implement R6.4.B or later phases. Do not commit or push unless the user separately requests it.
