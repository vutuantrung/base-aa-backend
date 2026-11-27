# Codex Task — R7.4: Explicit Inbound Operation Dispatch (TD09)

## 0. Authority, baseline and working rules

- Repository: `vutuantrung/base-aa-backend`; target branch: `main`.
- Reviewer-verified GitHub HEAD: `02bba560ec47572c54a6c6b51ea1068a0a612793` (`docs(r7.3): consolidate compatibility contracts and verification`).
- R7.3 compatibility consolidation is reviewer-accepted and committed at this HEAD. D01=A through D04=A are binding preserve-current decisions.
- Execute R7.4 as **one end-to-end phase-level task**. Do not create a chain of tiny audit/design/implementation tasks. You may make a short internal design outline and proceed to implementation in the same run if preservation of existing contracts is achievable. Stop only at a genuine architecture/public-behavior blocker requiring explicit owner approval.

Start with `AGENTS.md`, `docs/architecture/PROJECT_STATE.md`, the TD09 row in `docs/architecture/TECHNICAL_DEBT.md`, and R5-D05/R5-D06/R5-D08 in `docs/architecture/ARCHITECTURE_DECISIONS.md`. Run:

```bash
git branch --show-current
git rev-parse HEAD
git status --short
git log -1 --oneline
```

Confirm HEAD/branch; if newer, inspect only relevant delta. Preserve unrelated changes. Never reset/stash/discard or silently overwrite. Do not commit/push without permission. Do not start R7.5.

## 1. Phase objective and actual seam

**Goal:** remove the operation-selection branches from the Socket.IO gateway orchestration and implement explicit, authenticated inbound handler composition, with the same current observable behavior for all supported messages.

At the reviewed HEAD, `src/infrastructure/socket/peer-gateway.ts` owns `handleMessage` and selects:
1. `authenticatedFrom === 'aaui'` with `payload.type === 'demo.resource-selection'` → `ResourceSelectionWorkflow.receiveSelection(value)` (M13);
2. `authenticatedFrom === 'pserver'` with `payload.type === 'automation.task.request'` → `TaskWorkflow.receiveTask(value)` (M12 F08);
3. `authenticatedFrom === 'eserver'` with `payload.type === 'automation.task.result'` → `TaskWorkflow.receiveTaskResult(value, authenticatedInstanceId)` (M12 F09);
4. all other combinations → `processPeerMessageForAck(service, value, authenticatedFrom, authenticatedInstanceId)` (M10).

The same `handleMessage` is invoked by ACK-bearing Socket.IO `/peers` ingress and by `receiveFromPServer`, which invokes it with authenticated sender `pserver`. This current ordering, sender restriction, fallback, and ACK behavior are compatibility invariants, not opportunities to redesign protocols.

Relevant owners: M05 transport/gateway, M10 generic peer processing, M12 Task Workflow, M13 Resource Selection. M06 Directory remains the logical-identity owner. Check `src/infrastructure/socket/socket-peer-gateway.ts`, `src/modules/task-workflow/task-workflow.ts`, `src/modules/resource-selection/resource-selection-workflow.ts`, `src/modules/peer-messaging/contracts.ts`, and relevant tests when needed. Read source before choosing file location/naming.

## 2. Required design and implementation

- Introduce **one narrow, explicit handler-composition/dispatch capability** at an appropriate application/domain boundary; the gateway should invoke one composed ingress handler, not inspect `payload.type` or directly choose between domain workflows.
- Preserve separation: M05 retains socket authentication, connection identity, lifecycle events, physical delivery and ACK callback gate. M12/M13 retain validation, persistence, receipts, deferred scheduling, notifications, workflow error mapping. M10 retains fallback schema/transform/delivery/ACK mapping. Composition root supplies concrete handler capabilities; avoid service locator, dynamic plugin framework or generic command bus.
- Prefer a small, readable typed interface (e.g. authenticated sender + instance + raw value → `Promise<PeerMessageAck>`), an ordered set of well-named handlers, and a single fallback. Avoid duplication of raw `payload.type` selection across socket and PServer paths. Keep Intent-Revealing Methods and Extract Method; don't use unnecessary `any` or type assertions.
- **Do not convert the dispatcher into early schema validation** if doing so changes which handler handles malformed, wrong-sender, or mismatched messages today. Original branch selection uses raw `payload?.type` and authenticated sender and lets selected workflow validate/return its established error; preserve that distinction.
- Keep branch precedence exactly as observed, including sender/type mismatches falling back to M10 and `authenticatedInstanceId` reaching F09 and fallback.
- Preserve R7.3-D01=A: without ACK callback, M05 skips processing. M04 ready/no-callback also does not invoke gateway. Do not add fire-and-forget processing, synthetic ACKs, automatic retry or changed log requirements.
- Do not change event names, wire/HTTP schemas, `PeerMessageAck` response shapes, `status:'received'` receipt semantics, transform rules, logical-instance affinity (R7.2 Option A), or PServer session generation/readiness. Do not alter M12/M13 storage or delayed forwarding timing semantics (schedule after receipt). Preserve existing F08 target selection and F09 authenticated source behavior.
- The boundary should not introduce new file-level runtime cycles or new prohibited architecture edges. Existing documented module aggregation SCC is not approval to add cycles. If a moved dispatcher needs domain workflow references, prefer type-only dependencies and injection/composition at the existing application boundary.
- Do not change `ENABLE_TEST_PEERS` behavior, APP/DEMO/TBD ownership, demo message naming, or public application exports. Do not opportunistically address TD02, TD03, TD05–TD08, TD10–TD21.

