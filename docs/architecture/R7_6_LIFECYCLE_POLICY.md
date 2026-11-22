# R7.6 Lifecycle Policy — Owner Decision Package

**Status: PENDING OWNER DECISION.** This document records proposals and alternatives; no behavior, default, or contract is approved by this package. Current evidence and source ownership are in the [lifecycle baseline](R7_6_LIFECYCLE_DECISION_BASELINE.md). R7.6.B must wait for explicit answers to D01–D06. Preserve R7.2 affinity/session-generation constraints, R7.3 D01–D04 compatibility, R7.4 dispatch, R7.5 P01–P06, R5-D08 external compatibility, per-instance isolation, and unresolved TD02 deferral.

## R7.6-D01 — Lifecycle owner and state contract

**Proposal:** M02 is the single application lifecycle coordinator. Domain and transport owners retain internals and expose narrow start/stop/settlement capabilities. Prefer explicit one-shot states `created → starting → running → draining → stopping → stopped`, with `failed` terminal for failed startup; readiness is a separate derived/state signal, not another lifecycle label. Concurrent callers share the in-flight start/close promise. Repeated close resolves the same terminal result. `listen` after close and a second port after listen reject deterministically. Startup cancellation is generation/fencing based until resources support actual cancellation. Partial construction/start rolls back acquired resources in reverse dependency order, aggregating cleanup errors without replacing the root cause.

**Alternative:** Preserve the current minimal `listen(port)` / `close()` API with internal guards and no public state exposure. A reusable instance would require fresh listener, Socket.IO, PServer session, runners, stores and persistence ownership and is not supported by current source; recommend one-shot semantics.

**Compatibility/callers:** M02 `ApplicationInstance`, `startApplication`, tests and `main.ts`; maintain public shape unless owner approves additions. Repeated/concurrent lifecycle calls gain deterministic results; undocumented behavior may become explicit rejection.

**Failure/rollback:** Startup failure preserves original error and reports cleanup failures. A resource that may still mutate keeps its lock/evidence. No false “stopped” state while active work remains.

**Acceptance:** Barrier-controlled concurrent listen/close/start failure tests; partial resource acquisition; listener bind failure; close-before-listen; repeated calls; post-close call; clear documented state/readiness separation; no production API expansion without review.

## R7.6-D02 — Readiness and admission

**Proposal:** Maintain internal application readiness owned by M02, independent from M04 PServer session readiness, per-destination availability and store capacity. Local readiness means required local construction/recovery completed and listener is serving. Optional SQLite and peer features follow their configured mode. Draining is reported distinctly from ready. A full queue, offline peer, or absent PServer session is degraded/capability-specific, not process-dead.

**Alternatives:** Internal state only (smallest compatibility risk); additive authenticated or unauthenticated readiness endpoint (requires owner decision on visibility and response schema); altering `/health` (not recommended: existing `{status:"ok"}` behavior is compatibility-sensitive). Recommend internal readiness first; endpoint choice remains pending.

**Admission proposal:** One app-owned gate for HTTP/Socket.IO/PServer ingress and direct internal sender entry points, with explicit per-surface policy. Preserve health reads, auth-first middleware, disabled-SQLite status/body matrix, ACK-gated processing and existing ACK/error codes. No new 503, ACK code, or wire result is proposed as approved. Existing authenticated messages already admitted are grandfathered only according to D03; no ACK before durable receipt commit. Existing connections must not bypass a gate simply because their handshake predates draining.

**Compatibility/callers:** `/health`, M07 routes, M05 peer ACK handlers, M04 no-ready `UNSUPPORTED_DESTINATION`, M09 direct sender/router, M02 consumers. Additive endpoint or changed rejection behavior requires separate explicit approval.

**Acceptance:** Tests distinguish local ready, PServer session ready, destination ready, storage unavailable/full, optional-disabled, starting and draining; exact existing status/body/ACK compatibility; auth-first and no-ACK behavior preserved; all admission paths inventoried.

## R7.6-D03 — Drain work set and ordering

**Proposal:** At the admission cutoff, reject new app-owned work using only an owner-approved existing result. Stop scheduler scans/wakes from launching new sends. Let already admitted ingress finish transformation and commit its accepted receipt; keep response/ACK and synchronous state notification ordering explicit. Let attempts that already crossed the durable `attempting` boundary and entered emit settle through ACK classification and outcome persistence while their transport/store remain usable. Do not start extra retries during drain. Leave queued and future retryable work durable; uncertain and legacy records remain unreplayed. Generic M09 fan-out and snapshots require explicit cutoff/tracking rules; do not promise their completion without tracking them.

**Alternatives:** Drain only already-started operations; process additional eligible durable queue work; or immediate stop. Recommend already-started operations only. Starting additional sends expands shutdown work and risk. Immediate close can interrupt receipt/outcome persistence and accepted ACK handling.

**Dependency order proposal:** mark draining and stop admission/scheduling; stop new HTTP/Socket.IO connections while retaining needed established transport; settle tracked receipt commits and already-started deliveries/outcome commits; settle/close PServer protocol and peer transport after no accepted send depends on it; close Socket.IO and HTTP listeners/connections; close M12/M13 writers after no mutator remains; close M17 SQLite last. Reconcile actual Socket.IO/HTTP mechanics with tests before implementing. Avoid waiting for work that itself waits on a peer ACK after that peer has been disconnected.

