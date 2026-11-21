# R7.4 — Explicit Inbound Operation Dispatch

## Checkpoint

- Tested source baseline: `02bba560ec47572c54a6c6b51ea1068a0a612793` on `main`.
- Initial working tree contained one pre-existing untracked file, `prompts/R7_4_EXPLICIT_INBOUND_OPERATION_DISPATCH_CODEX_PROMPT.md`; it was preserved.
- Runtime: Node `v22.23.5`.
- Changed paths: `src/infrastructure/socket/peer-gateway.ts`, `tests/peer-message-handler.test.ts`, `docs/architecture/TECHNICAL_DEBT.md`, `docs/architecture/PROJECT_STATE.md`, and this report.
- No workflow implementation, socket authentication/lifecycle, protocol, network schema, application export, or public ACK contract changed. No production PServer or external service was contacted.

## Dispatch boundary

`createPeerMessageHandler` in M05 accepts the raw value plus the authenticated peer and optional authenticated instance. It inspects only the raw payload type to preserve the old operation selection; it does not parse or validate the envelope. Capabilities are wired once from existing M12/M13 workflows and M10 fallback in `attachPeerGateway`.

| Order | Authenticated identity | Raw payload type | Selected capability |
|---|---|---|---|
| 1 | `aaui` | `demo.resource-selection` | M13 `receiveSelection` |
| 2 | `pserver` | `demo.task.request` | M12 F08 `receiveTask` |
| 3 | `eserver` | `demo.task.result` | M12 F09 `receiveTaskResult`, with authenticated instance ID |
| 4 | Any other combination | Any | M10 `processPeerMessageForAck`, with authenticated sender/instance |

### Before → after

| Ingress | Before | After |
|---|---|---|
| ACK-bearing `/peers` | M05 callback checked ACK, then local raw sender/type branches selected M13, M12 or M10 | M05 callback still checks ACK; calls the single composed handler with authenticated socket peer and instance |
| PServer `peer:message` | M04 readiness/ACK handling called `receiveFromPServer`; M05 repeated the same local branch function using authenticated `pserver` | M04 behavior is unchanged; `receiveFromPServer` calls the same composed handler as `/peers` |
| No ACK callback | M05 skipped processing; ready M04 logged then skipped gateway; pre-ready M04 kept its existing readiness-specific behavior | Unchanged |

Handler ordering is unchanged. A matching sender/type still delegates malformed input to the selected workflow, preserving workflow-specific validation ACKs. A wrong authenticated sender falls through to M10 even if the envelope claims a special operation or spoofs `from`. The async handler retains rejected-Promise behavior for synchronous capability errors, as did the prior `async handleMessage` function.

## Evidence and compatibility traceability

| Contract | Evidence |
|---|---|
| M13 resource selection routing, receipt ACK, persisted selection and deferred forwarding | Focused local Socket.IO test `tests/aaui-resource-selection-routing.test.ts`; workflow behavior in `tests/resource-selection-workflow.test.ts` |
| M12 F08/F09 receipt ordering, persistence, notifications, deferred forwarding/failure mapping and authenticated instance | `tests/task-received-routing.test.ts`, `tests/pserver-aaui-task-roundtrip.test.ts`, `tests/task-workflow.test.ts` |
| M10 fallback and R7.2 logical-instance routing | Existing generic service/destination tests remain in the full backend suite; no routing code changed |
| Selection order, one chosen capability, spoofed `from` ignored, instance propagation, malformed matching envelope delegated without prevalidation | New deterministic tests in `tests/peer-message-handler.test.ts` (2 cases) |
| M05 no-ACK callback gate | Existing loopback case `peer message ingress without an ACK callback is skipped; ACK-bearing ingress is processed` in `tests/peer-connections.test.ts` |
| M04 readiness/no-ACK distinction | Existing cases in `tests/pserver-protocol.test.ts`, including `ready inbound peer message without ACK callback does not reach gateway`; unchanged source |

R5-D05 explicit handler composition is now exercised at the M05 ingress seam. R5-D06 separate ACK semantics and R5-D08 external contract preservation remain unchanged. No workflow error, receipt status, scheduling order, event, payload, transform behavior or `PeerMessageAck` shape was revised. Tests establish repository behavior, not compatibility with unknown external clients.

## Architecture and verification

- Focused command: `node --import tsx --test tests/peer-message-handler.test.ts tests/peer-connections.test.ts tests/aaui-resource-selection-routing.test.ts tests/task-received-routing.test.ts tests/pserver-aaui-task-roundtrip.test.ts tests/task-workflow.test.ts tests/resource-selection-workflow.test.ts` — **26/26 passed**. Loopback tests required authorized execution after sandbox listener restrictions.
- `npm run check:architecture` — **passed**: 52 files, 113 edges (51 runtime, 62 type-only), zero runtime file SCCs; one existing module runtime SCC M10↔M12↔M13 and one all-import SCC M06↔M10↔M11↔M12↔M13. The checker emitted its existing warning that M10↔M11 is type-only, not a runtime SCC.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm test -- --test-concurrency=1` — **182/182 passed**.
- `npm --prefix testing run test:playground` — **32/32 passed**.
- `git diff --check` — passed.
- A first focused attempt under Node 24 hit the installed `better-sqlite3` ABI mismatch. Rerun with the repository Node 22.23.5 passed; an unprivileged Node 22 loopback attempt was blocked by sandbox listener restrictions, then passed with narrowly authorized local loopback execution.

## Disposition

TD09 is **implemented and verified for current behavior**. The explicit dispatcher reduces orchestration coupling while M05 remains the authenticated ingress owner and M10/M12/M13 remain responsible for their established processing. Existing M10/M12/M13 module aggregation SCC is reported by the checker and was not expanded into a new file-level runtime cycle. No further R7.4 blocker was found. Recommend closing R7.4/TD09 after review; stop here pending reviewer approval. No commit/push and no R7.5 work.
