# R7.9.C — Failure Injection and Test Stability Decision Policy

**Status: FI-D01–FI-D05 APPROVED (A).** The architecture owner approved existing reachable triggers, route/PServer construction cases, at most three fully captured Full attempts, separate corrective checkpoint for confirmed defects, and testing-only characterization before reassessing M02. No injection seam, extraction, or corrective implementation is authorized by those choices. Approved RC-D01–D07 and R7.5–R7.8 invariants remain binding.

## FI-D01 — Failure-injection strategy

| Option | Scope / trade-off |
|---|---|
| A — Existing reachable triggers first (recommended) | Characterize invalid config/routes/PServer values, occupied port, lock collision, activation fake, callback throws and existing barriers. Low intrusion, but cannot force all constructor/close errors. |
| B — Narrow test-only adapter | Add an M02-owned private adapter around selected constructors/resource closers for otherwise unreachable failures. Better fault precision, but changes production source shape and adds a testability contract requiring equivalence review. |
| C — General DI/container or module monkey-patching | Broad fault reach; adds ambient or generalized composition complexity and risks behavior/order changes. Highest maintenance and rollback cost. |

**Approved: A.** Consider B only for named material gaps after A evidence; reject C for this scope.

## FI-D02 — First M02 boundary to characterize

| Option | Scope / trade-off |
|---|---|
| A — In-try route/PServer input failures (recommended) | Use existing public configuration to fault after persistence/socket acquisition where possible. Small and deterministic; proves only the particular catch path, not arbitrary constructors. |
| B — Cleanup error/aggregation seam | Exercise connector, peer, socket, HTTP and persistence close throws. High value for R7.6 but currently needs an injection adapter and exact ordered assertions. |
| C — Defer M02 injection pending an observed failure | Avoids adding testability surface without a named defect. Leaves known cleanup failure gaps open. |

**Approved: A**, with one narrow test-only characterization batch. Do not use EADDRINUSE as proxy coverage for constructor or cleanup errors.

## FI-D03 — Stability evidence policy

| Option | Scope / trade-off |
|---|---|
| A — Bounded attempts with full logs (recommended) | At most three deliberate Full runs per discovery, complete output and metadata, stop for named failure diagnosis. Reproducible record; finite confidence. |
| B — Repeat until fail/pass threshold | Could estimate recurrence but invites unbounded load and selective stopping; requires separately approved sample plan and resource budget. |
| C — Rerun only historical profile stage | Lower cost, but historical failures have no test/stage identity and may be lost. Cannot substitute for Full evidence. |

**Approved: A.** Current C capture used one sandbox attempt blocked by EPERM and two authorized host attempts that passed.

## FI-D04 — Confirmed defect handling

| Option | Scope / trade-off |
|---|---|
| A — Separate corrective checkpoint (recommended) | Record minimal reproduction, ownership, invariant impact and proposed fix; request explicit scope. Keeps discovery evidence intact and makes behavior changes reviewable. |
| B — Fix during discovery | Shortens time to fix but destroys baseline, mixes evidence with remediation, and risks unauthorized public/runtime changes. |
| C — Accept/quarantine test failure | May be appropriate only with explicit owner policy; otherwise can normalize a defect or weaken a gate. |

**Approved: A.** Do not hide, skip, reorder, or weaken the failing assertion.

## FI-D05 — Checkpoint sequencing

| Option | Scope / trade-off |
|---|---|
| A — Testing-only proof batch, then reassess M02 (recommended) | First use approved existing triggers; only if material gaps remain, propose one narrow test-only seam. A future production extraction requires separate parity proof and approval. |
| B — Reevaluate M02 private extraction immediately | Directly resumes R7.9.B, but current fault evidence is incomplete and no historical failure is identified. |
| C — No further R7.9 runtime work | Preserves current system and avoids testability changes; leaves known evidence gaps open. |

**Approved: A.** R7.9.C did not authorize D; this owner approval now authorizes only the testing-only R7.9.D scope. Reassess M02 after that evidence; extraction still requires separate explicit approval.

## Traceability: R7.9.B gaps to C evidence

| Prior gap / claim | C evidence | Future proposal class / owner / gates |
|---|---|---|
| Persistence open and partial initialization failure not injected | Source confirms `openPersistence` is before M02 try; `openDatabase` closes its handle on pragma/schema failure. No test forces the constructor/close exception. | Characterization only via unique temporary invalid paths, or M17-owned constructor adapter if needed. Prove exact error/cause and no handle leak; R7.5 data/path preservation. |
| In-try M02 construction cleanup not observed | Duplicate route ID gives deterministic public-config throw after DB acquisition. Invalid PServer UDID reaches connector construction after sockets are acquired; M02 marker assignment occurs after return. | Test-only additions through existing config; no production seam for these specific triggers. Assert error identity, resource release and no sockets/locks left. Preserve R7.8 gates and M02 API. |
| M05 attach partial-construction failure inaccessible | M05 locally calls `io.close` in its catch, but no M02 input reliably injects every construction point. | Test-harness/injection seam only after FI-D01 approval; M05 owner and M02 boundary. Assert partial close awaited semantics as currently observed (M02 does not await it), original error and no listener leak. |
| Startup activation and rollback order characterized with fakes, not full factory | `application-startup-rollback.test.ts` uses exported lifecycle test seam; bind failure/runner lock are integration evidence. | Characterization/test only. Preserve drain, peer waiter, coordinator idle, shared deadline, no early close and late settle (R7.6); writer locks/no replay (R7.5). |
| Close errors/aggregate order not fault injected | `cleanupResources` source defines ordered catches and `AggregateError`; no resource closer injection exists. | Potential private test adapter is a source/test-harness change, not behavior change; needs explicit approval. Verify exact order, identity, single shared promise, all attempts, lock/late-mutation semantics. Full manifest and serial test gates (R7.7). |
| Callback/registration exception cleanup gap | Existing compatibility test proves order; direct callback or duplicate rule registration can throw before listen-specific try. | Characterization-only test can capture handle and close explicitly in finally. Any automatic cleanup/diagnostics behavior change needs separate approval; preserve R7.8 callback/registration/listen contract. |
| Historical Full 254/255 without identity | Two current host Full runs pass; sandbox attempt blocked before backend at architecture `spawnSync git EPERM`. No historical logs accessible. | Discovery only; on future failure retain raw full output and diagnose named test. Do not attribute to M02, concurrency, filesystem, or timers absent evidence. Preserve R7.7 Full/serial/profile behavior. |

For all proposals: distinguish tests that use fake lifecycle capabilities from integration through real `createApplication`; do not relabel manifest `unknown`; no CI/package/profile changes without explicit scope. R7.8 C-D01/02/03, M12/M13 TBD, M14/M15 APP, legacy exports, gates, diagnostics, `/health`, and signals remain unchanged.

## Approval record

| Decision | State | Owner selection |
|---|---|---|
| FI-D01 | APPROVED | A |
| FI-D02 | APPROVED | A |
| FI-D03 | APPROVED | A |
| FI-D04 | APPROVED | A |
| FI-D05 | APPROVED | A |
