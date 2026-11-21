# R7.3.A — Messaging Contract & API Compatibility Decisions

## Baseline and scope

- Branch `main`; source baseline `986967fcae9176e87e53c792b07e9e68374ad74e` (`updated 11212058`), matching reviewer-verified HEAD.
- Initial worktree had no tracked/staged edits; the supplied untracked `prompts/R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_CODEX_PROMPT.md` was preserved.
- Added focused current-behavior tests and updated only this report, `PROJECT_STATE.md`, and TD05–TD08 rows. No production code, public contract, schema, policy or dependency changed. No commit/push.
- R7.2 approval is now recorded as **CONDITIONALLY CLOSED**. TD02 remains OPEN (Option B), TD03 PARTIALLY REMEDIATED, and TD04 retains deterministic-only and lookup-to-send limitations.

## Contract compatibility matrix

| Debt / boundary | Observed current behavior and references | Coverage / evidence level | Compatibility risk and gap |
|---|---|---|---|
| **TD05 — M05 `/peers` ingress** | `peer-gateway.ts:120–122` calls `handleMessage` only when the Socket.IO ACK argument is a function. With no callback, validation, transformation and workflow dispatch are skipped and there is no ACK. With a callback, existing `PeerMessageAck` success/error results are returned. | New `peer-connections.test.ts:47–92` uses a local Socket.IO client and a transform side effect to prove no-ACK skip and ACK-bearing processing. This is loopback evidence, not production-client behavior. | A caller that emits without ACK receives no indication that the message was skipped. Processing without a callback would introduce side effects without a receipt. External emitter behavior is not surveyed. |
| **TD05 — M04 direct PServer ingress** | `pserver-protocol.ts:76–85`: before session readiness, callback presence controls whether `UNSUPPORTED_DESTINATION` is sent; gateway is not called. When ready, `RECEIVE PServer peer:message` is logged even with no callback, but `gateway.receiveFromPServer` is invoked only inside `ack?.(...)`, so no callback means no gateway processing or ACK. With callback, gateway `PeerMessageAck` is returned. | `pserver-protocol.test.ts:425–434,491–505` uses a deterministic `FakeTransport`; the no-ACK case asserts the receive log and no gateway call. There is no live PServer test. | The M04 diagnostic log differs from M05’s no-ACK path. The current paths have related but not identical pre-ready and observability semantics. Preserve R5-D06 separate ACK semantics; it does not decide callback absence. |
| **TD06 — M11 transformation registry** | `transformation-registry.ts:41–56` validates initial `id`, `payloadType`, `priority` and duplicate ID, then stores the original rule object. Later mutations to match fields, priority and transformer are observed. `executeTransformations` resolves once (`:61–67`); the selected references still execute after unregister. Rules run sequentially against cloned messages; matching uses original envelope fields. | New `transformation-executor.test.ts:39–66` characterizes post-registration mutation. Existing tests `:68–119,147–208` cover match/order, clone isolation, output checks, resolve-once and unregister behavior. `peer-message-service.test.ts:12–26,134–163` covers routing metadata stability. Deterministic unit evidence only. | No immutability or snapshot guarantee exists. Transformer output is checked for nonblank string `type`, string `version`, and defined `data`; `version: ''` and `data: null` are accepted. This is not full input-schema validation; input contracts trim/bound version while transform output does not. Tightening may reject existing rules or payloads. |
| **TD07 — M07 optional HTTP capabilities** | `http-server.ts:24–28` applies auth/SQLite middleware before routes. `http-api-router.ts:27–49` mounts session/usage routes regardless of optional port; absent ports yield `res.json(undefined)`: GET 200 empty body and valid POST 201 empty body. Missing session ID returns JSON 404; invalid ID 400. Catalog router mounts only if `catalog` exists; absent route is 404. Mounted catalog missing records return route-specific JSON 404. `http-middleware.ts:3–8` gives API key 401 precedence over SQLite-disabled 503 (`SQLITE_DISABLED`). Exact `/extension` is outside the `/extension/` gate and returns 404; `/extension/x` is gated. | Existing local HTTP tests: `session-http-api.test.ts:32–103`, `process-usage-http-api.test.ts:54–136`, `http-gateway.test.ts:30–42`, `aa-catalog-boundary.test.ts:196–276`. Fakes and SQLite test instances; no production service. | “Absent port”, “SQLite disabled”, “unmounted catalog”, “missing catalog record” and “exact `/extension` path” are separate outcomes. Uniform 404/503/empty changes would alter public status/body behavior. External consumer dependence is unknown. |
| **TD08 — M15 process usage** | HTTP POST schema `http-api-router.ts:21,46–50` requires positive integer PID, finite nonnegative CPU (fraction allowed), nonnegative integer memory; default Zod object strips unknown keys including `id`. GET PID applies `Number()` then safe positive integer check (`:41–44`), so `1e0` means PID 1. Repository `process-usage.ts:14–16` passes raw PID/CPU/memory to SQLite and returns `{ id: generated, ...value }`. Direct negative PID/fractional memory are accepted in current DB tests. A runtime extra `id` overwrites only the immediate response; the database retains its own generated ID. | Existing repository/API tests plus new repository characterization at `process-usage-repository.test.ts:68–81`; HTTP test adds caller `id` and confirms stripping at `process-usage-http-api.test.ts:80–98`. In-memory SQLite and local HTTP. | HTTP callers cannot currently induce the ID mismatch through this route, but direct repository/runtime callers can. Tightening repository validation or changing immediate response shape may affect internal consumers; public external consumer usage is unknown. |
| **TD12 adjacency** | M16 catalog uses JSON DTO payloads and raw IDs/extension relationships as separately tracked in TD12. M07 catalog route behavior depends on those reads. | Existing `aa-catalog-boundary.test.ts` characterizes current route and repository behavior; this checkpoint did not add catalog schema tests. | Any catalog schema, ID, orphan or persisted-data validation/migration policy remains R7.5 work; do not combine it with R7.3 HTTP route decisions. |

