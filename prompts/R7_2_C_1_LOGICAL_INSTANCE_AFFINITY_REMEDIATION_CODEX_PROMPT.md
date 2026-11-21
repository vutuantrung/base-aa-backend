# Codex Task — R7.2.C.1: Logical-Instance Affinity & Topology Consistency (TD04)

## 0. Approval, baseline, and execution rules

**Architecture policy APPROVED: Option A — Logical-instance affinity.** This task authorizes a narrowly scoped TD04 production fix and regression tests; it does **not** authorize unrelated behavioral changes.

Repository: `vutuantrung/base-aa-backend`; target branch: `main`.

Last reviewer-verified remote HEAD before the R7.2.C characterization: `3d449f36eccf3b17fe95729ddc2a85b718fd8529`. **The R7.2.C report describes local uncommitted tests/docs and has not yet been confirmed committed.** Do not assume that the branch or working tree is unchanged.

At start:

1. Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` once; run `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git log -1 --oneline`.
2. Check whether R7.2.C characterization (`tests/peer-destination-policy.test.ts` and `R7_2_C_DESTINATION_TOPOLOGY_CHARACTERIZATION_REPORT.md`) is already present locally or committed. Preserve all existing local changes, including the report and task prompts; **do not reset, stash, overwrite, or silently discard anything**.
3. If the preceding C characterization has **not been reviewed/committed into an accepted checkpoint**, prefer stopping with a concise checkpoint-status report and request its review/commit before modifying production code. If a newer committed HEAD contains C, record the real HEAD and proceed. Never claim an old SHA is the new baseline.
4. Never commit or push without explicit approval. Do not proceed to R7.2 closure or R7.3.

## 1. Goal and approved routing semantics

Ensure a message's destination is the **logical EServer instance chosen at initial validation**, not whichever sole EServer happens to be connected at physical delivery time. Physical connection replacement is permissible **only when it belongs to the same bound logical instance**.

Approved invariants:

- **Explicit EServer target:** `toInstanceId=worker-1` remains bound to `worker-1`; deliver through its **current** connection ID (including a reconnect from `socket-old` to `socket-new`). Never send to another instance.
- **Untargeted EServer with exactly one instance at initial validation:** internally bind that logical instance (`worker-1`) **once** before any async transformation. If `worker-1` reconnects with a different socket, deliver to the new socket of `worker-1` if connected. If `worker-1` disappears and only `worker-2` remains, do **not** retarget to `worker-2`; return `DESTINATION_OFFLINE` without physical delivery.
- **Untargeted EServer with >1 instance at initial validation:** preserve `AMBIGUOUS_DESTINATION`, same public error shape/message unless a narrowly justified change is required. Do not start a transformation or delivery.
- **Untargeted EServer with no instances at initial validation:** preserve `DESTINATION_OFFLINE`.
- **Topology becomes multi-instance after a message has already bound an initial sole instance:** keep that bound instance, not a new ambiguity; deliver to its current socket if still online, else `DESTINATION_OFFLINE`. Do not emit spurious `DELIVERY_FAILED` for pure topology ambiguity/offline transitions that can be classified at the policy boundary.
- **Actual transport/delivery rejection:** preserve `DELIVERY_FAILED` and the established ACK contract. Do not promise reliable delivery after an ACK or add retries.
- **Other peers (`aaui`, `sserver`, `pserver`, `aab`) and authenticated sender/source metadata:** preserve current behavior. Do not modify M05/M06 handshake state, M04 session ACK handling, M12/M13 workflows or TD02/TD03 policies.

**Compatibility constraint:** For a message originally lacking `toInstanceId`, a resolved routing identity is *internal execution context*, not permission to change the original externally observed `PeerMessage` envelope. Avoid adding `toInstanceId` to outbound/ACK messages unless you discover a contract that explicitly requires it and escalate for review. Keep `id`, payload, routing metadata, `processing`, `sourceInstanceId`, event names, public interfaces, and ACK shapes stable. Use a small internal routing decision object or similarly explicit mechanism rather than allowing a mutable directory to select a new logical instance late.

## 2. Read only the relevant source/evidence

- `R7_2_C_DESTINATION_TOPOLOGY_CHARACTERIZATION_REPORT.md` (when present), and TD04 rows in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` and `docs/architecture/TECHNICAL_DEBT.md`.
- `src/modules/peer-messaging/peer-message-service.ts`
- `src/modules/peer-messaging/peer-destination-policy.ts`
- `src/modules/peer-messaging/peer-directory.ts`
- `src/modules/peer-messaging/contracts.ts`
- `src/infrastructure/socket/socket-peer-message-delivery.ts` only if needed.
- `tests/peer-destination-policy.test.ts`, `tests/peer-message-service.test.ts`, and closely related EServer tests.
- `docs/architecture/PROJECT_STATE.md`.

