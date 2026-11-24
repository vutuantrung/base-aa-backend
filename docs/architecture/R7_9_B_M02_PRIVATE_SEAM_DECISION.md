# R7.9.B — M02 private seam decision

**Source baseline:** `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9` (`main`)

## Decision

**DEFERRED — EQUIVALENCE NOT PROVEN.** No production extraction was made. The construction, startup rollback, normal close, and callback/registration paths have distinct ownership and exception behavior; the current tests do not prove every cleanup-error ordering or asynchronous settlement edge needed to move those paths safely. A structural move would add review risk without proving clearer responsibility ownership.

## Candidate considered

The only candidate considered was a private resource acquisition/cleanup grouping from `src/app/create-app.ts` into a new M02-owned module. Before boundary: `createApplication` validates timeout, opens persistence, creates repositories/HTTP/socket resources and optional PServer connector, then retains `persistence`, `acquiredSockets`, `acquiredPServer`, and `cleanupPromise` in closures. The construction `catch`, returned `close`, and startup rollback each consume different subsets with different timing. Proposed boundary would have returned an acquisition object and cleanup operation to the factory.

This is not eligible: returning such an object widens or relocates ownership of mutable acquisition state; capturing resources inside it risks changing when the factory's catch can see each acquisition; extracting only a wrapper leaves the mixed responsibility and complexity unchanged. Moving the catch or cleanup loops would change behavior-sensitive sync/async and error aggregation boundaries. No real responsibility seam with demonstrated parity remains.

## Ownership and paths

- Before acquisition: M02 validates `shutdownTimeoutMs` and selects SQLite default. `openPersistence` acquires the optional database before the construction `try`; a failure there propagates directly.
- Construction: `acquiredSockets` is assigned only after `attachSocketServer` returns; `acquiredPServer` only after connector construction returns. On later synchronous failure, connector close is synchronous and caught/logged, socket close is invoked fire-and-forget with async rejection logging, and persistence close is synchronous. A persistence close exception is combined with the primary error; otherwise the original error identity is rethrown.
- Startup: `startApplicationResources` awaits peer runner start, HTTP listen, peer activation in that order, then synchronously connects PServer and marks running. State fences follow each await. Startup rejection marks failed and calls rollback, which drains, waits for peer/coordinator idle under one deadline, closes peer gateway, then invokes shared cleanup. Cleanup errors combine with the startup error.
- Normal close: one `closePromise` is shared; state drains admission and peer gateway, waits startup/peer/coordinator idle under a monotonic deadline, then shared cleanup closes PServer, peer gateway, sockets, HTTP listener if listening, and persistence in order. Cleanup attempts continue after individual errors and aggregate them.
- Failed-start close: `closeFailedStartup` returns existing cleanup promise or observes startup settlement; it rethrows shutdown timeout (including nested aggregate) but otherwise resolves after startup failure handling.
- `startApplication`: `onCreated`, gated demo registration, and `listen` order remain in `src/app/lifecycle.ts`; callback and registration exceptions remain outside its listen-specific catch. The accepted lifecycle→example import and per-app registry are unchanged.

## Rejected alternatives

- Extracting only pure timeout/port validation: already small, does not own a meaningful M02 runtime responsibility, and would be a file move.
- Extracting startup orchestration: the exported `startApplicationResources` already owns the ordered awaited steps; moving it or its state callbacks does not reduce mixed ownership and requires unchanged rejection timing.
- Extracting normal cleanup or rollback: these paths intentionally differ in peer close/wait order, shared deadline, promise identity, and error aggregation; a shared abstraction would normalize behavior without proof.
- Extracting demo composition: prohibited by accepted C-D01=A/C-D02=A/C-D03=A compatibility behavior.

## Public surface and verification

`ApplicationInstance`, overloads, exported helpers/types, `startApplication`, diagnostics and events remain unchanged. There is no before/after source graph delta and no rollback step for production code. Existing focused evidence includes `application-surface-compatibility.test.ts`, `application-lifecycle.test.ts`, `application-startup-rollback.test.ts`, `application-peer-ack-drain.test.ts`, `configuration.test.ts`, SQLite API tests and the full R7.7 profiles. Those tests cover representative contract paths, not injected failures from every repository/socket/PServer constructor or every cleanup primitive. Callback throw, duplicate rule registration, cleanup throws, and several construction injection points remain characterization gaps; no deterministic claim is made for them.

Because no test seam was selected or implementation changed, no new test file/assertion or manifest/profile row was added. The complete verification and remaining evidence limits are in the [R7.9.B report](../../R7_9_B_M02_RUNTIME_COMPOSITION_BOUNDARY_IMPLEMENTATION_VERIFICATION_REPORT.md) and [failure-boundary parity matrix](R7_9_B_M02_FAILURE_BOUNDARY_PARITY_MATRIX.md).
