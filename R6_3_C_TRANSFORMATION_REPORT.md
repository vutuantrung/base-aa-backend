# R6.3.C — Transformation Boundary Report

**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Implementation baseline:** `a5671f5ff6b7401aa371d8e21208d692eceeeebf`  
**Verification runtime:** Node.js 22.23.5

## 1. Verified Baseline and Summary

- Verified branch `main` at the requested `HEAD` `a5671f5ff6b7401aa371d8e21208d692eceeeebf`.
- The only pre-existing worktree item was the untracked `prompts/R6_3_C_TRANSFORMATION_CODEX_PROMPT.md`; it was preserved.
- Read `AGENTS.md`, the R6.2.A/B/C and R6.3.A/B reports, `AAB_PROJECT_FOLDER_STRUCTURE_R6_2_A.md`, and available transformation architecture documentation. R0–R5 decision records were absent. No decision was inferred from those missing documents.
- Historical implementation SHAs in prior reports refer to their own checkpoints and do not conflict with the requested current baseline.
- M11 now owns transformation execution as well as rule registration, matching and ordering. M10 retains peer validation, envelope creation, destination checks, processing metadata assembly, delivery and ACK mapping. Existing registry and service paths and constructor/property contracts remain available.

## 2. Before/After Responsibility Mapping

| Responsibility | Before | After |
|---|---|---|
| Rule contracts, validation, mutable registration, removal, matching and ordering | M11 `transformation-registry.ts` | Same M11 module and APIs |
| Resolve matching rules once against original envelope | `TransformationRegistry.resolve` called in M10 process | M11 executor calls the same resolver once against the original envelope |
| Sequential transformer calls, per-call cloning, output validation and processed rule IDs | Loop inside M10 `PeerMessageService.process` | M11 `executeTransformations` in the existing registry module |
| Translate transformation failure into peer error code | Loop catch in M10 | M11 throws `TransformationExecutionError`; M10 translates only that type to `PeerMessageError('TRANSFORMATION_FAILED', sameText)` |
| Initial envelope creation and payload clone | M10 service | Remains M10 |
| Final `{ transformed, processedBy, timestamp }` lifecycle metadata | M10 service | Remains M10; derives result from M11's returned payload and IDs |
| Destination/readiness checks, local AAB behavior, delivery and `beforeDeliver` | M10 service | Remains M10 |
| Demo transform registration | `lifecycle.ts` using `application.transformations` | Unchanged; still gated by `enableTestPeers` |

No files were moved, no rules were copied, and no second registry was introduced.

## 3. Source Structure and Consumers

```text
src/
├── app/
│   ├── create-app.ts                         # creates and exposes one registry per application
│   └── lifecycle.ts                          # test-peer-gated demo registration
├── examples/pserver-to-aaui.ts               # unchanged demo rule
├── modules/peer-messaging/
│   ├── contracts.ts                          # incoming and processed message shapes
│   ├── peer-message-service.ts                # M10 lifecycle and M11 error translation
│   ├── peer-destination-policy.ts             # M10 policy; unchanged in this checkpoint
│   └── transformation-registry.ts             # M11 rule contracts, registry and executor
└── infrastructure/socket/
    ├── peer-gateway.ts                        # passes the shared registry to M10 service
    └── socket-gateway.ts                      # existing gateway composition
```

Runtime consumers are `createApplication`, which creates one `TransformationRegistry`; `attachSocketServer`/`createSocketGateway`/`attachPeerGateway`, which pass that same instance into the peer message service; and `startApplication`, which registers the demo rule on that application instance only when test peers are enabled. `registerPServerToAauiDemo` consumes the existing registry API. Tests use the same public imports. No production transform is activated by this change.

## 4. Public Interfaces, Compatibility and Ownership

- `TransformationRegistry`, `TransformationRule`, `MessageTransformer`, and `TransformationContext` remain exported from `src/modules/peer-messaging/transformation-registry.ts` with the same shapes and method signatures. `register`, `unregister`, and `resolve` retain their behavior and import path.
- `PeerMessageService` keeps its constructor, public `transformations` property and `process(value, authenticatedFrom, authenticatedInstanceId?)` signature. It still accepts the concrete `TransformationRegistry` for compatibility.
- `ApplicationInstance.transformations` remains the one mutable application registry. No freeze, cache, snapshot copy, or secondary state is created.
- M10 calls the M11 executor through `TransformationRuleResolver`, a narrow resolve capability. The public concrete registry contract remains as before.
- `TransformationExecutionResult` contains only the next payload and ordered `processedBy` IDs. `TransformationExecutionError` is an M11-owned failure type; M10 handles only this type when translating to the externally established `PeerMessageError` code/message.

