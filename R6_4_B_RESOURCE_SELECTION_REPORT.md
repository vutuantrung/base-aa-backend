# R6.4.B — Resource Selection Boundary Report

**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Implementation baseline:** `35e877cf49352e49aba1ddb306b9bea6bfa2ec07`  
**Verification runtime:** Node.js `v22.23.5`

## 1. Verified Baseline and Summary

- Verified branch `main` at the required implementation HEAD. The initial worktree contained only the untracked `prompts/R6_4_B_RESOURCE_SELECTION_CODEX_PROMPT.md`; it was preserved.
- Read `AGENTS.md`, available R6.2.A/C and R6.3.A/B/C and R6.4.A reports, and the available architecture/folder-structure notes. An R6.2.B report and R0–R5 decision documents were not present in the repository; no missing decisions were inferred. The requested implementation baseline matched exactly.
- M13 now owns resource-selection envelope/data validation, persistence receipt coordination, deferred forwarding status and success-history projection. Infrastructure retains authenticated branch dispatch, event binding, current-AAUI lookup/emission, and setImmediate scheduling.
- Selection remains demo-gated/wired as before; APP versus DEMO ownership remains TBD. M12, M09–M11, M14–M16, M17, peer lifecycle and unrelated reliability concerns were not redesigned.
- The new workflow can be tested without Socket.IO or opening a listener. Existing integration tests continue to exercise its real gateway wiring with local mocks.

## 2. Responsibility Audit and Before/After

| Responsibility | Before | After |
|---|---|---|
| Strict peer envelope and selection IDs validation, exact invalid ACK mapping | Inline `receiveSelection` in `infrastructure/socket/peer-gateway.ts` | `ResourceSelectionWorkflow.receiveSelection` in M13 |
| Selection receipt save and persistence error mapping | Gateway branch | M13 workflow, using the single injected store |
| Pending and final delivery notifications | Gateway helper and deferred closure | M13 decides record/status payload; injected publisher resolves current AAUI and emits |
| Deferred message ID capture and M10 forwarding | Gateway deferred closure | M13 workflow; infrastructure supplies the scheduler and M10 processing capability |
| Persisted selection history success projection and 50-record limit | Inline snapshot query in gateway | `ResourceSelectionWorkflow.createSnapshot` |
| Current connection, stale-request suppression, Socket.IO event and fallback emission | Gateway snapshot function | Infrastructure `resource-selection-snapshot.ts` adapter, still called from gateway connection/refresh bindings |
| JSON receipt and status sidecar schema/implementation | `peer-messaging/resource-selection-store.ts` | M13 `resource-selection/resource-selection-store.ts`; previous module path re-exports compatible values/types |
| Authenticated peer routing precedence, selection trigger condition, `/peers` bindings | `peer-gateway.ts` | Remain in infrastructure unchanged |
| M10 generic peer processing and M12 F08/F09 workflows | Existing modules | Unchanged; selection invokes M10 through a narrow injected function |

### Source structure

```text
src/
├── modules/
│   ├── resource-selection/
│   │   ├── resource-selection-store.ts       # M13 schema, types, store capability and JSON store
│   │   └── resource-selection-workflow.ts    # M13 receipt, forwarding status and history projection
│   ├── peer-messaging/
│   │   └── resource-selection-store.ts       # compatibility re-exports
│   └── task-workflow/                        # M12, unchanged in this checkpoint
└── infrastructure/socket/
    ├── peer-gateway.ts                       # authenticated dispatch, wiring and socket ownership
    └── resource-selection-snapshot.ts        # original-connection guard and event emission
```

## 3. Public Contracts, State Ownership and Consumers

