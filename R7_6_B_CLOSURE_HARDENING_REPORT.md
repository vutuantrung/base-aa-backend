# R7.6.B — Targeted Closure Hardening Report

## Checkpoint and scope

- Repository `vutuantrung/base-aa-backend`, branch `main`.
- Expected and actual pre-edit HEAD: `3ec48f73edaca1723943cfa97d5f1c68618b1d8a`; worktree was clean before this task. The implementation report records its earlier R7.6.A source baseline.
- Node.js `v22.23.5`. No commit or push. R7.7 has not started.
- Preserved approved R7.6 D01–D06 and R7.5 P01–P06, public `listen`/`close`, wire and persistence contracts, 15-second default monotonic deadline, conservative retry and lock behavior, quotas and dedupe.
- Historical R7.6.B implementation evidence is in [the implementation report](R7_6_B_COORDINATED_BOUNDED_LIFECYCLE_IMPLEMENTATION_VERIFICATION_REPORT.md); normative decisions remain in [the policy](docs/architecture/R7_6_LIFECYCLE_POLICY.md).

## Findings and dispositions

### V01 — Live peer-ACK drain: NOT CLOSED

The required dedicated application-level Socket.IO barrier test was attempted but not completed. Sandboxed app listener runs failed with `listen EPERM`. An escalated run reached a live peer connection but hung before completing the receipt barrier; that run is not counted as a pass. Existing coordinator ACK tests pass, and the full suite includes other Socket.IO loopback coverage, but neither proves the requested concurrent admitted ingress plus outstanding outbound peer ACK settlement, cutoff rejection, durable outcomes and no replay as one shutdown scenario.

No wire behavior was changed. A dedicated held peer ingress/outbound ACK test must complete in an authorized loopback environment before closure.

### V03 — Late completion: PARTIALLY VERIFIED

The existing application timeout barrier proves `close()` rejects with `ApplicationShutdownTimeoutError` and leaves the HTTP listener open while admitted work remains. The runner's existing `close during an active attempt preserves ownership evidence through the final state mutation` test passes and verifies that a late delivery outcome commit retains writer ownership until mutation settles. The crash regression suite also verifies uncertain outcomes are not replayed.

The requested combined timeout → late receipt commit → delivery settlement → cleanup scenario was not run end-to-end. No shutdown success is reported after timeout. Keep V03 conditional until the combined application-level barrier is verified.

### V06 — Scanner quiescence: CORRECTED, FOCUSED BARRIER TEST NOT RETAINED

Reproduction attempt suspended `store.list()` during a scanner and observed `waitForIdle()` release runner ownership while the list operation could still proceed into quarantine/mutation. This exposed that runner idle accounting included startup and attempts, but not scans. `ReliableOutboxRunner` now increments/decrements scanner activity around the complete `store.list()` and scheduling operation; idle resolution and writer ownership release include startup, scans and executing attempts.

The initial filesystem-backed regression test was unstable in the test runner and was removed rather than weakening it. The code correction is typechecked, and the full outbox/crash suites pass. The deterministic suspended-list regression should be reintroduced after repairing its harness, before marking V06 fully closed.

### V07 — Startup rollback: POLICY ALIGNED, POST-BIND REPRODUCTION NOT CLOSED

Source inspection showed startup failure rollback closed resources immediately after cutoff, without waiting for admitted application work or peer runners. Startup rollback now begins coordinator and peer-runner drain, then waits for peer runner idle and coordinator idle before resource cleanup, under the configured total monotonic deadline. Cleanup failure is aggregated with the original startup error as the cause.

Existing EADDRINUSE rollback and process-level partial-startup regressions pass. A deterministic activation failure after HTTP bind while admitted work remains active was not reproduced: there is no narrow existing activation-failure injection seam, and live listener execution did not complete in this environment. V07 remains conditional on that post-bind barrier.

### V08 — Detached nested admission: CORRECTED

Reproduction showed `waitForIdle()` could resolve after a parent settled while an inherited nested operation was still active. `run()` now tracks inherited nested operations as separate work, so the child remains in the coordinator count through its own settlement. The admission context is invalidated when its owner operation settles; an expired detached callback cannot use nested admission as a bypass after cutoff. New roots remain rejected after cutoff, while legitimate nested calls started before parent settlement remain allowed.

Focused coordinator tests pass 7/7, including detached child settlement, cutoff rejection, expiry and M09 sibling fan-out behavior.

## Approval-to-test trace

| Approved policy | Closure evidence |
|---|---|
| D01 lifecycle and rollback | Startup rollback now waits for admitted work and peer runner settlement; EADDRINUSE and partial-startup regressions pass. Post-bind active-work activation failure barrier remains unverified (V07). |
| D02 admission | Existing HTTP and peer callback admission tests remain passing; V08 focused tests cover root rejection and expired context. Dedicated live peer cutoff/ACK behavior remains unverified (V01). |
| D03 drain and dependency order | Existing application lifecycle and full backend suite pass; runner settlement includes late attempt commits. Dedicated held live peer ACK drain remains unverified (V01). |
| D04 total 15-second deadline | Existing configured timeout test passes; timeout rejects and does not close dependencies. The combined late receipt/delivery completion case remains unverified (V03). |
| D05 ownership and cleanup | Outbox 27/27 and process-crash 9/9 pass; scanner activity now participates in ownership decisions. V06 suspended-list regression harness is not retained. |
| D06 signal and diagnostics | Existing full backend suite passes; no signal contract changes were made. |
| P01–P06 reliability policy | Outbox and crash/process regressions pass; no retry, replay, lock recovery, quota, dedupe expiry or schema behavior changed. |

## Verification (Node 22.23.5)

- `npm run check:architecture`: PASS, 58 files / 144 edges; existing documented module SCC warnings remain.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- Focused coordinator tests: **7/7 PASS**.
- Reliable outbox tests: **27/27 PASS**.
- Reliable process-crash tests: **9/9 PASS**.
- Full backend: **243/243 PASS**.
- Playground: **32/32 PASS**.
- Dedicated requested peer-ACK listener test: **NOT RUN TO COMPLETION**. Sandbox emitted `listen EPERM`; an escalated attempt connected but hung and was terminated. Do not count as pass.
- Dedicated post-bind activation rollback listener test: **NOT VERIFIED**.
- `git diff --check`: PASS after correcting trailing whitespace.

## Remaining limitations and debt

- V01, V03 combined late-completion sequence and V07 post-bind failure are not fully closed pending deterministic barrier evidence.
- V06 code is corrected, but the direct suspended scanner regression must be restored with a reliable test harness.
- R7.5 C03 transformation side-effect/idempotency residual is unchanged. No power-loss, production-filesystem, receiver dedupe or exactly-once claim is added.
- TD14 remains **CONDITIONALLY REMEDIATED** for the bounded shutdown contract, pending dedicated V01/V03/V06/V07 verification and reviewer acceptance.
- TD15 remains **CONDITIONALLY REMEDIATED** for internal readiness/admission scope; broader operational diagnostics remain open.

## Recommendation

**NO-GO for R7.7.** R7.6.B targeted closure is not ready to advance because dedicated peer ACK drain and post-bind startup rollback evidence is incomplete, and the scanner regression test needs a stable barrier harness. Stop for reviewer acceptance. Do not commit, push or begin R7.7.

## Final workspace record

- Tested committed source HEAD: `3ec48f73edaca1723943cfa97d5f1c68618b1d8a`.
- Worktree is dirty with the R7.6.B closure changes and this report; no future SHA is claimed.
