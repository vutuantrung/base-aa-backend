# R7.6 Lifecycle Policy — Owner Decision Package

**Status: APPROVED D01–D06; implemented in R7.6.B.** Owner approval is recorded in the [implementation report](../../R7_6_B_COORDINATED_BOUNDED_LIFECYCLE_IMPLEMENTATION_VERIFICATION_REPORT.md). This document is the normative policy. Preserve R7.2 affinity/session-generation constraints, R7.3 D01–D04 compatibility, R7.4 dispatch, R7.5 P01–P06, R5-D08 external compatibility, per-instance isolation, and unresolved TD02 deferral.

## R7.6-D01 — Lifecycle owner and state contract — APPROVED

**Proposal:** M02 is the single application lifecycle coordinator. Domain and transport owners retain internals and expose narrow start/stop/settlement capabilities. Prefer explicit one-shot states `created → starting → running → draining → stopping → stopped`, with `failed` terminal for failed startup; readiness is a separate derived/state signal, not another lifecycle label. Concurrent callers share the in-flight start/close promise. Repeated close resolves the same terminal result. `listen` after close and a second port after listen reject deterministically. Startup cancellation is generation/fencing based until resources support actual cancellation. Partial construction/start rolls back acquired resources in reverse dependency order, aggregating cleanup errors without replacing the root cause.

**Alternative:** Preserve the current minimal `listen(port)` / `close()` API with internal guards and no public state exposure. A reusable instance would require fresh listener, Socket.IO, PServer session, runners, stores and persistence ownership and is not supported by current source; recommend one-shot semantics.

**Compatibility/callers:** M02 `ApplicationInstance`, `startApplication`, tests and `main.ts`; maintain public shape unless owner approves additions. Repeated/concurrent lifecycle calls gain deterministic results; undocumented behavior may become explicit rejection.

**Failure/rollback:** Startup failure preserves original error and reports cleanup failures. A resource that may still mutate keeps its lock/evidence. No false “stopped” state while active work remains.

**Acceptance:** Barrier-controlled concurrent listen/close/start failure tests; partial resource acquisition; listener bind failure; close-before-listen; repeated calls; post-close call; clear documented state/readiness separation; no production API expansion without review.

## R7.6-D02 — Readiness and admission — APPROVED

**Proposal:** Maintain internal application readiness owned by M02, independent from M04 PServer session readiness, per-destination availability and store capacity. Local readiness means required local construction/recovery completed and listener is serving. Optional SQLite and peer features follow their configured mode. Draining is reported distinctly from ready. A full queue, offline peer, or absent PServer session is degraded/capability-specific, not process-dead.

**Alternatives considered:** Internal state only; additive readiness endpoint; altering `/health`. The approved choice is internal state only, with no endpoint and no `/health` change.

**Approved admission:** One app-owned gate covers HTTP/Socket.IO/PServer ingress, direct sender/router roots, and owned snapshots. Applicable HTTP business operations receive 503 `{error:"APPLICATION_DRAINING"}`; health, authentication precedence, disabled-SQLite mappings and route/parser validation retain existing priority. ACK-bearing peer ingress uses existing `DELIVERY_FAILED` with stable reason `APPLICATION_DRAINING`; no callback means no processing or synthetic ACK. Existing admitted work drains through response/ACK completion.

**Compatibility/callers:** `/health`, M07 routes, M05 peer ACK handlers, M04 no-ready `UNSUPPORTED_DESTINATION`, M09 direct sender/router, M02 consumers. Additive endpoint or changed rejection behavior requires separate explicit approval.

**Acceptance:** Tests distinguish local ready, PServer session ready, destination ready, storage unavailable/full, optional-disabled, starting and draining; exact existing status/body/ACK compatibility; auth-first and no-ACK behavior preserved; all admission paths inventoried.

## R7.6-D03 — Drain work set and ordering — APPROVED

**Approved drain set:** At cutoff reject new app-owned work; cancel scheduled attempts and limiter waiters; let admitted ingress, receipts, ACK/response completion, already-started attempts/outcome commits, every already-started M09 branch, and tracked snapshots settle. Do not start new durable attempts during drain. Queued/future retryable work remains durable; uncertain and legacy records remain unreplayed. A pre-emit attempting write is retried only when transport invocation is provably not reached.

**Alternatives:** Drain only already-started operations; process additional eligible durable queue work; or immediate stop. Recommend already-started operations only. Starting additional sends expands shutdown work and risk. Immediate close can interrupt receipt/outcome persistence and accepted ACK handling.