- `ResourceSelectionWorkflow` exposes `receiveSelection(value)` and `createSnapshot()`. Its capability contract is limited to `save`/`updateDelivery`/`listRecent`, M10 `processMessage`, a deferred scheduler, and a `publishUpdated` notification function.
- `ResourceSelectionStore` structurally exposes only `save`, `updateDelivery`, and `listRecent`. `JsonResourceSelectionStore` is instantiated once per attached peer gateway and implements it. No duplicate selection records or route/identity state were added.
- Existing `resource-selection-store.js` imports remain compatible from `src/modules/peer-messaging/resource-selection-store.ts`, including `JsonResourceSelectionStore`, `resourceSelectionSchema`, and all existing exported types. Existing integration tests still import the old path; the new store tests explicitly exercise that path.
- M13 imports the existing M10 ingress envelope schema/types and calls generic M10 processing through an injected capability. It imports no Socket.IO, Express, gateway, application, directory, PServer connector, or workflow-store implementation. The dependency direction is M13 → narrow M10 contract/capability; infrastructure composes M13, M10, M06-backed AAUI lookup, socket emission, and scheduling.
- M06 remains the owner of logical identity. `peer-gateway.ts` continues to choose the current AAUI using the existing directory/connection logic at each notification, rather than capturing an old socket in M13.
- Concrete consumers include `peer-gateway.ts`, existing tests `aaui-resource-selection-routing.test.ts` and `resource-selection-persistence.test.ts`, the new workflow/store/snapshot tests, AAUI `main.cjs`, mock PServer `pserver.mjs`, and the playground resource-selection documentation. Runtime wire name `demo.resource-selection`, update/snapshot events, and environment setting `AAB_SELECTION_STORE_DIR` remain unchanged.

## 4. Receipt, Forwarding, Status and Snapshot Semantics

### Receipt and forwarding

1. Infrastructure dispatch remains AAUI-authenticated and recognizes the raw payload type `demo.resource-selection` before the PServer F08, EServer F09, and generic M10 branches. It retains the existing type-safe-at-runtime raw dispatch guard; M13 then validates the strict incoming schema and requires `from: aaui`, `to: pserver`, and the same payload type. No kind restriction was added.
2. M13 validates `browserProfileId`, `proxyId`, and `accountId` using the existing strict trimmed string schema (1–150 characters, no extra keys). Invalid ACKs remain exactly `INVALID_MESSAGE` / `Invalid resource selection envelope` and `INVALID_MESSAGE` / `Invalid resource selection IDs`.
3. M13 awaits `store.save` before publishing, scheduling, or returning success. Persistence rejection returns `{ok:false,code:'DELIVERY_FAILED',error:'Could not persist resource selection'}` and produces no pending notification or forwarding operation.
4. On save success, M13 publishes the original pending stored record, then captures the provided peer message ID or generates one, then requests exactly one deferred operation. The receipt carries the peer message ID (distinct from the store-assigned selection ID), numeric timestamp, existing envelope defaults and a clone of the original parsed payload. It does not replace the outbound/ACK payload with the store-normalized selection. Its ACK remains `{ok:true,status:'received',data:envelope}` and does not wait for PServer delivery.
5. Runtime scheduling remains `setImmediate`. The deferred M13 operation invokes the injected M10 processor once with the original parsed envelope plus captured ID and authenticated source `aaui`. It performs no additional readiness gate. M10 retains its processing and destination checks; outbound delivery does not re-enter inbound selection handling.
6. A fulfilled M10 call yields `forwarded`. A rejection yields `forwardFailed` with `Error.message` or `String(error)` and existing diagnostic text. `updateDelivery` is attempted separately. If it fails, the delivery classification is unchanged and the final AAUI update is still published. The final notification omits `deliveryError` for falsy reasons; the store retains its `Delivery failed` fallback for a failed status with a falsy reason. Persisted sidecar status and in-memory notification are therefore allowed to diverge after a sidecar write failure, as before.

This is best-effort deferred forwarding, not transactional or durable delivery. No rollback, retry, outbox, idempotency, or delivery-status policy change was introduced. Notification exception behavior was retained: a synchronous notification error is not newly swallowed or reclassified.

### Snapshot safety

- M13 `createSnapshot` queries `listRecent(50)` and returns `{records,timestamp:Date.now()}`.
- Infrastructure checks the requesting AAUI is current before querying and, after either success or failure, checks that the original connection is still connected and current. It emits only to that original connection; a replacement connection never receives an old request's result.
- The fallback remains `{records:[],timestamp:Date.now(),error:'Could not load saved selections'}`. A stale/disconnected requester receives neither success nor fallback.
- Existing `resource-selection:snapshot` initial connect/reconnect and `resource-selection:refresh` binding, along with welcome, ping, presence and task snapshot behavior, remains infrastructure-owned and unchanged.