### Qualitative risk and approval

- **TD05 — medium:** no-ACK peers receive no result and current processing is skipped; changing this can create side effects without a receipt. Any behavior change needs product approval for peer emitters and PServer clients.
- **TD06 — medium:** mutation and permissive output-version checks can change transformed payloads at runtime; snapshotting or strict rejection requires transformer-owner and downstream-consumer approval.
- **TD07 — medium/high compatibility exposure:** route status and body are directly observable to clients; any normalization requires API product/consumer approval. No external consumer inventory was available in this audit.
- **TD08 — medium for direct repository callers, low for the current HTTP route:** HTTP strips `id`, while direct runtime calls can create an immediate/stored ID mismatch. Any direct validation/return contract change requires repository-consumer review; route contract changes require API approval.
- **TD12 — deferred migration risk:** catalog validation or stored JSON/ID changes can affect existing persisted rows and orphan relationships; require the separate R7.5 schema/data policy and migration plan.

## Pending decision package

All proposed defaults below preserve current behavior. **No decision is approved by this report.** R5-D05 (Explicit Handler Composition), R5-D06 (Separate Semantics) and R5-D08 (Preserve Existing Contracts) constrain this review but do not decide the detailed policies below.

### R7.3-D01 — No-ACK ingress semantics (PENDING)

- **A — Preserve skip behavior (proposed default):** no ACK callback means no M05 message processing; M04 retains its readiness-specific early return and ready-path receipt log without gateway processing.
- **B — Process without ACK:** permits workflow/delivery side effects with no caller receipt; duplicates/retries become harder to reason about.
- **C — Explicitly reject or require ACK-capable ingress:** changes transport/error behavior and may affect existing emitters.
- **Ask:** approve A, B or C. Any behavior change requires product/consumer confirmation for M05 peer emitters and PServer event clients.

### R7.3-D02 — Transformation mutability and output/version policy (PENDING)

- **A — Preserve references and current checks (proposed default):** callers may mutate registered rules; current execution resolves once; blank output version and null data remain accepted.
- **B — Snapshot/freeze rule data at registration:** mutation after registration no longer changes behavior; consumers relying on live mutation must update.
- **C — Tighten output validation:** define nonblank/bounded version, unknown-field and `data` rules explicitly; may reject existing transform outputs.
- **Ask:** approve A, B or C and, for C, define the exact output schema. Product approval is required before rejecting previously accepted transformed payloads.

### R7.3-D03 — Optional HTTP capability status/body policy (PENDING)

