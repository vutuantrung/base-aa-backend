# R7.8.C — Demo Registration Compatibility Evidence Matrix

**Baseline:** `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`, branch `main`.  
**Accepted decisions:** C-D01=A, C-D02=A, C-D03=A. Retain the documented compatibility exception, preserve implicit direct startup registration and keep rule state app-local. The rows below describe unchanged source behavior; accepted architecture does not imply extraction.
**Evidence labels:** **Observed** = source behavior; **Verified** = an existing test asserts the case; **Inferred** = follows directly from source/composition but lacks a direct end-to-end assertion; **Unverified** = source suggests behavior or external/runtime evidence is absent.

## Environment and composition cases

| Scenario | Current result | Evidence and status |
|---|---|---|
| CLI env absent | `resolveConfiguration({})` sets both `enableTestPeers` values false, PServer absent; CLI SQLite false. | `configuration.ts:19–48`; `tests/configuration.test.ts:43–54`; **Verified** for resolver, not a launched CLI process. |
| `ENABLE_TEST_PEERS='0'` | Both flags false; PServer absent. | Exact comparison at `configuration.ts:23`; added B assertion `configuration.test.ts:52`; **Verified** for resolver. |
| `ENABLE_TEST_PEERS='1'` | Both flags true and default PServer URL/path/VM supplied; env overrides honored. | `configuration.ts:23,35–48`; `configuration.test.ts:54,57–71,89–95`; **Verified** for resolver. |
| Other env strings (`'true'`, `'yes'`, empty string) | Not equal to `'1'`, so both false and no default PServer. | Source equality `configuration.ts:23`; `'true'` covered at `configuration.test.ts:89`; `'yes'`/empty not directly asserted; **Observed**, partially verified. |
| Programmatic false/false | `startApplication` creates app, callback sees no example rule; rule remains absent after listen. | B assertion `application-surface-compatibility.test.ts:126–134`; **Verified**. |
| Programmatic false/true | `createApplication` enables `/peers` and M12/M13 from nested true; it does not register the example. The combination through `startApplication` is not directly tested. | `create-app.ts:81–89`; `socket-gateway.ts:26–30`; surface test nested-true factory at `application-surface-compatibility.test.ts:67–79`; **Observed/Verified** separately, **Inferred** for start composition. |
| Programmatic true/false | Lifecycle registers after callback and before listen from top-level true; nested false means no peer gateway and no PServer connector. | `lifecycle.ts:7–14`; B test `application-surface-compatibility.test.ts:82–109`; **Verified**. |
| Programmatic true/true | Lifecycle registration and peer gateway are both enabled; gateway creates stores/runners; connector still depends on PServer config. | `lifecycle.ts:11`; `create-app.ts:81–89`; `peer-gateway.ts`; separate resolver and factory tests; no direct startApplication true/true assertion; **Observed/Inferred**. |
| Nested gateway, no PServer | `/peers`/M12/M13 composition exists; connector is undefined. | `create-app.ts:81–89`; surface test `:67–79`; **Verified** for factory construction. |
| Nested gateway plus PServer | Connector is constructed; physical connection readiness is separate and depends on connection/session protocol. | `create-app.ts:87–90`; surface test `:67–79`, `pserver-session.test.ts`; **Verified** for construction/covered protocol behavior. |
| CLI default PServer | Only exact env `'1'` adds default `127.0.0.1:3001`, path `/ws`, VM UDID `aab-demo-vm`; no default when disabled. | `configuration.ts:23,44–48`; configuration tests above; **Verified** resolver, live CLI connection is **Unverified** and is not attempted here. |
| SQLite defaults | CLI resolver disables unless `ENABLE_SQLITE='1'`; direct factory defaults SQLite on (`config.enableSqlite ?? true`). | `configuration.ts:40`; `create-app.ts` `sqliteEnabled`; surface/repository tests; **Observed/Verified**. |

## API, order, rule and failure cases