**Approved dependency order:** mark draining and stop admission/scheduling; retain established transports while tracked work settles; close PServer, then quiescent peer stores/runners, Socket.IO and HTTP listener, and SQLite last. Socket.IO may close the HTTP listener; M02 closes it explicitly only if still listening. Do not await an ACK after its peer transport was closed.

**Acceptance:** Deterministic barriers around transform, receipt commit, enqueue, attempting write, emit, remote ACK, state commit, generic fan-out, snapshots and callback; identify cutoff outcome and ACK for each. Verify zero new attempt after cutoff and durable queued recovery.

## R7.6-D04 — Deadline, cancellation and timeout outcomes — APPROVED

**Approved:** One monotonic total shutdown budget, default **15 seconds**, configured by `SHUTDOWN_TIMEOUT_MS`, integer range 1–120000. It includes startup settlement, drain and safe cleanup; it is one process deadline rather than per-resource timeouts. The bound is a policy choice, not a claim that every external operation settles in 15 seconds.

**Semantics:** Cancellation is capability-specific. Admission cutoff is logical fencing, not cancellation of running transform/fetch/socket ACK/filesystem work. Timeout does not undo remote effects or convert an invoked send to unsent. If a writer may still mutate, its lease and evidence remain. Canceled process-limiter waiters cannot run later. `close()` rejects with an internal timeout error and work counts; it does not claim process exit or resource release. Entrypoint/supervisor owns escalation; library does not call `process.exit`.

**Alternatives considered:** Separate drain/cleanup budgets, active transport/filesystem cancellation, or no deadline. The approved choice is one total budget; timeout rejects close and leaves termination to the entrypoint/supervisor.

**Compatibility/callers:** M02 close rejection remains `Promise<void>`; timeout diagnostics are internal. The approved setting is `SHUTDOWN_TIMEOUT_MS` (default 15000, integer 1–120000); `stopApplication` propagates failure; deployment supervisor owns final termination.

**Acceptance:** Monotonic fake-clock deadline; hung peer ACK and hung close; late completion after timeout; preserved lock when mutation is possible; distinguish close result, resource release and process termination; no library process exit.

## R7.6-D05 — Failure cleanup and ownership isolation — APPROVED

**Proposal:** Best-effort cleanup in reverse acquisition and actual dependency order, continuing independent safe cleanup while aggregating failures and preserving startup root cause. Idempotent close handles partial initialization. Keep per-instance app resources; same-directory writer contention remains fail-closed. Process-wide limiter remains bounded at 4; its waiter release/lifecycle must not leak across app instances or permit work after close. Any application with multiple same-directory stores must preserve shared writer reference and lock while any active mutator remains.

**Approved choice:** Best-effort dependency-safe cleanup that aggregates failures and preserves root cause, never closing a dependency still used by tracked work. No distributed locking, GC, data deletion, quota change or TD02 admission-abort remediation.

**Compatibility/callers:** M02 composition, M03/M04, M05, M12/M13 stores/runners, M17 persistence, two app instances and same-directory contention. Quotas remain 5,000 records/128 MiB per workflow directory (10,000/256 MiB aggregate); P01–P06 unchanged.

**Acceptance:** Inject each close/start failure; ensure independent cleanup attempted, root error retained, all failures reported; test two application instances, same/different directories, runner slots, lock refs, active store mutation, partial peer startup, no stale-lock auto-removal.

## R7.6-D06 — Runtime integration and diagnostics — APPROVED

**Approved:** Signals stay in `main.ts`, installed before async startup. M02 logs drain start, local readiness, tracked work counts, timeout/cleanup result and writer-lock preservation without payload or credentials. No new endpoint, protocol or broad metrics redesign.

**Approved signal contract:** Entrypoint-only wiring installed before async startup. First signal starts coordinated close; second signal requests nonzero exit; success exits 0, shutdown/startup failure exits 1. The library never calls `process.exit`.

**Compatibility/callers:** `main.ts`, `app/lifecycle.ts`, M02 and process supervisor. First signal performs bounded close (exit 0 on success, 1 on failure); a second requests exit 1. No public protocol changes.

**Acceptance:** Test startup rejection before handler installation, first/repeated signals, close resolve/reject/timeout, exit-code choice at entrypoint seam, safe diagnostics with no secrets/payload, no stale signal listener across instances.

## Approved choices and acceptance

D01–D06 were explicitly approved and implemented in R7.6.B. Implementation evidence, observable outcomes, test matrix and limits are in the linked report. No power-loss, receiver dedupe, exactly-once, or unconditional at-least-once claim is implied.
