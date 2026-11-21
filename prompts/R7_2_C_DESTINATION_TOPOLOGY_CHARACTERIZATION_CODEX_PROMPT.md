# Codex Task — R7.2.C: Destination Topology During Async Transformation (TD04)

## Committed baseline and scope

Repository: `vutuantrung/base-aa-backend`  
Branch: `main`  
Expected committed HEAD: `3d449f36eccf3b17fe95729ddc2a85b718fd8529` (`fix(r7.2.b): guard stale session ACKs and harden readiness`).

At task start: read `AGENTS.md` and the current checkpoint in `docs/architecture/PROJECT_STATE.md`; run `git branch --show-current`, `git rev-parse HEAD`, `git status --short`. Confirm exact baseline or inspect relevant changes and stop if the source baseline unexpectedly differs. Preserve pre-existing work; never reset/stash or overwrite unrelated files. Do not commit or push.

**Objective: deterministic, test-first CHARACTERIZATION ONLY** of TD04: destination state changes between initial validation and delivery, while an async payload transformation is pending. This task must produce evidence for an architecture/policy decision. Do **not** implement connection affinity, retries, revalidation, changed ACK mappings, or a production fix. Do not change production source, public contracts, protocol events, transformation semantics, M05/M06 membership or TD02/TD03 code.

## Read the minimum relevant source

- `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` — TD04-A/B/C.
- `docs/architecture/TECHNICAL_DEBT.md` — TD04.
- `src/modules/peer-messaging/peer-message-service.ts` — pre-transform `validateDestination` and `isConnected`, post-transform `isConnected`, `beforeDeliver`, `deliver`, `processPeerMessageForAck` classification.
- `src/modules/peer-messaging/peer-destination-policy.ts` — `has`, `lookup`, `listInstances`, late physical socket resolution.
- `src/modules/peer-messaging/peer-directory.ts` — peer identity/instance semantics and connection-ID-safe removal.
- `src/modules/peer-messaging/transformation-registry.ts` — registration/async transform API, existing utility pattern.
- `tests/peer-message-service.test.ts`, `tests/peer-destination-policy.test.ts` and directly related tests only.

Do not re-audit R7.1, the whole app, production PServer, or unrelated architectural debts.

## Required deterministic setup

Use a manually controlled Promise/deferred transformation to suspend processing **after initial destination validation** but **before post-transform connectivity recheck**. Use a mutable fake M06 directory compatible with `PeerDirectoryCapabilities` (or a real local `PeerDirectory` when simpler), plus a fake socket-delivery recorder. Control topology changes explicitly while the transform is held, then resolve the transform; no sleeps, polling, timers, network calls or arbitrary event-loop race assumptions.

Prefer tests integrated through `PeerMessageService` + `PeerDestinationPolicy`, not only standalone policy unit tests, so that the resulting ACK code and exact physical connection target are observed. Existing message schema and `TransformationRegistry` must be respected. Keep tests independent and readable with intent-revealing helpers; avoid broad test harness refactors, unsafe `any`, casts, and unrelated edits.

## Characterization matrix (current behavior, tests should PASS)

1. **Baseline — stable target:** Start with exactly one EServer instance `worker-1/socket-old`; pause transformation; release with topology unchanged; confirm single delivery to `socket-old`, valid outbound metadata and success ACK. Cover explicit instance target and/or untargeted single-instance choice as useful.
2. **Disconnect during transform:** Pause with `worker-1/socket-old` present, remove it while held, release; expect `DESTINATION_OFFLINE` (via `processPeerMessageForAck`) and **zero** physical deliveries. Preserve existing behavior and its prior test.
3. **Same logical EServer instance replaced:** Pause with an explicit destination `toInstanceId: worker-1` and connection `socket-old`; remove old identity, register same `worker-1` with `socket-new`; release. Assert whether current code delivers to `socket-new` with the same logical instance, and capture exact ACK. Distinguish **observed late-binding** from any proposed affinity policy. No production fix.
4. **Untargeted EServer becomes ambiguous:** Pause with exactly one EServer, then add `worker-2/socket-two` while transformation is pending; release. Determine current ACK/error classification (`DELIVERY_FAILED` is hypothesized, not an already-proven result) and assert **zero** socket deliveries. Contrast with ambiguity present **before** transformation, currently `AMBIGUOUS_DESTINATION`.
5. **Untargeted EServer replaced by a different sole instance:** If covered without adding significant harness complexity, pause with sole `worker-1/socket-old`; remove it and add sole `worker-2/socket-new`; release; record whether the untargeted message routes to the new logical instance. This is an optional high-value extension, not a policy decision.
6. **Delivery classification boundaries:** Record the difference between post-transform `isConnected` returning false (offline ACK) and late `deliver()` throwing (delivery-failed ACK); ensure existing timeout/event/metadata semantics are not inadvertently changed.

Avoid making unsupported claims about real concurrent production topology. These tests are deterministic modelled directory/transform interactions, not end-to-end remote-network proof.

## Required evidence and policy questions

For each scenario document initial topology, suspended point, topology mutation, final lookup/connection ID, ACK code/error and delivery count. Explicitly distinguish direct test observations from assumptions about real transport timing. Highlight decisions for later approval, **do not choose them**:

- **Affinity:** should a message remain bound to original physical connection, to logical EServer instance, or resolve to the latest matching identity at delivery time?
- **Untargeted semantics:** if the sole EServer changes between validation and delivery, is delivery to a different logical instance permitted?
- **Error classification:** should late-created ambiguity remain `DELIVERY_FAILED` (current predicted path) or become `AMBIGUOUS_DESTINATION`? Do not change existing `PeerMessageAck` contract without explicit approval.
- **In-flight delivery:** do not conflate this TD04 window with TD03's already-started outbound delivery cancellation.

## Verification

Use Node `22.23.5` if available. Run and report *fresh* exact outcomes:

1. Focused `node --import tsx --test tests/peer-message-service.test.ts tests/peer-destination-policy.test.ts` (plus any newly added TD04 test file if separate).
2. `npm run check:architecture`.
3. `npm run typecheck`.
4. `npm run build`.
5. `npm test -- --test-concurrency=1`.
6. `npm --prefix testing run test:playground`.
7. `git diff --check` and `git status --short`.

If a sandbox restriction prevents local socket tests, report the exact failure and use only an explicitly authorized narrow rerun. Never claim PASS based on historic results or swallow a failing assertion. Tests must remain GREEN while asserting current behavior; if a scenario cannot be reproduced, report it as unverified rather than fabricating an expectation.

## Deliverables and stopping condition

- Create root report `R7_2_C_DESTINATION_TOPOLOGY_CHARACTERIZATION_REPORT.md` with baseline, changed-file inventory, exact scenario matrix, observed behavior, policy questions, verification commands/results and evidence limitations.
- Update **only** TD04 in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` and `docs/architecture/TECHNICAL_DEBT.md`, plus the current R7.2 checkpoint line in `docs/architecture/PROJECT_STATE.md`.
- Production behavior, public contracts, ACK codes, M05/M06 lifecycle, TD02 policy and TD03 remediation must remain untouched. TD02 remains OPEN (Option B); TD03 remains partially remediated with known limits.
- No commit/push, no TD04 remediation, no R7.3. **STOP for architectural review.**
