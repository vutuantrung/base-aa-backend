# R7.1 Closure Architecture Review

## Decision

**CONDITIONALLY CLOSED** for the approved R7.1 A–E scope. The committed boundary rules, compatibility decisions, D.2 public-surface verification, and executable check are in place. The module SCC is explained below and is reported rather than silently treated as fixed or banned. Before treating the checker as an authoritative CI guard for runtime cycles, address its conservative syntax-based classification and add it to a compatible CI workflow when one exists. No R7.2 work is authorized or started.

## Repository state and evidence

- Branch `main`; committed HEAD `64c2c354ccd3e0e9f86ed37c8996fcb2c13249c5` (`updated 11210931`), matching expected E commit.
- At task start: no tracked changes, no staged changes; one pre-existing untracked prompt `prompts/R7_1_CLOSURE_ARCHITECTURE_REVIEW_CODEX_PROMPT.md`.
- This review changes documentation only: this report, `docs/architecture/PROJECT_STATE.md`, `docs/architecture/DEPENDENCY_INVENTORY.md`, and `docs/architecture/TECHNICAL_DEBT.md`. No production source, checker, tests, package command, or public contract changed.
- Read committed checker/test rules and targeted architecture evidence. No broad inventory regeneration or historical report review.

## M10/M12/M13 module runtime SCC

The SCC comes from these actual cross-owner edges. Import declarations with runtime schema/value names also contain erased type names, noted in the symbol column.

| Source file (owner) | Destination file (owner) | Symbol(s) | Edge kind | Meaning |
|---|---|---|---|---|
| `src/modules/peer-messaging/task-file-store.ts` (M10) | `src/modules/task-workflow/task-file-store.ts` (M12) | `JsonTaskFileStore`, `taskSchema` | Runtime re-export | Legacy compatibility facade to canonical M12 implementation. |
| same | same | `StoredTask`, `TaskFileStore` | Type-only re-export | Legacy type paths retained for compatibility. |
| `src/modules/task-workflow/task-workflow.ts` (M12) | `src/modules/peer-messaging/contracts.ts` (M10) | `incomingPeerMessageSchema` runtime; `IncomingPeerMessage`, `PeerMessage`, `PeerMessageAck`, `PeerId` type-only | Mixed import; runtime edge | Domain workflow validates the shared peer envelope using M10's runtime schema and consumes its types. |
| `src/modules/peer-messaging/resource-selection-store.ts` (M10) | `src/modules/resource-selection/resource-selection-store.ts` (M13) | `JsonResourceSelectionStore`, `resourceSelectionSchema` | Runtime re-export | Legacy compatibility facade to canonical M13 implementation. |
| same | same | `ResourceSelection`, `SelectionDeliveryStatus`, `StoredSelection`, `ResourceSelectionStore` | Type-only re-export | Legacy type paths retained for compatibility. |
| `src/modules/resource-selection/resource-selection-workflow.ts` (M13) | `src/modules/peer-messaging/contracts.ts` (M10) | `incomingPeerMessageSchema` runtime; `IncomingPeerMessage`, `PeerMessage`, `PeerMessageAck` type-only | Mixed import; runtime edge | Domain workflow validates the shared peer envelope using M10's runtime schema and consumes its types. |

Minimal module-cycle witness: **M10** `peer-messaging/task-file-store.ts` → **M12** `task-workflow/task-file-store.ts` → **M10** `peer-messaging/contracts.ts` (returning through `task-workflow/task-workflow.ts`). M13 has the parallel M10 facade → M13 store → M10 contracts path. There is no direct M12↔M13 edge in this SCC. These module-level paths use different files and form **no file-level runtime cycle**; the checker reports zero file runtime SCCs.

Classification: an accepted compatibility/ownership artifact with a real but bounded contract dependency. The M10 facades exist for legacy import compatibility; current tests still import them (`tests/task-history-snapshot.test.ts`, `tests/task-received-routing.test.ts`, `tests/f09-task-result-receipt.test.ts`, `tests/resource-selection-store.test.ts`, `tests/resource-selection-persistence.test.ts`, `tests/aaui-resource-selection-routing.test.ts`). Canonical production composition imports M12/M13 paths directly in `src/infrastructure/socket/peer-gateway.ts`. The return runtime edges use M10's shared envelope schema, not M10 peer service/business implementation. This does not justify deleting the shims or splitting contracts without a separate compatibility/ownership decision.

