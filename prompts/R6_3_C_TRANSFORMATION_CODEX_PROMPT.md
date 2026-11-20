# R6.3.C — Transformation Boundary Extraction (M11)

Repository: `vutuantrung/base-aa-backend` | Branch: `main`
Architecture baseline: `82b6cb68e2016594d42731c2ae022ce43b638557`
Implementation baseline: `a5671f5ff6b7401aa371d8e21208d692eceeeebf`
Verification baseline: Node.js 22.23.5, 74 backend + 32 playground = 106 passing tests.

## 1. Objective and preflight

Complete only M11 Transformation, the last R6.3 messaging boundary. Verify branch, HEAD and working tree; preserve unrelated user changes. Read AGENTS.md, R6.3.A/B reports, prior reports and available architecture records. Explicitly identify missing R0–R5 documents rather than inventing decisions. If baseline differs, report discrepancy before making changes.

Inspect `src/modules/peer-messaging/transformation-registry.ts`, `peer-message-service.ts`, `contracts.ts`, `peer-destination-policy.ts`, `src/app/create-app.ts`, `src/app/lifecycle.ts`, `src/examples/pserver-to-aaui.ts`, gateway composition and all transformation consumers/tests. Audit import paths and actual runtime registration. Do not redesign M09, M10, or workflows.

## 2. Extract transformation execution responsibility

- Keep one mutable rule registry per application. Preserve `TransformationRegistry`, `TransformationRule`, `MessageTransformer`, `TransformationContext`, register/unregister/resolve signatures and existing import paths (compatibility exports if necessary).
- Establish M11 ownership of rule matching and ordering, sequential execution, transformation-related cloning, transformed-payload validation, and execution result/processed rule IDs. Extract the existing loop from `PeerMessageService.process` into a cohesive executor or function; choose minimal abstraction based on actual code. A separate class is not required. Do not move files solely for visual symmetry.
- M10 retains strict incoming schema/authenticated sender validation, envelope construction (including initial payload clone), destination validation and readiness checks, local AAB handling, optional beforeDeliver hook, delivery orchestration and generic ACK mapping. M10 consumes M11 via a narrow capability; preserve public `PeerMessageService` constructor and `transformations` property, `ApplicationInstance.transformations` and existing callers. No second registry or copied rules state.
- M11 must not import concrete infrastructure, directory, gateway, workflow stores, or PeerMessageService. If error translation requires an M11-specific error, map it in M10 without a reverse runtime dependency or cycle. Preserve externally observable error classifications and messages, including existing fallback paths. Do not broaden catches silently.

## 3. Preserve exact baseline behavior

At baseline, `resolve(original)` is called once before the loop; rule matching uses original `from`, `to` and `payload.type`, not the output of prior transformers. Wildcards `*` apply to each of those match fields. Execution order is ascending numeric priority, then `id.localeCompare` for ties. Registration rejects empty/whitespace ID or type, nonfinite priority and duplicate ID; unregister retains boolean behavior. Preserve rule reference and resolution timing semantics, including mutation behavior; do not add registry freezing or caching as an unrelated change.

Each transformer receives a structured clone of the current message and a fresh context containing original from/to. Each returned payload becomes the next payload after structured cloning. Preserve sequential awaiting of sync and async transformers, isolation from input and routing metadata mutations, and the existing validation predicate: truthy result, nonblank string type, string version (do not newly forbid blank version), data not undefined (null remains allowed). Do not replace this with the stricter ingress Zod schema, normalize output, strip extra fields, or introduce new restrictions. Preserve the exact failure text `Transformer <id> failed: <message>` or `unknown error` for non-Error throws and `TRANSFORMATION_FAILED`. Initial envelope clone and registry resolve are outside the per-rule catch; preserve their existing error propagation rather than silently reclassifying them.

Preserve processing metadata `{ transformed, processedBy, timestamp }` even for no matching rules; timestamp is generated after execution. Ownership of final lifecycle metadata assembly can remain M10 with M11 supplying the execution result. No unnecessary extra asynchronous boundary on the zero-rule path if feasible; note any unavoidable timing difference explicitly. Keep message ID, timestamp, version, kind, sourceInstanceId, destination, correlation/causation IDs, channel and other envelope metadata unchanged. The destination is checked before transformation and rechecked after it; `to: aab` still transforms but does not deliver. Preserve beforeDeliver and delivery error mapping. Do not rerun ambiguity validation after async transforms: existing one-to-many race semantics are deferred reliability debt, not a new rule in R6.3.C.

## 4. Integration and scope boundaries

Preserve the shared registry instance created by createApplication and demo registration in lifecycle under ENABLE_TEST_PEERS; retain the demo PServer-to-AAUI modified-param transformation unchanged. No production plugin activation, dynamic event library, scripting, retries, schema changes, dependency changes, new protocols, or M09/M10 redesign. Preserve F03/F04/F08/F09 and resource selection, especially receipt ACK after persistence versus generic processing ACK after delivery. Preserve optional ACK behavior and connection/session state. ARM remains out of scope. Follow intent-revealing methods and AGENTS.md; avoid unsafe casts, speculative frameworks and unnecessary interfaces.

## 5. Verification

Add focused M11 tests independently of Socket.IO: rule registration/removal and matching including wildcard and tie order; original-envelope matching even when first transform changes type; sequential async execution; mutation isolation for envelope and nested payload; output cloning; no-match result/metadata; invalid output and thrown Error/non-Error failure; later rules not executed on failure. Cover existing accepted edge cases (blank version and null data) as appropriate. Verify service integration retains authenticated metadata, destination recheck, local AAB no delivery, beforeDeliver and error codes/ACK mapping. Use existing integration tests for demo and workflows. Avoid weakening assertions or double-counting reruns.

Run with Node.js 22:
- `npm run typecheck`
- `npm run build`
- `npm test -- --test-concurrency=1`
- `npm --prefix testing run test:playground`
- `git diff --check`

All 106 baseline tests must remain passing. Report actual new test counts and any environment blockers, local-bind permission requirements, or unverified production behavior separately. Do not claim tests not run.

## 6. Deliverable and stop condition

Create `R6_3_C_TRANSFORMATION_REPORT.md` with verified baseline, before/after responsibility mapping, source tree, public interfaces/compatibility, runtime composition and single registry ownership, dependency direction, exact transformation lifecycle and error behavior, changed files, verification results, remaining debt and R6.4 readiness. Describe any intentional deviations or decisions not explicitly approved. Include actual consumers and test evidence. Stop after R6.3.C; no M12–M16 extraction, no commit/push.
