# R7.3 Compatibility Baseline — TD05–TD08

Baseline source: committed R7.3.A HEAD `8044bfe60735d3fe13ab9dadac51c94a833e24d7`; approved decisions R7.3-D01 through D04 are recorded in [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md). R7.3.A characterization: [decision report](../../R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_REPORT.md). Consolidation verification: [R7.3.B report](../../R7_3_B_COMPATIBILITY_CONSOLIDATION_VERIFICATION_REPORT.md).

“Tested” means an assertion directly covers the stated result in a local test. “Source” means behavior is visible in current code, but the specific combination is not asserted. Neither establishes compatibility with unknown external clients.

## TD05 — ACK-gated ingress (R7.3-D01 = A, approved preserve-current)

| Path and state | Callback / observable outcome | Processing and ACK | Evidence |
|---|---|---|---|
| M05 `/peers`, authenticated peer, no ACK callback | `peer-gateway.ts:120–122` receives the event; handler does not invoke `handleMessage`. No response is sent. | No schema validation, transformation, workflow dispatch or forwarding. | Tested by local Socket.IO loopback + transform side effect: `tests/peer-connections.test.ts` “peer message ingress without an ACK callback…” |
| M05 `/peers`, ACK callback present | Callback is invoked with `handleMessage`'s existing `PeerMessageAck`. | Normal routing / validation and associated side effects occur; success/error shape is unchanged. | Local Socket.IO loopback in the same test; existing error mapping remains in `peer-message-service.test.ts`. |
| M04 PServer ingress, session not ready, no callback | Protocol returns without gateway call or log. There is no callback to answer. | No processing or ACK. | Fake transport test `tests/pserver-protocol.test.ts` “protocol returns the pre-ready inbound ACK…” now covers callback-absent and callback-present cases and asserts no receive log/gateway call. |
| M04 PServer ingress, session not ready, callback present | Callback receives `{ ok:false, code:'UNSUPPORTED_DESTINATION', error:'PServer session not ready' }`. | Gateway is not called; no receive log. | Deterministic fake assertion in the same pre-ready test. |
| M04 PServer ingress, session ready, no callback | Protocol logs `RECEIVE PServer peer:message`, then optional callback invocation is absent. | No gateway call, peer processing or ACK. | Fake transport test “ready inbound peer message without ACK callback…” asserts log and no gateway call. |
| M04 PServer ingress, session ready, callback present | Gateway result is passed to callback. | Existing `PeerMessageAck` success/error behavior retained. | Fake transport test “protocol preserves task dispatch validation and inbound peer message ACK delivery”. |

R5-D06 (Separate Semantics) is consistent with preserving the M04/M05 distinction; it does not independently specify missing-callback behavior. M04 evidence is a fake transport, not a live PServer integration. No retry, synthetic ACK, fire-and-forget processing or implicit rejection is approved.

## TD06 — Transformer ownership and payload semantics (R7.3-D02 = A, approved preserve-current)

| Boundary | Current contract | Evidence |
|---|---|---|
| Registration / ownership | Registry validates nonblank `id`/`payloadType`, finite `priority`, and duplicate ID, then stores the supplied mutable object reference (`transformation-registry.ts:41–48`). Post-registration match fields, priority and transformer changes are visible. | `tests/transformation-executor.test.ts` “registry keeps the registered rule object by reference…” |
| Matching / order / resolution | Matching uses original `from`, `to` and payload type; order is ascending priority then ID. Execution resolves once; already selected rule references still execute after unregister. | Same test file: matching test, “executor awaits async rules sequentially…”, and “resolution occurs once…”. |
| Transform input / output | Each transformer receives a cloned message and returns payload only. Executor requires a present result, nonblank string `type`, string `version`, and defined `data`; it accepts empty/whitespace version and `data:null`. It does not apply the incoming Zod version trim/min/max checks to output or reject unknown output keys. | Existing blank-version/null-data and malformed-output test; code at `transformation-registry.ts:70–84`. Unknown-key behavior is source-inferred, not separately asserted. |
| Envelope metadata | Transforms cannot replace M10-owned message/routing fields through the payload return; service retains authenticated source instance, correlation/causation IDs and processing metadata. | `tests/peer-message-service.test.ts` routing metadata and “transformer envelope mutations do not replace M10-owned message metadata”. |

Approval preserves mutable references and present output checks; it does not say they are ideal. No external rule producer or downstream payload corpus is available. Tightening or snapshotting requires a new decision and consumer assessment.

## TD07 — Optional HTTP capability response matrix (R7.3-D03 = A, approved preserve-current)

All `/api` paths pass `createApiAccessMiddleware` before the router (`http-server.ts:24–28`). API key validation runs before the SQLite-disabled check (`http-middleware.ts:3–8`). The matrix distinguishes tested combinations from code-derived combinations.