### M06/M11 all-import contribution

`src/modules/peer-messaging/peer-directory.ts` (M06) imports `ClientPeerId` from M10 contracts type-only. `src/modules/peer-messaging/transformation-registry.ts` (M11) imports `PeerId` and `PeerMessage` type-only from the same contracts file. M10 peer service uses M11 transformation runtime. Those type-only returns contribute to the all-import module SCC, not the runtime SCC.

## R7.1 acceptance and rule status

| Step | Closure evidence | Status |
|---|---|---|
| A — config contracts | M01/M02 use M04 canonical PServer contracts; M01 → infrastructure prohibited for any edge kind. | Enforced targeted invariant. |
| B — protocol transport port | M04 owns transport contract; no M04 → infrastructure edge. | Enforced targeted invariant; legacy M03 exports retained. |
| C — integration clients | Maintained imports use M08 canonical index; exact legacy `connectable-client.ts` re-export identity is tested and allowlisted. | Enforced exact exception; no blanket shared-to-infrastructure permission. |
| D — application surface | D.2 retained all 11 properties, overloads, types and lifecycle behavior; focused compatibility tests passed. | Preserved and historically verified; no API narrowing. |
| E — graph check | Tracked ownership map, NodeNext resolution, type syntax, targeted rules, file SCC detection and fixtures; stable `npm run check:architecture`. | Implemented and verified. Module SCCs are reported, not failed. CI wiring is pending because no compatible workflow exists. |

Enforced: M01/M04 infrastructure prohibition; exact neutral shared contract limits; M08 type-only use of neutral client contracts; one exact R5-D08 runtime re-export; unmapped ownership, unresolved/out-of-graph relative paths, dynamic `import()`/`require()`, and file runtime SCCs fail. M02 concrete construction and M05 workflow composition remain allowed.

Reported only: module runtime SCCs. Current graph has one, M10↔M12↔M13. Module all-import SCC is M06↔M10↔M11↔M12↔M13. No blanket module-SCC ban was approved.

Deferred: CI invocation until a compatible workflow exists; M12–M15 APP/DEMO classifications; external consumers of the M02 public API; TD01 residual contract/ownership questions; TD17 unused/shared compatibility cleanup; broader layer policy and runtime injection/closure cycles.

## Checker limitations

- Scope is tracked `src/**/*.ts`; it does not inspect tests, `testing/`, generated output, or external packages.
- Explicit per-file ownership must be maintained when tracked source files are added or moved.
- It resolves static local import/export declarations with TypeScript NodeNext; it is not a runtime dependency tracer.
- Type classification follows explicit syntax markers (`import type`, named `type`, `export type`). A mixed import is a runtime edge if it has any non-type value specifier. It does not use semantic reference analysis to detect an ordinary import whose binding is used only as a type and elided by TypeScript. A TypeScript emit probe confirmed such an import can disappear when `verbatimModuleSyntax` is disabled. This can conservatively overstate runtime edges/SCCs; the reviewed SCC edges above include actual runtime schemas/re-exports.
- Dynamic `import()` and `require()` are rejected rather than analyzed. Dependency injection, callbacks, and late-bound closures are not modeled.
- Module SCCs are diagnostics only; file runtime SCCs fail. No compatible CI workflow currently runs the command, so local/package enforcement is not CI protection.

## Verification performed vs inherited

- Newly run at committed E source: `npm run check:architecture` passed (52 files, 113 edges: 51 runtime / 62 type-only; 0 file runtime SCCs; 1 module runtime SCC; 1 module all-import SCC).
- Newly run: `node --import tsx --test tests/architecture-check.test.ts` passed; `git diff --check` passed.
- Not rerun for this docs-only review: typecheck/build, 159 backend cases, 32 playground cases. These remain **historical PASS** from the committed R7.1.E report; source and tests are unchanged at this HEAD.
- No sandbox permission failure occurred in this review.

## Follow-up and closure

R7.1 is conditionally closed, not a claim that every module SCC or compatibility debt is resolved. Before CI adoption, refine runtime classification to account for compiler-elided ordinary type-only imports and run the checker in an existing compatible workflow once available. Keep the exact legacy paths until compatibility decisions permit removal. Record SCC follow-up under TD01; preserve TD17 and external-consumer risks. Next checkpoint remains user-directed; do not begin R7.2 from this review.