| Scenario | Current result | Evidence and status |
|---|---|---|
| Direct `createApplication()` | Creates an empty app-local registry; no example import/registration. | `create-app.ts:72,81–85`; B surface test `:67–79`; **Verified** no rule for nested-true/no-PServer case. |
| Direct `startApplication()` | Top-level true automatically registers; top-level false does not; this is observable exported behavior. | `lifecycle.ts:7–14`; B surface tests `:82–109,126–134`; **Verified** representative cases; external caller inventory is **Unverified**. |
| `onCreated` visibility | Callback runs on created instance before demo registration. It receives the same mutable instance returned on success and can inspect/change registry. | `lifecycle.ts:9–11`; B surface test `:91–105,128–132`; **Verified** visibility and same app identity; arbitrary callback mutation is **Observed**, its full consumer use is **Unverified**. |
| Registration vs `listen` | Registration happens synchronously before `listen`; a wrapper around listen observes the rule. | `lifecycle.ts:11–13`; B surface test `:94–105`; **Verified**. |
| Callback/registration exception | Both occur before the `try`; their exceptions bypass the `listen` diagnostic/rethrow catch and no `startApplication` rollback runs there. A callback can register a duplicate ID and make subsequent rule registration throw. | `lifecycle.ts:9–18`; registry duplicate behavior `transformation-registry.ts:32–39`; no direct startApplication failure test; **Observed**, exact cleanup consequences are a known concern, not test-proven. |
| Listen/start failure | The app’s listener start performs its own rollback; lifecycle catches listen rejection, logs and rethrows. R7.6 rollback tests exercise resource seam behavior, not the full exported start wrapper. | `lifecycle.ts:12–18`; `application-startup-rollback.test.ts`; **Observed/Verified** rollback contract at seam, wrapper-specific diagnostics **Unverified**. |
| Shutdown/signals | `main.ts` installs signal handlers before async start and stores the app from `onCreated`; M02 close is bounded by the approved R7.6 15-second default. | `main.ts`; `shutdown-signals.test.ts`; R7.6 policy; **Verified** signal controller, signal timing between callback and registration/listen is **Inferred** from synchronous order. |
| Rule match identity | ID `demo-pserver-to-aaui-modified-param`; `pserver`→`aaui`; `demo.modified-param`; priority 10. | `pserver-to-aaui.ts:7–14`; **Observed**; registration test asserts ID/priority and matching wire test establishes use. |
| Transform output | Preserves payload fields/data and adds `modifiedParam: "AAB modified: <originalParam>"`. | `pserver-to-aaui.ts:15–24`; `demo-pserver-aaui.test.ts:34–51`; **Verified** exact data and `processedBy`. |
| Nonmatch | Other payload type passes unchanged and `processing.transformed` is false. | `demo-pserver-aaui.test.ts:54–68`; **Verified**. |
| Invalid input | Non-string/missing `originalParam` throws exact text, executor wraps as `TransformationExecutionError` naming rule. | `pserver-to-aaui.ts:15–17`, registry executor; B test `demo-pserver-aaui.test.ts:71–80`; **Verified** exact executor error; wire ACK mapping for invalid demo input is **Unverified** by that test. |
| Priority/order | M11 filters exact from/to/type and sorts by ascending priority, then ID. Demo rule priority 10. Current test verifies metadata but not ordering against another matching rule. | `transformation-registry.ts:38–47`; rule test; **Observed**, competing-rule order for this example **Unverified**. |
| ACK identity and processing | Loopback PServer→AAB→AAUI test confirms successful ACK and returned/received message IDs equal; confirms `processedBy` exact rule ID. | `demo-pserver-aaui.test.ts:34–51`; **Verified**. |
| Public API/signatures | `startApplication` export/signature unchanged and directly imported by main and tests; `onCreated` remains optional third parameter. `ApplicationInstance` exposes registry. | `lifecycle.ts:7–8`, `create-app.ts` public type, `main.ts`; **Observed**; external package/API consumer list is **Unverified**. |
| Built artifact reachability | TypeScript builds `src/**/*.ts` to `dist` and lifecycle’s static import remains reachable in emitted `dist/src/app/lifecycle.js`; build is required at C exit. | `tsconfig.json`; `npm run build`; inspect emitted artifact; **Verified locally** after gate. |
| APP→`testing/` | No static import found in `src`; playground runs as a separate package/process and communicates over wire protocols. | Search of `src` imports; R7.8.A runtime composition; architecture checker covers tracked `src/**/*.ts`; **Verified** for static imports, runtime wire communication is intentional. |
| M12/M13 state | Peer gateway owns their workflow/store/runner composition; no ownership/state move is part of these choices. | `peer-gateway.ts`; R7.5/R7.6 policy and tests; **Observed/Verified** by regression suites. Formal ownership remains TBD. |
| M14/M15 composition | Independent SQLite/HTTP repositories, not enabled by peer gate. | `create-app.ts`, M07 routes; session/process usage tests; **Observed/Verified**. Class remains APP per approved ES-D04/05. |