Avoid broad codebase re-audit. Follow project standards: intent-revealing names, Extract Method, no gratuitous `as`/`any`, minimal coupling and public surface changes.

## 3. Design checkpoint before implementation

Briefly record in the report a concrete plan answering:

1. At which precise point is an EServer logical identity bound **before** awaiting transformations?
2. How is the binding carried through `PeerMessageService` to `PeerDestinationPolicy.deliver` without adding transport details or mutating the public message envelope?
3. How is an absent/replaced bound instance distinguished from an actual delivery exception, while keeping current `PeerMessageAck` error mapping?
4. What happens if the bound instance disappears *between* the final availability check and physical send? Do not claim atomicity unsupported by the present directory/socket APIs. Keep this race limitation explicit and avoid expanding scope without approval.

If the existing `PeerDelivery` seam needs a contract adjustment, prefer a small **internal** capability or opaque routing context. Document callers and tests affected. Don't generalize into a new routing framework or alter public network schemas.

## 4. Regression-first implementation and deterministic tests

Update/extend the R7.2.C tests to assert the **approved new invariant**, not merely old characterization. Use `PeerMessageService`, `PeerDestinationPolicy`, a mutable real `PeerDirectory`, `TransformationRegistry`, and socket-delivery recorder. Hold a transformer on a manually controlled promise; mutate topology while paused; no arbitrary sleeps, real PServer calls or production data.

Required matrix:

1. Stable explicit `worker-1/socket-old` => success; one delivery to old socket; envelope unchanged.
2. Explicit `worker-1` disconnects during transform => `DESTINATION_OFFLINE`, no delivery.
3. Explicit `worker-1/socket-old` is replaced by `worker-1/socket-new` => success to new socket (same logical ID only).
4. Initially untargeted with exactly one `worker-1/socket-old`; add `worker-2` while paused => still deliver only to current `worker-1` socket; do not return `DELIVERY_FAILED` or `AMBIGUOUS_DESTINATION` after successful initial binding.
5. Initially untargeted with sole `worker-1`; remove it and register sole `worker-2` while paused => `DESTINATION_OFFLINE`; **zero** deliveries to `worker-2`.
6. Initially untargeted with sole `worker-1`; replace its physical socket while paused => success to new `worker-1` socket, and original message remains untargeted in public envelope.
7. Initially untargeted and multiple EServers at initial validation => `AMBIGUOUS_DESTINATION`, no transformation/delivery.
8. Initially untargeted with zero EServers => `DESTINATION_OFFLINE`, no transformation/delivery.
9. Actual socket delivery throws => `DELIVERY_FAILED` (not conflated with topology state).
10. Preserve prior transformation metadata, authenticated source-instance rules, PServer/AAB delivery and no unintended changes to other peers.

Assert both `process()` result/throws and `processPeerMessageForAck()` classifications as appropriate. Make tests independent, deterministic and readable. If existing characterization tests now assert *old* behavior, update their names/expectations rather than silently deleting coverage; retain evidence of prior behavior in the R7.2.C report and design docs.

## 5. Verification and acceptance gate

Use Node **22.23.5** and run:

```bash
node --import tsx --test tests/peer-message-service.test.ts tests/peer-destination-policy.test.ts
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

If sandbox policy blocks execution, request the narrowest necessary authorization. Report actual outputs and case counts, not inferred/historical PASS. Never weaken assertions to pass. Do not introduce a new package dependency without justification and approval.

## 6. Deliverables, reporting and stop condition

- Production modifications only in the minimal TD04 service/destination policy implementation and strictly necessary internal types.
- Deterministic regression tests, including previous R7.2.C scenarios updated to the approved routing semantics.
- Root report: `R7_2_C_1_LOGICAL_INSTANCE_AFFINITY_REMEDIATION_REPORT.md` describing actual HEAD, files changed, design choice, per-scenario old/new behavior, wire-compatibility verification, test results, and residual check-to-send race.
- Update only relevant TD04 sections of `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, `docs/architecture/TECHNICAL_DEBT.md`, and the current checkpoint in `docs/architecture/PROJECT_STATE.md`.
- Clearly distinguish **TD04 fixed under deterministic characterization** from **real socket/topology timing not proven**. Do not mark TD02/TD03 resolved.

**STOP for reviewer approval. No commit/push. No R7.2 closure/R7.3.**
