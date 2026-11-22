# R7.6.B — Coordinated Bounded Lifecycle: Implementation & Verification

## Checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`; tested committed base: `3fe329bc596e768935d2e611b20164153f5199b5` (R7.6.A). No commit or push. Worktree had the untracked authorized prompt before changes; unrelated work was preserved.
- Architecture owner approved D01–D06 as specified in the supplied R7.6.B prompt. This report records implementation evidence, not production deployment certification.
- Runtime: Node `v22.23.5`; Linux container, temporary local directories, local TCP loopback for integration cases.

## Implemented decisions and changes

- **D01 M02 lifecycle:** `src/app/create-app.ts` owns one-shot created/starting/running/draining/stopping/stopped/failed state. Existing `ApplicationInstance` shape is preserved. Same-port concurrent listen shares outcome; port 0 returns the actual bound port; close is shared/idempotent; close-before-listen and close-during-recovery are terminal and fence late startup.
- **D02 readiness/admission:** `ApplicationCoordinator` provides app-local readiness and nested admission through a narrow shared capability. Applicable HTTP work returns 503 `{error:"APPLICATION_DRAINING"}`; `/health` remains `{status:"ok"}`. ACK-bearing peer ingress uses existing `DELIVERY_FAILED` with reason `APPLICATION_DRAINING`; M04 not-ready and no-ACK precedence remains. Auth and disabled-SQLite routing precede the gate. Direct sender/router entry rejects with internal `ApplicationDrainingError`.
- **D03 drain/order:** admitted HTTP, peer/ACK, generic M09 root and started fan-out branches, and M05 snapshots are tracked through completion. M09 preserves `Promise.all` fail-fast behavior. Runners stop scans, pending work and cancellable process limiter waiters; accepted/started delivery settles before dependent transport/store close. A runner fenced after persisted attempting but before `deliver` records known-unsent retryable state. Queued work is not launched during drain. Cleanup orders PServer, peer stores after runner idle, Socket.IO/HTTP, then SQLite.
- **D04 bound:** `SHUTDOWN_TIMEOUT_MS` / `shutdownTimeoutMs` defaults to 15000 ms; integer range 1–120000. One monotonic deadline covers startup settlement, drain and cleanup. Timeout rejects close with `ApplicationShutdownTimeoutError`, counts and diagnostics; it does not cancel work or claim stopped. JavaScript cannot preempt synchronous event-loop stalls.
- **D05 ownership/cleanup:** acquired construction resources roll back; SQLite initialization closes its handle on schema failure. Cleanup continues across independent close errors and aggregates failures. Canonical-directory runner ownership is exclusive in-process as well as the existing OS writer lock. The process-global 4-slot bound remains; waiters are cancellable and leases release only after no startup/attempt mutator remains. No data deletion, lock auto-break, quota change, GC or TD02 change.
- **D06 signals/diagnostics:** `main.ts` installs signal handling before async startup and registers the app as soon as constructed. First signal uses bounded close; success requests exit 0; failure exits 1; repeat requests exit 1. Library owns no process handlers or exit. Diagnostics include lifecycle phase, readiness, work counts and lock-preservation indication, not payloads/secrets.
- Documentation updated: approved [policy](docs/architecture/R7_6_LIFECYCLE_POLICY.md), ownership/sequences [baseline](docs/architecture/R7_6_LIFECYCLE_DECISION_BASELINE.md), [module boundaries](docs/architecture/MODULE_BOUNDARIES.md), ADR, TD14/TD15, PROJECT_STATE, and [operations notes](docs/operations/R7_6_LIFECYCLE.md). TD12/TD13 unchanged; TD14 conditionally remediated; TD15 scoped internal readiness remediation with broader diagnostics open. R7.5 C03 residual, quotas, global concurrency, no-GC and stale-lock policy remain.

## Verification evidence

- Focused local loopback lifecycle/catalog tests: 14/14 pass (concurrent listen/close, port 0, close-before-listen, EADDRINUSE rollback, close during recovery, same-directory two-app fail-closed ownership, `/health`, 503 drain response, admitted webhook fan-out drain, bounded timeout, existing catalog route behavior). Invalid JSON remains parser 400 before drain gating.
- Coordinator/signal focused tests passed in the full suite. Existing R7.5 crash-process matrix: 9/9 cases pass; focused reliable-outbox suite passes after correcting runner lease release.
- `npm run typecheck`: PASS. `npm run build`: PASS.
- `npm test -- --test-concurrency=1`: **241/241 PASS**, Node 22.23.5; final run used approved local listener/process access. Earlier sandbox run failed listener files with EPERM and is not counted.
- `npm --prefix testing run test:playground`: **32/32 PASS**.
- `node --version`: `v22.23.5` used for verification. Environment default Node 24.21.0 was observed but not used.
- Ordinary `npm run check:architecture`: exit 1 because its tracked-source graph excludes new untracked TS files and reports resolved-source-not-tracked (55 tracked files, 132 observed edges). It reported existing M10↔M12↔M13 runtime module SCC and M06↔M10↔M11 all-import SCC. Temporary-index checker: **PASS**, 58 files/144 edges, 0 runtime file SCCs, same existing module SCCs, dependency rules passed. The temporary index and object directory were under `/tmp`; the real index was not modified.
- `git diff --check`: PASS. Final branch remains `main`; committed HEAD remains `3fe329bc596e768935d2e611b20164153f5199b5`; worktree contains the R7.6.B modifications and the pre-existing untracked prompt. No public API expansion, runtime dependency, wire/schema, retry/dedupe or persistence format change was intended.

## Evidence boundary and residual risk

Deterministic barriers support coordinator admission, fan-out, ACK mapping and deadline calculations. Loopback supports the tested Node/OS listener and HTTP behavior. Existing R7.5 child-process tests support Linux process-kill behavior only. PServer remote behavior, deployment filesystems, power loss, remote dedupe, receiver business completion and universal exactly-once/at-least-once guarantees remain unverified. Peer ACK drain was checked at helper/protocol level; new connection rejection is source-checked and existing handshake tests pass, but no dedicated held live peer-ACK loopback case is claimed. Generic held outbound HTTP verifies timeout and dependency retention; JavaScript cannot interrupt synchronous filesystem/event-loop stalls. Timeout rejection is distinct from process termination; supervisor escalation remains operator-owned.

## Recommendation

**CONDITIONALLY CLOSED for the approved local bounded lifecycle contract, pending reviewer acceptance.** Required application listener, temporary-index architecture, full backend and playground evidence passes. Ordinary checker still requires tracked source paths after a future commit because its graph is based on Git's tracked index; the clean temporary-index check verified proposed source ownership without touching the real index. TD14 stays conditionally remediated under the environmental and synchronous-stall limits above. No authorization to start R7.7 is implied; stop for reviewer assessment.

## Final workspace

- No commit/push; no R7.7 work.
