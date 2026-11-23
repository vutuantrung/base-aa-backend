# R7.8.C — Demo Registration Composition Ownership ADR

**Status: ACCEPTED**  
**Decision checkpoint:** R7.8.C, documentation only  
**Source baseline:** `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd` (`main`)

**Owner approval:** C-D01=A, C-D02=A, C-D03=A. The owner selected the retain model: preserve the lifecycle import as a bounded compatibility exception, preserve implicit registration for direct `startApplication()` callers, and preserve app-local transformation state. This accepts the architecture decision only; it does not claim an extraction or change runtime behavior.

This ADR records the owner-approved composition decision without changing implementation. R7.8 ES-D01=A; ES-D02=C scoped (M12 TBD); ES-D03=C scoped (M13 TBD); ES-D04=A (M14 APP); ES-D05=A (M15 APP); ES-D06=A; ES-D07=A; ES-D08=A remain binding. R7.5 P01–P06, R7.6 D01–D06 and R7.7 verification remain binding.

## Context and source truth

`src/app/lifecycle.ts` has a static runtime import of `registerPServerToAauiDemo` from `src/examples/pserver-to-aaui.ts`. `startApplication` is exported with this signature:

```ts
startApplication(
  configuration: ResolvedConfiguration,
  diagnostics?: Diagnostics,
  onCreated?: (application: ApplicationInstance) => void
): Promise<ApplicationInstance>
```

Its source order is `createApplication(configuration.application)` → synchronous `onCreated(application)` → register the demo rule iff the **top-level** `configuration.enableTestPeers` is true → `application.listen(configuration.port)`. The callback and rule registration occur before the `try` that catches `listen` errors. `listen` owns startup resource rollback; `startApplication` logs and rethrows listen failures. An exception from `onCreated` or rule registration is outside that catch and is not rolled back there.

`createApplication()` does not import or register the example. It creates a fresh app-local `TransformationRegistry` and passes it with the **nested** `configuration.application.enableTestPeers` to M05. M05 creates `/peers` and the M12/M13 gateway only for nested `true`; M03/M04 PServer connector construction additionally requires a PServer config. Each registry is local to one app. The optional third-argument callback receives the same mutable `ApplicationInstance` later returned by `startApplication`.

The CLI resolves `process.env` then calls `startApplication`. `ENABLE_TEST_PEERS === '1'` makes both flags true and supplies the default PServer config (`http://127.0.0.1:3001`, `/ws`, VM defaults); other strings make both false. CLI SQLite defaults false (`ENABLE_SQLITE === '1'`); direct `createApplication` SQLite defaults true unless explicitly disabled. Direct callers can construct differing top-level/nested flags or omit PServer config.

### Preserved example rule contract

The retained rule is `demo-pserver-to-aaui-modified-param`, priority `10`, matched only for `from: 'pserver'`, `to: 'aaui'`, and `payloadType: 'demo.modified-param'`. It preserves the payload/data and adds `modifiedParam: "AAB modified: <originalParam>"`. A missing or non-string `originalParam` throws `originalParam must be a string`, surfaced by M11 as `TransformationExecutionError` naming the rule. Existing wire coverage verifies the success ACK, equal returned/received message IDs, and `processedBy: ['demo-pserver-to-aaui-modified-param']`; nonmatching payload types pass through unchanged. This decision preserves that contract without claiming an external receiver guarantee.

## C-D01 — Composition owner alternatives

| Option | Ownership and dependency graph | Caller/order/config effect | Packaging, cost, rollback |
|---|---|---|---|
| **A — Retain documented compatibility exception** | M02 keeps the static runtime edge to the example registrar; the example function populates M11’s app-local registry. Scope the exception to this one rule/edge and track it in architecture docs. | Preserves direct `startApplication()` behavior, `onCreated` visibility, top-level gate and pre-listen registration. No flag normalization. | No package/build change; lowest maintenance and migration cost. Revert documentation only if policy changes; code remains unchanged. **Accepted selection.** |
| **B — Outer executable composition** | `main.ts` or a new executable module imports the example and composes registration around startup. M02 could then have no example import only if all callers use the outer wrapper. | A direct caller of `startApplication()` with top-level true silently loses registration unless a legacy API/facade remains. A facade that preserves it retains a compatibility dependency somewhere. Registration before the call changes `onCreated` visibility; registration after the call is too late (listen already began). | Could isolate executable ownership, but creates parallel startup paths and migration burden; build artifact/package entrypoints and direct consumers need inventory. Roll back by restoring old export path and re-run all caller contract tests. Not behavior-preserving without the facade; with it, assess whether the edge moved or merely relocated. |
| **C — Narrow internal compatibility provider/adapter** | M02 receives a typed registration capability or a wrapper/provider supplies it. A port can erase a direct import from `lifecycle.ts`, but a runtime provider still imports the example and must be selected for old direct callers. | To preserve current behavior, default startup must still resolve the provider, register after `onCreated`, and before `listen`; direct callers and mismatched flags must behave identically. An optional callback/default changes signature or leaves callers without the rule. | Adds seam and indirection without yet removing runtime coupling; only justified if independent consumers or later swaps are evidenced. Roll back the adapter and restore direct import, preserving contract tests. No generic DI, locator, ambient mutable registry or dynamic import loophole. |
| **D — Versioned startup contract change** | New explicitly composed/opt-in startup contract owns the example outside base lifecycle; old behavior is retired by version/major contract. | Changes direct callers, registration expectation, or API surface by design. It must not be described as equivalent. | Requires external caller inventory, migration window, version policy, release/package changes if applicable, acceptance tests and a reversible compatibility facade. **Not authorized in this phase.** |