- **A — Preserve exact current per-route matrix (proposed default):** empty session/usage success when port absent; 404 for unmounted catalog; route JSON 404 for missing catalog rows; 503 when SQLite is disabled on gated paths; auth 401 first.
- **B — Map absent ports to structured 503:** session/usage empty success becomes unavailable; disabled behavior stays 503.
- **C — Hide absent capabilities with 404:** changes route visibility while keeping auth precedence and separately deciding disabled-SQLite behavior.
- **Ask:** approve A, B or C and specify exact status/body for `/extension` and disabled modes. API product/consumer approval is required for status or response changes.

### R7.3-D04 — Process-usage validation and create response (PENDING)

- **A — Preserve layered validation and response behavior (proposed default):** HTTP remains strict/unknown-stripping; direct repository inputs remain permissive where SQLite allows; immediate runtime `id` overwrite remains documented.
- **B — Align repository with HTTP validation and return the persisted row:** reject runtime extras/ID and invalid PID/fractional memory; response ID matches storage, but repository callers may break.
- **C — Keep repository acceptance but return only persisted columns:** avoids response/storage ID mismatch while retaining some direct-write behavior; extra runtime fields disappear from immediate return.
- **Ask:** approve A, B or C and identify supported direct repository consumers. Product/API approval is required for route-visible response changes; repository callers need migration notice for B/C.

## Bounded R7.3.B proposal and no-go conditions

After decisions are approved, implement only selected TD05–TD08 behavior. Acceptance should retain deterministic regression tests for both ingress paths, transformation ownership/output cases, the full optional-capability route matrix and M15 validation/response behavior. Preserve R5-D05 explicit dispatch, R5-D06 distinct ACK semantics, R5-D08 existing contracts unless a recorded decision authorizes a change. No TD02/TD03 work, retries/durability/shutdown, workflow refactor, dependency restructuring, demo extraction or R7.4 dispatch change is included.

For any approved breaking option, first identify supported peer, HTTP and transformation consumers; record migration/deprecation or versioning expectations; then add contract tests for both the accepted new behavior and any promised compatibility window. No consumer inventory is available yet, so no specific versioning mechanism is assumed. Internal M15 repository callers must be identified before changing the direct create contract. Preserve current behavior by default until that review is complete.

No-go: any unapproved public ACK/HTTP/body/schema behavior change; ambiguous M07 disabled-versus-absent semantics; catalog schema/data migration (TD12, defer to R7.5); or a claimed end-to-end PServer guarantee without a real compatible test boundary. No production implementation begins until reviewer answers D01–D04.

## Fresh verification — Node 22.23.5

- `node --import tsx --test --test-reporter=spec tests/peer-connections.test.ts tests/pserver-protocol.test.ts tests/transformation-executor.test.ts tests/process-usage-repository.test.ts tests/session-http-api.test.ts tests/process-usage-http-api.test.ts tests/http-gateway.test.ts tests/aa-catalog-boundary.test.ts`: **exit 0, 50/50 passed**. It includes local loopback Socket.IO/HTTP, deterministic PServer fake, transformation unit tests and in-memory SQLite. Initial sandbox run failed at five loopback file processes; a permissioned run then exposed a malformed test fixture ID, corrected to a valid UUID; final permissioned rerun passed 50/50.
- `npm run check:architecture`: **exit 0**; 52 source files, 113 edges (51 runtime / 62 type-only); zero runtime file SCCs; existing M10↔M12↔M13 module runtime SCC is reported.
- `npm run typecheck`: **exit 0**. `npm run build`: **exit 0**.
- `npm test -- --test-concurrency=1`: **exit 0, 180/180 passed** (permissioned local loopback run).
- `npm --prefix testing run test:playground`: **exit 0, 32/32 passed**.
- `git diff --check`: **exit 0** after final edits. `git status --short`: **exit 0**; lists the five intended test files and two docs as modified, this report and the pre-existing prompt as untracked. No production PServer or external service was contacted.

## Changed paths and stop

- `tests/peer-connections.test.ts`, `tests/pserver-protocol.test.ts`, `tests/transformation-executor.test.ts`, `tests/process-usage-http-api.test.ts`, `tests/process-usage-repository.test.ts`
- `docs/architecture/TECHNICAL_DEBT.md` (TD05–TD08 only), `docs/architecture/PROJECT_STATE.md`
- `R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_REPORT.md`
- Pre-existing untracked prompt preserved: `prompts/R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_CODEX_PROMPT.md`.

**STOP for architectural decision review.** D01–D04 remain pending; no R7.3.B, R7.4, commit or push.