**Acceptance:** Deterministic barriers around transform, receipt commit, enqueue, attempting write, emit, remote ACK, state commit, generic fan-out, snapshots and callback; identify cutoff outcome and ACK for each. Verify zero new attempt after cutoff and durable queued recovery.

## R7.6-D04 — Deadline, cancellation and timeout outcomes

**Proposal:** One monotonic total shutdown budget, configurable only after owner decision; candidate default **15 seconds, pending**. It exceeds the existing 5-second PServer message ACK timeout, but one such timeout plus persistence/socket close may already consume it; observed latency evidence is absent, so 15 seconds is a proposal rather than a chosen safe bound. Use one deadline across drain and cleanup, optionally reserving cleanup time inside the total. No unbounded sequential per-resource timeouts.

**Semantics:** Cancellation is capability-specific. Closing an admission gate is logical fencing, not cancellation of a running transform, fetch, socket ACK or filesystem operation. A timeout cannot undo remote effects and never converts an invoked send to unsent. If a writer may still mutate after timeout, preserve lock and evidence. Release limiter waiters only when they are known not to run; generation-fence late callbacks. Library `close()` reports bounded completion/timeout, not process exit or universal resource release. Entrypoint/supervisor owns escalation and exit code; no `process.exit` in library. Candidate entrypoint: first signal begins close; repeated signal may request immediate supervisor escalation, pending owner choice.

**Alternatives:** Separate full drain and cleanup budgets (can exceed total); active cancellation where supported (unsafe to assume transport/fs cancellation); no deadline (risks indefinite close). Recommend one total budget, but default, result shape and escalation are unresolved.

**Compatibility/callers:** M02 close return/rejection, `stopApplication`, M04 5s message ACK, HTTP outbound timeout, main signal handler, deployment supervisor. Do not add config or change close result until approved.

**Acceptance:** Monotonic fake-clock deadline; hung peer ACK and hung close; late completion after timeout; preserved lock when mutation is possible; distinguish close result, resource release and process termination; no library process exit.

## R7.6-D05 — Failure cleanup and ownership isolation

**Proposal:** Best-effort cleanup in reverse acquisition and actual dependency order, continuing independent safe cleanup while aggregating failures and preserving startup root cause. Idempotent close handles partial initialization. Keep per-instance app resources; same-directory writer contention remains fail-closed. Process-wide limiter remains bounded at 4; its waiter release/lifecycle must not leak across app instances or permit work after close. Any application with multiple same-directory stores must preserve shared writer reference and lock while any active mutator remains.

**Alternative:** Fail-fast cleanup (current behavior; simple but can skip independent resources). Recommend aggregated dependency-safe cleanup while never closing a dependency still used by a live operation. Do not create distributed locking, GC, data deletion, quota changes or TD02 admission-abort fixes.

**Compatibility/callers:** M02 composition, M03/M04, M05, M12/M13 stores/runners, M17 persistence, two app instances and same-directory contention. Quotas remain 5,000 records/128 MiB per workflow directory (10,000/256 MiB aggregate); P01–P06 unchanged.

**Acceptance:** Inject each close/start failure; ensure independent cleanup attempted, root error retained, all failures reported; test two application instances, same/different directories, runner slots, lock refs, active store mutation, partial peer startup, no stale-lock auto-removal.

## R7.6-D06 — Runtime integration and diagnostics

**Proposal:** Keep signals in `main.ts`, not library/application instances. M02 emits minimal lifecycle diagnostics through M18: start phase, local readiness transition, drain start, pending/active counts by owned work class, deadline reached, cleanup result and preserved-lock status. No payload, credentials, peer message body or broad metrics redesign. Avoid changing `/health` or adding endpoint absent D02 approval.

**Signal alternatives:** Entrypoint-only wiring (recommend); application-owned signals (reject due library reuse and multiple-instance ambiguity). First-signal behavior starts coordinated close. Repeated signal policy and supervisor exit responsibility remain explicit owner choices; no handler is installed before startup completes today.

**Compatibility/callers:** `main.ts`, `app/lifecycle.ts`, diagnostics interface, M02 and process manager. Existing human-readable messages may be retained or structured minimally; no public protocol changes.

**Acceptance:** Test startup rejection before handler installation, first/repeated signals, close resolve/reject/timeout, exit-code choice at entrypoint seam, safe diagnostics with no secrets/payload, no stale signal listener across instances.

## Cross-decision acceptance and R7.6.B gate

Before implementation, owner answers D01–D06, including state/public API, endpoint policy, ingress cutoff/result, drain work set, deadline and escalation, aggregate cleanup shape, and diagnostic scope. If a decision alters existing ACK/status/body/wire behavior, record explicit compatibility approval. R7.6.B verification must use Node 22.23.5 and local fakes/loopback; test lifecycle transitions, partial construction/start failure, concurrent listen/close, admission races, due queued work, emitted send ambiguity, cleanup aggregation, timeout fencing, two app instances and `enableTestPeers` / `enableSqlite` matrices. Preserve ordinary architecture checker limitations and SCC status. No power-loss, receiver dedupe, exactly-once, or unconditional at-least-once claim is implied.