**C-D01 accepted: A.** Retain and document one bounded direct runtime dependency: `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts`. The example rule’s behavior is demo-only, while its automatic registration remains part of the approved `startApplication()` compatibility contract. This exception is explicit in architecture documentation and is not silently hidden behind an adapter. It does not resolve M12/M13 ownership.

## C-D02 — Direct `startApplication()` compatibility

| Option | Meaning | Compatibility and evidence needed |
|---|---|---|
| **A — Preserve implicit registration for existing callers** | If the top-level flag is true, direct `startApplication()` continues to register the rule automatically. | Matches source today. Preserve callback-before-registration and registration-before-listen. Existing focused B tests prove representative true/false and false/false cases; external consumer inventory remains unknown. **Accepted selection.** |
| **B — Legacy facade plus explicit opt-in API** | Keep an old entrypoint that preserves behavior and add a separately named opt-in startup API. | The facade still owns or reaches the registrar; API/export/entrypoint additions need separate approval. Demonstrate old callers and all flag combinations retain behavior, new callers can omit demo wiring, and both paths have equal startup/rollback guarantees. |
| **C — Later versioned breaking change** | Remove implicit registration only after a versioned compatibility decision. | Requires repository and external caller inventory, deprecation/migration plan, explicit API/version authorization, release notes and rollback/facade duration. Not allowed by current R7.8 scope. |

**C-D02 accepted: A.** Preserve implicit registration for direct callers when the top-level flag is true. The API remains exported and unchanged; no external caller count is inferred from repository-only searches.

## C-D03 — Rule state and lifetime

| Option | Meaning | Compatibility and evidence needed |
|---|---|---|
| **A — App-local transformation registry** | One registry per `ApplicationInstance`; current rule registers into that instance during startup. | Matches `createApplication()` and existing lifecycle. Preserves instance isolation, registration order and M11 selection/execute semantics. **Accepted selection.** |
| **B — Separate explicitly composed demo runtime/plugin** | An explicit composition owner supplies the rule to an app registry or provides a distinct demo runtime. | Requires identified independent consumers and a contract defining initialization, per-app ownership, enablement, teardown and direct-start behavior. A plugin wrapper alone does not remove runtime coupling if it imports the example and is the compatibility default. |
| **C — Global/ambient registration** | Process-level registry/callback supplies rule state implicitly across apps. | Reject: leaks state across application instances, creates hidden order and test coupling, weakens cleanup/ownership, and conflicts with the existing per-app registry. No implementation or acceptance case is proposed. |

**C-D03 accepted: A.** Keep the rule in each app’s `TransformationRegistry`, with registration owned by M02 lifecycle at the current point. No global/ambient state is introduced. Keep M12/M13 ownership TBD and separate.

## Accepted decision and implementation boundary

The accepted combined direction is C-D01=A, C-D02=A, C-D03=A: retain the single static compatibility edge, document it as intentional, and keep state isolated in each app registry. No extraction or implementation change is authorized or required under this decision.

### Future reconsideration trigger and compatibility requirements

Reconsider this exception only if either (a) the owner separately approves a versioned/public startup-contract migration, or (b) concrete independent consumers of a separately composed demo entrypoint are identified. Neither trigger authorizes work implicitly. Any proposal requires explicit owner scope and tests for direct callers, unchanged or intentionally versioned exports, `onCreated` before registration, registration before `listen`, exact top-level/nested flag independence, rule output/errors/ACK/`processedBy`, app-local isolation, start failure/rollback and R7.5–R7.7 gates. A rollback must restore the current startup/export path and preserve data/state.

The known exception-boundary gap remains: `onCreated` and rule registration execute before the current listen-specific `try/catch`; callback-throw and duplicate-rule cleanup are not fully tested. Record and assess this before any future order/error-boundary change. Do not change error handling as part of this ADR.

## Owner decision record

- [x] C-D01=A: retain the documented bounded APP→example compatibility exception.
- [x] C-D02=A: preserve implicit registration for direct `startApplication()` callers.
- [x] C-D03=A: preserve app-local `TransformationRegistry` state.
- [x] No source refactor or runtime/API change is part of this accepted ADR.
- [ ] Any future migration requires a new explicit owner approval and implementation scope.

## Decision record

**Accepted:** C-D01=A, C-D02=A, C-D03=A as recorded above. The [compatibility evidence matrix](R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md) supplies the source/test basis; the [R7.8.C report](../../R7_8_C_DEMO_REGISTRATION_COMPOSITION_OWNERSHIP_REPORT.md) remains a historical record of the pre-approval proposal state.