## Candidate before/after and proof plan

No code implementation is authorized by this accepted decision. “Before” and “after” are identical for the retain model; other models remain hypothetical and require separate owner approval.

| Model | Before → accepted/possible after | Required proof/rollback |
|---|---|---|
| **Accepted: C-D01 A / C-D02 A / C-D03 A (retain)** | Same static edge, same exports/signature, callback order, gate, local registry, rule behavior and `dist` reachability. Document the bounded exception; no source delta. | Current focused evidence and final R7.8 Full gate pass. Roll back only current ADR/matrix/current-state documentation if approval is reversed; no runtime rollback. |
| Outer composition / D02 B | Lifecycle import could disappear only if all callers adopt wrapper or a compatibility facade remains. Without facade, direct callers with top-level true lose rule; moving registration outside call changes visibility/timing. | Enumerate known/external consumers; test direct old and new entrypoints, all flag combinations, callback behavior, listen/start failure, build artifacts. Roll back entrypoint/export to old behavior. Not presently eligible as an equivalent extraction. |
| Typed adapter / provider | Lifecycle implementation might depend on a registrar port, but provider must still be selected for old calls; static runtime coupling may merely move. | Demonstrate dependency graph truly changes, no hidden global/dynamic loading, exact registry ownership/order/failure semantics for old direct callers. Roll back seam and restore direct import. |
| Versioned change / D02 C | New version intentionally changes old implicit behavior; not a parity claim. | Caller inventory, version/migration plan, owner API approval, deprecation window, explicit rollback/facade and complete full gate. Out of current authorization. |
| Separate demo runtime / D03 B | Distinct app registry/plugin contract or another process; no current evidence of an independent in-process consumer. | Define lifetime/isolation/enablement and compat facade, show no APP→demo static dependency, test concurrent app instances and cleanup. Roll back to app-local registry. |
| Global/ambient / D03 C | Replaces per-app ownership with shared mutable process state. | No acceptance plan recommended; reject due to instance leakage, order dependence and teardown ambiguity. |

## Minimal tests for a separately approved implementation

Do not add tests in this ADR checkpoint. Reuse and retain the existing R7.8.B tests, then add only gaps a selected model requires: (1) direct start caller with true/true and false/true matrix; (2) top-level true with PServer absent and present, nested gateway independently absent/present; (3) `onCreated` observes no rule, can observe same application returned, and registration is complete before a wrapped `listen`; (4) callback throw and registration throw behavior/cleanup explicitly characterized before any order/API change; (5) listener failure logs/rethrows and preserves R7.6 rollback; (6) exact rule identity/order/output/error and wire ACK/message identity; (7) two apps have independent registries; (8) emitted build import reachability and static APP→`testing/` ban; (9) unchanged M12/M13 outbox/crash/ACK-drain, M14/M15 HTTP/SQLite, test manifest and full playground/backend selections. Keep `npm test -- --test-concurrency=1` unchanged.

## Approval questions

Owner selects each independently: C-D01 A/B/C/D; C-D02 A/B/C; C-D03 A/B/C. Confirm whether existing direct `startApplication()` behavior is part of supported compatibility, whether an APP→example static edge is acceptable as an explicit exception, and whether any later API/versioned migration is authorized. No option is selected by this evidence matrix.