## 5. Persistence Compatibility

The JSON store implementation was moved with only the addition of the narrow `ResourceSelectionStore` interface and `implements` declaration; its persistence logic matches the baseline. It retains `AAB_SELECTION_STORE_DIR` or `./data/resource-selections`, resolved paths, the existing 36-character lowercase hex/hyphen filename validation, `<id>.json` receipt and `<id>.delivery.json` sidecar. Receipts remain immutable exclusive `wx` writes, mode `0o600`, pretty JSON plus newline containing only `id`, `createdTime`, and `selection`. Sidecar writes remain separate nonexclusive writes with the same status/error fields.

`updateDelivery('pending')` still rejects. `listRecent` still reads all matching receipts, validates receipt ID, safe-integer `createdTime`, and selection schema; missing/unknown sidecar status becomes pending; only a string `deliveryError` for `forwardFailed` is included. Missing directory returns an empty list; other errors propagate. Ordering remains createdTime descending then ID descending by `localeCompare`; limit applies after sorting. The store does not migrate or overwrite existing receipt files.

Completion of the existing write is the receipt boundary. It is not an fsync or crash-durability guarantee. Separate receipt/sidecar writes, partial/corrupt-file behavior, and best-effort post-receipt scheduling remain known consistency/reliability risks and were not changed.

## 6. Changed Files

- `src/modules/resource-selection/resource-selection-store.ts` — M13 store/schema and narrow capability.
- `src/modules/resource-selection/resource-selection-workflow.ts` — M13 workflow policy and snapshot projection.
- `src/modules/peer-messaging/resource-selection-store.ts` — compatibility re-exports.
- `src/infrastructure/socket/peer-gateway.ts` — one workflow/store composition and delegation; event bindings and dispatch remain.
- `src/infrastructure/socket/resource-selection-snapshot.ts` — small infrastructure adapter for original-connection snapshot safety.
- `tests/resource-selection-workflow.test.ts` — seven deterministic workflow tests.
- `tests/resource-selection-store.test.ts` — three persistence/compatibility tests.
- `tests/resource-selection-snapshot-adapter.test.ts` — three deterministic snapshot safety tests.
- `R6_4_B_RESOURCE_SELECTION_REPORT.md` — this report.

The existing `resource-selection-persistence.test.ts`, `aaui-resource-selection-routing.test.ts`, M12 workflow tests, M10 tests, and playground flows remain unchanged.

## 7. Verification

The required Node.js version was selected explicitly: `v22.23.5`. Thirteen new backend tests were added; the baseline was 99 backend and 32 playground tests. The final backend source test count is 112, and the playground still contains 32 individual tests across five test files.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 112 tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — all five test-file suites; 32 individual playground cases, 0 failures |
| `git diff --check` | PASS |

The first sandboxed full backend run could not bind its local test listeners and exited before assertions in integration-oriented test files. The same full suite was then run with permitted local listener access and passed. Tests use local mocks/servers; no production PServer or external service behavior is claimed. The three new M13 test files pass independently without Socket.IO or listener setup.

## 8. Remaining Debt and R6.4.C Readiness

- APP versus DEMO classification of M13 remains TBD; existing feature gating and demo wire names are preserved.
- Selection delivery remains best-effort after the receipt. A process exit can lose the scheduled operation; status sidecar failure can leave history pending while the emitted AAUI update says forwarded/forwardFailed.
- Filesystem receipt write completion is not crash durability; receipt and status sidecar are not an atomic pair. Existing ordering and corruption/error behavior remain unchanged.
- `peer-gateway.ts` retains only transport-specific composition and dispatch: authenticated branch selection, current AAUI lookup per notification, Socket.IO event emission, connect/reconnect/refresh bindings, and the runtime `setImmediate` scheduler. These are transport responsibilities, not duplicated M13 policy.
- M12 was not refactored or generalized with M13. M14–M16, M17, reliability checkpoints and unrelated connection lifecycle concerns remain outside this phase.

M13 now has an independently testable workflow boundary and preserves its old store import path. This provides a suitable base for R6.4.C Generic Session work while leaving session ownership and all later checkpoints untouched.