| Request / composition | Status and body | Evidence |
|---|---|---|
| `/health` | `200`, JSON `{status:"ok"}`; public. | Tested `tests/http-gateway.test.ts`. |
| Protected `/api/sessions`, no/wrong API key, SQLite disabled | `401`, JSON `{error:"unauthorized"}`; auth wins. | Tested `http-gateway.test.ts`; catalog protected paths similarly tested in `aa-catalog-boundary.test.ts`. |
| Protected SQLite-backed path, valid key, SQLite disabled | `503`, JSON `{error:"SQLITE_DISABLED"}` on paths matched by middleware. | Tested sessions and catalog path variants; usage path follows the same source middleware rule (source-derived unless listed in those exact tests). |
| Sessions port absent, SQLite enabled/not disabled | GET `/api/sessions`: `200`, empty body; valid POST: `201`, empty body. GET valid ID with no row: `404`, JSON `{error:"not found"}`; invalid ID: `400`, JSON `{error:"invalid id"}`. | Tested `tests/session-http-api.test.ts` “direct createHttpApp calls preserve undefined optional-session repository behavior” and route validation test. |
| Usage port absent, SQLite enabled/not disabled | GET `/api/process-usage`: `200`, empty body; valid POST: `201`, empty body. Invalid query PID still `400`, JSON `{error:"invalid pid"}`. | Tested `tests/process-usage-http-api.test.ts` absent-port case. |
| Catalog port absent, SQLite enabled/not disabled | Catalog router is not mounted; `/api/aa` returns Express default `404` HTML. | Test asserts status only in `tests/aa-catalog-boundary.test.ts`; exact body is not pinned. |
| Catalog mounted, record missing | `404`, JSON route-specific errors: `aa_not_found`, `browser_not_found`, or `extension_not_found`. Missing extension children also return `extension_not_found`. | Tested in `aa-catalog-boundary.test.ts` catalog response/parent policy test. |
| Exact `/api/extension` with valid key, even when SQLite disabled | `404`, default HTML containing `Cannot GET /api/extension`; it does not match middleware's `/extension/` prefix gate. | Tested status, content type and message in the disabled catalog path matrix. Full HTML bytes are intentionally not fixed. |
| `/api/extension/` or `/api/extension/:id` with SQLite disabled | `503`, JSON `{error:"SQLITE_DISABLED"}` after valid auth; missing key gets `401` first. | Tested `aa-catalog-boundary.test.ts` disabled path loop. |

Optional session/usage routes remain mounted when ports are absent; catalog routes are conditional on the catalog capability. These cases are not interchangeable. Real deployment configuration/external HTTP consumers were not surveyed.

## TD08 — Process usage validation and response (R7.3-D04 = A, approved preserve-current)

| Ingress | Accepted behavior / response | Evidence |
|---|---|---|
| HTTP POST `/api/process-usage` | Requires positive integer `pid`, finite nonnegative `cpu` (fractional values accepted), nonnegative integer `memory`; default Zod object strips unknown keys, including `id`. Valid create returns `201` with repository response. Invalid request returns `400` with flattened Zod field/form error body. | `tests/process-usage-http-api.test.ts` post validation case; test input includes extra field and `id`. |
| HTTP GET filter | Applies `Number(query.pid)` then safe-integer-positive validation: `1e0` selects PID 1; invalid/empty/negative/fractional/unsafe values return `400 {error:"invalid pid"}`. | GET filter test in same file. |
| Direct M15 SQLite repository | `NewProcessUsage` is a compile-time shape only. Runtime extra fields pass through result spread; current SQLite accepts tested negative PID and fractional memory. Extra fields are returned immediately but not selected from storage. | `tests/process-usage-repository.test.ts` raw values/extra fields case. |
| Direct create with runtime `id` | Insert uses DB-generated ID; returned `{ id: generated, ...value }` allows a runtime `value.id` to overwrite only the immediate result. Test observes returned ID 900 while stored ID is 1. HTTP strips `id`, so the current HTTP path does not expose this mismatch. | New committed R7.3.A test “runtime caller-supplied id overwrites…” plus HTTP unknown/id stripping test. |

This ID mismatch remains an approved compatibility behavior for direct callers; it is not a storage migration or a claim that immediate and persisted rows agree. External/direct repository consumer inventory remains unknown. No validation, response-shape or schema change is authorized here.

## Known repository callers and evidence limits

- M05 `attachPeerGateway` consumes `PeerMessageService` and exposes authenticated `/peers` events; tests use local Socket.IO clients.
- M04 PServer protocol is wired through the M03 connector and M05 peer-gateway capability; tests use `FakeTransport`, not a live PServer.
- `createApplication` owns the `TransformationRegistry`; M05 peer gateway executes it. Repository tests cover transforms, not external rule producers.
- M02 injects optional session, usage and catalog repositories into M07. Local tests use fakes, in-memory SQLite and local HTTP.
- Known repository callers are limited to these composition paths and tests found in the targeted search. External peer emitters, HTTP clients, transform authors and direct M15 consumers are **unknown**; compatibility with them is not verified.
- TD12 M16 stored JSON, raw IDs and orphan/relationship policy are **deferred to R7.5**. No catalog data/schema migration is part of R7.3.