## 3. Deterministic characterization and acceptance tests

First inspect existing gateway/workflow tests and avoid duplicate coverage. Add targeted tests that demonstrate **old ↔ new parity**, ideally at the newly introduced dispatch seam and through existing gateway entry points. Cover at minimum:

1. Authenticated `aaui` + `demo.resource-selection` chooses M13 exactly once, preserving its original ACK shape and save/defer side effects.
2. Authenticated `pserver` + `automation.task.request` chooses F08 exactly once, preserving receipt-before-deferred-forward and current ACK/error behavior.
3. Authenticated `eserver` + `automation.task.result` chooses F09 exactly once and propagates its authenticated instance ID.
4. A different authenticated sender with any special `payload.type` falls back to M10; do not dispatch to M12/M13 just because a client spoofs `from` inside the envelope.
5. Unknown/ordinary payload type and malformed/non-object inputs follow the same fallback/validation/error path as before; preserve branch precedence, including cases where a matching sender/type triggers workflow-specific `INVALID_MESSAGE` rather than generic error mapping.
6. ACK-bearing `/peers` and PServer ingress use the same composed decision; no-ACK ingress stays unprocessed (R7.3-D01=A), with previously distinct M04 logging/readiness behavior retained.
7. Workflow persistence failures and delayed-forward failures retain existing ACK/notifications/status/error mapping; no changes to `status:'received'` semantics or scheduling order.
8. Generic transformed routing still follows R7.2 logical-instance affinity, and existing playground flows remain unaffected.

Use deterministic fakes, injected scheduler/recorder, local loopback if necessary, no sleeps to coordinate races. For end-to-end integration rely on current test harness; do not contact external/production PServer. If any scenario is already covered, cite the existing test instead of duplicating it. Do not weaken assertions to get green tests.

## 4. Verification

Run under repository-supported Node (R7.3 used v22.23.5), report actual version and outcomes:

```bash
node --version
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

Also run a focused command for newly added/changed dispatch, peer gateway and workflow tests and report exact case counts. If network/loopback is blocked by sandbox, request narrowly scoped permission and rerun; distinguish initial environment failures from actual regression, do not claim PASS without a successful run. Compare with the last R7.3 reported baseline (backend 180/180, playground 32/32) without assuming future test counts.

## 5. Documentation, acceptance and STOP

Expected deliverables:

- Minimal production refactor for explicit inbound handler composition and its wiring, plus focused regression tests. Keep changes inside the affected M05/M10/M12/M13/composition boundary.
- `R7_4_EXPLICIT_INBOUND_OPERATION_DISPATCH_REPORT.md` at repo root, containing: real base SHA, changed paths, before/after route diagram or table, handler precedence, authenticated identity flow, validation/error/ACK parity, test-to-contract traceability, architecture graph results, any residual risks, and closure recommendation.
- Update TD09 in `docs/architecture/TECHNICAL_DEBT.md`, relevant `docs/architecture/PROJECT_STATE.md` checkpoint, and if genuinely useful a concise dispatch boundary document; do not rewrite historical ADRs or mark unrelated debts closed.

**Acceptance:** Gateway no longer owns raw business operation-selection branches; the composed handler is explicit and testable; M12/M13 domain workflows retain business responsibility; all previously supported ingress outcomes and public contracts are preserved; applicable tests and architecture checks pass. If exact parity cannot be maintained, produce a bounded blocker decision instead of silently changing behavior.

**STOP after R7.4 report for reviewer approval. No commit/push. No R7.5 implementation.**