Dependency direction is M10 → M11 contracts/executor. M11 imports only peer message types from `contracts.ts`; it does not import `PeerMessageService`, infrastructure, directory, gateway, persistence, or workflows. No runtime cycle is introduced.

## 5. Transformation Lifecycle and Exact Semantics

1. M10 parses the strict inbound schema, checks authenticated sender and `toInstanceId`, validates destination ambiguity/readiness, and creates its envelope. Initial `structuredClone(input.payload)` remains outside M11's per-rule failure mapping.
2. M11 calls `resolve(original)` exactly once. Matching and sorting remain in `TransformationRegistry`: wildcard matching is independent for `from`, `to`, and `payloadType`; order is ascending numeric priority and then `id.localeCompare`. Matching uses the original envelope, not a later transformed payload type.
3. Registry behavior remains unchanged: blank ID/type and nonfinite priority are rejected; duplicate IDs fail; unregister returns a boolean. Resolution returns an ordered array of the registered rule references. There is no registry freezing or caching. An already-resolved rule list continues to execute if a rule is unregistered during an earlier async transform; it retains the same rule objects and therefore the same reference/mutation semantics.
4. M11 awaits each transformer sequentially. Each receives a structured clone of the current message and a fresh context containing original `from`/`to`. Each returned payload becomes the next payload only after structured cloning. Transformer changes to its input envelope cannot change routing or message metadata.
5. The existing output predicate is preserved: the result must be truthy, `type` must be a nonblank string, `version` must be a string (blank is accepted), and `data` must not be `undefined` (including `null` is accepted). No ingress Zod schema or normalization is applied to transformer output.
6. For rule-local failures only, M11 throws `TransformationExecutionError` with exact text `Transformer <id> failed: <message>`; non-`Error` throws retain `unknown error`. M10 maps that error to `TRANSFORMATION_FAILED` with the same text. Initial envelope cloning and `resolve(original)` remain outside this catch and keep their previous raw propagation.
7. M10 assembles `{ transformed, processedBy, timestamp }` after execution, including when no rule matches. The no-rule executor result is synchronous, avoiding an extra await boundary on that path. The metadata timestamp is still generated after rule execution.
8. M10 then returns local `to: aab` messages without delivery, or rechecks destination availability and performs the existing optional `beforeDeliver` and delivery calls. Transformation metadata does not replace IDs, timestamp, version, kind, source instance, destination, correlation/causation IDs, channel, event or other M10 envelope fields. Existing async ambiguity/reconnection race semantics are unchanged.

## 6. Test Evidence

Nine independent executor tests cover registration validation/removal, wildcard and tie ordering, original-envelope matching after type changes, sequential async execution and context, envelope and nested payload isolation, output cloning, synchronous no-match results, accepted blank version/null data, invalid outputs, Error/non-Error failure text, stopping later rules, resolve-once behavior and unregister-during-execution reference semantics.

Three service tests cover transformed local AAB messages without delivery, `beforeDeliver` ordering and delivery-error classification, and transformer attempts to mutate M10-owned message metadata. Existing tests also cover authenticated source identity, availability recheck after async transforms, transform order, unmatched payload, delivery, demo PServer-to-AAUI transformation, peer/PServer integration and workflow receipt ACK behavior.

## 7. Changed Files and Verification

Changed files:

- `src/modules/peer-messaging/transformation-registry.ts`
- `src/modules/peer-messaging/peer-message-service.ts`
- `tests/transformation-executor.test.ts` (new)
- `tests/peer-message-service.test.ts`
- `R6_3_C_TRANSFORMATION_REPORT.md`

Twelve focused backend cases were added. Starting from the requested 74 backend + 32 playground baseline, final suite counts are 86 backend + 32 playground = 118 passing tests.

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm test -- --test-concurrency=1` | PASS — 86 tests, 0 failures |
| `npm --prefix testing run test:playground` | PASS — 32 tests, 0 failures |
| `git diff --check` | PASS |

Local listener permission was needed for peer/PServer integration tests. The full suites passed with that permission and used only local mocks/test servers. No production PServer behavior was tested or inferred. One intermediate full run found a sender-mismatch in a new test fixture; the fixture was corrected and the final full run passed.

## 8. Remaining Debt and R6.4 Readiness

- Transformation execution remains in the existing `peer-messaging/transformation-registry.ts` path; no compatibility barrel or file move was needed.
- The application exposes a mutable registry. Its runtime rules can change during an in-flight operation with the existing resolve-once/reference behavior.
- Async destination disappearance and ambiguity races, no-ACK inbound processing, retries and production PServer verification remain deferred as before.
- M12–M16 workflows and persistence were not extracted or changed. M09 and M10 were not redesigned.

R6.3.C completes the M11 boundary while preserving the existing registry and transformation semantics. The work is ready for the separately scoped R6.4 checkpoint; this report does not claim M12–M16 extraction or R6.4 completion.
