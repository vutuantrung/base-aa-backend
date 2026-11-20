# R6.3.B — Peer Messaging Boundary Extraction

Repository: `vutuantrung/base-aa-backend`  
Branch: `main`  
Architecture baseline: `82b6cb68e2016594d42731c2ae022ce43b638557`  
Implementation baseline: `b6c62e0911de14db3ac20d71072220d409abe931`  
Verification baseline: 98 tests (66 backend + 32 playground), Node.js 22.23.5.

## 1. Objective

Establish M10 — Peer Messaging as an explicit application boundary. Extract remaining generic peer-message destination policy, delivery orchestration and processing-result/ACK mapping from `peer-gateway.ts`. Retain M09 Generic Messaging as a separate system. Do not perform M11 transformation extraction or M12/M13 business workflow extraction.

Verify HEAD and working tree first. Read AGENTS.md, R6.2.A/B/C and R6.3.A reports and available architecture documents. Preserve unrelated working-tree changes and prompt files. If R0–R5 documents are absent, use the confirmed constraints in this prompt and reports; do not invent missing decisions. Report baseline discrepancies before proceeding with incompatible changes.

## 2. Responsibility audit

Inspect `src/modules/peer-messaging/{contracts,peer-message-service,peer-directory,transformation-registry}.ts`, `src/infrastructure/socket/{peer-gateway,socket-peer-gateway,socket-gateway}.ts`, `src/modules/pserver/pserver-protocol.ts`, `src/app/create-app.ts`, and relevant tests and playground flows.

Map each responsibility to M05 (physical socket mechanics), M06 (logical identity), M10 (generic peer messaging), M11 (transformation), M12 (task workflow), M13 (resource selection), or composition. Identify concrete consumers and runtime wiring. Do not move code merely to make folders look cleaner.

## 3. M10 processing boundary

- Retain `PeerMessageService.process(value, authenticatedFrom, authenticatedInstanceId?)` and its public constructor, `transformations` property, existing `PeerDelivery` and `PeerMessageError` compatibility unless a compatible extension is needed.
- Preserve strict schema/default values, sender mismatch checks, `toInstanceId` restriction, authenticated source instance metadata, UUID/timestamp generation and cloning semantics.
- Extract intent-revealing methods where useful; keep `process` readable. Preserve validation order and exact error mapping.
- Keep transformation resolution/execution behavior intact for R6.3.C, including original-envelope matching, priority order, cloning, processing metadata, failure mapping, and destination recheck after asynchronous transformation. Do not move or redesign transformation registry/execution now.
- Preserve `beforeDeliver` optional hook and local `to: aab` behavior (no outbound delivery).
- Move generic processing-result mapping (success/error PeerMessageAck and associated diagnostics) to an M10-owned function or service if appropriate. Preserve existing fallback error code/text. Do not move special task/result/resource-selection dispatch into a new general pipeline. Keep their existing branch precedence and workflow-specific receipt ACKs in the existing gateway until R6.4 / R7.4.

## 4. Destination policy and delivery integration

Extract the generic peer destination policy currently embedded in `attachPeerGateway` / `PeerDelivery` callbacks into M10. Use narrow capabilities to consume M06 directory lookup/list/availability and outbound peer transmission. M10 must not import Socket.IO, concrete socket gateway, HTTP, persistence, or task/resource stores. Keep physical socket lookup, event emission, transport ACK mechanics in infrastructure; keep protocol-specific PServer session readiness and wire delivery in M04/M03. Do not expose socket objects or create a second logical identity registry.

Preserve existing semantics:

- PServer uses the registered external transport and its readiness; AAB is local.
- EServer explicit instance targeting, single-instance fallback, multi-instance ambiguity error and zero-instance offline handling; SServer and AAUI single peer lookup.
- Preserve distinction between logical availability and physical connection lookup, including current error classifications when a destination disappears. Do not silently fix handshake reservation/cleanup or reconnection races in this phase.
- Inbound peer message processing and outbound delivery are distinct; outbound must never re-enter inbound processing.
- Socket delivery uses `peer:message`, 5,000 ms timeout, and existing positive/negative ACK interpretation. PServer delivery retains M04 capability behavior.
- Keep PServer transport registration per application and single ownership; document where mutable capability reference lives. Preserve `attachPeerGateway`, `attachSocketServer`, `registerPServerTransport`, and `receiveFromPServer` compatibility.
- Retain existing ACK callback-dependent processing behavior for both socket and PServer ingress; explicitly record no-ACK processing as deferred debt, not a feature. No new ACK protocol or retry policy.

Choose the smallest meaningful extraction: a policy/service plus a narrow technical delivery adapter if needed. Prefer a single coherent M10 flow over duplicating `PeerMessageService`. Avoid speculative generic routers, event buses, dependency containers or empty skeletons.

## 5. Preserve deferred responsibilities and external behavior

Keep task request/result (F08/F09) and resource selection persistence, validation, asynchronous forwarding, receipt ACK, delivery-status updates, lifecycle events and snapshots in existing ownership. They may consume the extracted M10 capability with minimal wiring changes. Preserve persistence-before-receipt-ACK, independent destination ACK, exact current target selection timing, `setImmediate` behavior, and error handling including metadata write failures. Retain F03 SServer status and F04 EServer VM info flows, presence and AAUI reconnect/refresh safety checks, ping/welcome events, feature flags and authentication. Do not alter M09, M03/M04 session handling, M05/M06 lifecycle policies, schemas, dependencies or environment behavior.

## 6. Verification

Add focused tests for M10 generic destination policy using fake transport/directory capabilities without Socket.IO, including explicit target, single target, ambiguous/missing target, PServer ready/offline, local AAB, and delivery failure/error mapping. Verify destination recheck after async transformation and authenticated source identity preservation (reuse existing coverage where sufficient). Verify generic processing ACK mapping differs from workflow receipt ACK. Add or strengthen tests for existing semantics, not new policies. Preserve all 98 baseline tests and meaningful assertions; do not weaken existing assertions. Verify real peer/PServer integration, F03/F04/F08/F09, resource-selection workflows and snapshots with local mocks.

Run Node.js 22:

- `npm run typecheck`
- `npm run build`
- `npm test -- --test-concurrency=1`
- `npm --prefix testing run test:playground`

Report actual counts, failures, blockers and limitations. Do not claim production PServer verification from mocks.

## 7. Acceptance criteria

- M10 owns generic peer messaging policy independent of concrete transport and business persistence.
- Physical delivery remains behind narrow technical capabilities; M06 remains sole logical identity owner; no duplicate state or runtime cycles.
- Existing public paths/contracts, event names, payloads, ACK semantics, timeouts and workflow behavior are preserved.
- M11 transformation and M12/M13 workflow responsibilities remain deferred, without moving them into M10 through convenience abstractions.
- Intent-revealing methods and AGENTS.md TypeScript rules observed; no unrelated changes.
- Full regression suite passes or actual blockers are explicitly reported.

## 8. Deliverable

Create `R6_3_B_PEER_MESSAGING_REPORT.md` with verified baseline, responsibility inventory before/after, source tree, public interfaces and runtime composition, dependency direction, state ownership, message lifecycle and error/ACK semantics, preserved workflows, changed files, test results, remaining debt and readiness for R6.3.C. Identify any behavior/type-contract differences, even if intentional. Do not claim completion of M11 or R6.4.

Out of scope: M09 redesign, MessageBus activation/removal, M11 extraction, M12–M16 extraction, R7.1–R7.9 reliability/contract changes, automatic `.env`, ARM and Node 24 compatibility.

Do not commit or push. Stop after R6.3.B.
