# Codex Task — R7.5.B: Reliability Upgrade, Policy Gate & Approved Implementation

## 0. Objective, authority and checkpoint gate

Repository: `vutuantrung/base-aa-backend`, branch `main`.
Last independently verified GitHub HEAD when this task was authored: `fa60d2d97887299e323f74eb2d408448e3f23529` (`refactor(r7.4): introduce explicit inbound operation dispatch`). **This is the R7.5.A starting baseline, NOT proof that R7.5.A has been committed.**

The architecture owner has **approved the high-level option selection**:

| Decision | Approved option | Meaning |
|---|---|---|
| R7.5-D01 | **B** | Improve file receipt consistency with temp write, flush and atomic rename; do not claim proven power-loss durability. |
| R7.5-D02 | **B** | Durable outbox and bounded at-least-once replay after restart. |
| R7.5-D03 | **B** | Idempotent exact-duplicate receipt replay and explicit same-key/different-payload conflict. |
| R7.5-D04 | **B** | Canonical persisted delivery state; notifications are projections. |
| R7.5-D05 | **A** | Preserve M09 `Promise.all`/partial fan-out rejection behavior. |
| R7.5-D06 | **A** | Preserve M16 catalog persistence/DTO/relationship behavior; no data migration. |

**Approval of option B for D01–D04 does NOT approve all detailed protocol/operational settings.** The policy gate in Section 2 is mandatory, and unresolved externally observable details must be reviewed and explicitly approved before implementation that depends on them. One major R7.5.B task, with an internal decision gate; do not divide into micro-tasks or silently adopt proposals.

First:
1. Read `AGENTS.md`, `docs/architecture/PROJECT_STATE.md`, `docs/architecture/ARCHITECTURE_DECISIONS.md`, and relevant `TECHNICAL_DEBT.md` rows.
2. Run `git branch --show-current`, `git rev-parse HEAD`, `git log -1 --oneline`, `git status --short`.
3. Verify R7.5.A work is **committed in `main` history**: `R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md`, `docs/architecture/R7_5_DURABILITY_DECISION_BASELINE.md`, characterization additions to `tests/task-workflow.test.ts`, `tests/resource-selection-workflow.test.ts`, `tests/routing.test.ts`, and relevant docs. If not committed, **STOP with a checkpoint gate report**; do not commit A, reset, stash, or begin B.
4. Record actual committed post-A base SHA. Preserve unrelated edits. If overlapping edits exist, STOP and identify collision rather than overwriting.
5. No commit/push without explicit approval. No R7.5.C or R7.6 implementation.

## 1. Relevant source and compatibility invariants

Read the R7.5.A report/baseline and inspect current implementation/tests, focusing on:
- M12 `task-workflow.ts`, `task-file-store.ts` (F08/F09).
- M13 `resource-selection-workflow.ts`, `resource-selection-store.ts`.
- M05 `peer-gateway.ts`, `socket-peer-message-delivery.ts`; M04 PServer transport/protocol; M10 delivery service; M02 composition/startup only where needed for outbox recovery wiring.
- M09 `messaging.ts`/`message-router.ts` for **preservation**, not rework.
- M16 catalog for **preservation**, not migration.
- Existing filesystem tests, workflow tests and local test harness.

The current `received` ACK follows the existing receipt write and synchronous workflow steps, but currently does not mean fsync, peer delivery, or business completion. `setImmediate` deferred work is volatile; duplicate policy differs for F08/F09 vs M13. M13 has separate mutable delivery sidecar. M09 concurrent fanout can partially succeed and later reject. Preserve R5-D06 distinct ACK semantics, R5-D07 domain-specific repositories, R5-D08 external contract compatibility, R7.3 D01–D04, R7.4 dispatch precedence, R7.2 logical destination affinity, and existing authenticated source semantics. Do not introduce a generic persistence framework or a new module cycle merely to centralize files.

## 2. Mandatory policy-finalization gate — BEFORE behavior implementation

Prepare **one coherent policy package** `docs/architecture/R7_5_RELIABILITY_POLICY.md` (or clearly marked PENDING draft until approved). For each item record: *current behavior, proposed exact policy, rationale, public compatibility impact, alternatives, tests, rollout/backfill, rollback, status (APPROVED / REQUIRES OWNER APPROVAL), responsible boundary*. Do not conflate a recommendation with approval.

Resolve together, not as separate Codex subtasks:

### P01. Receipt and persistence semantics (D01=B)
- Define exactly when F08/F09/M13 `received` may be returned relative to a complete canonical receipt **and recoverable outbox intent**. A receipt without recoverable intent must not be misrepresented as replay-safe.
- Specify one coherent commit protocol: staging file naming, exclusive creation/duplicate concurrency, file flush (`FileHandle.sync` or documented equivalent), atomic rename on same filesystem, directory-sync attempt and portability/error policy, cleanup of interrupted temp files, file modes, and interpretation on restart. A standalone atomic rename of receipt and a separate outbox file is **not** a multi-file transaction: design a recoverable intent/receipt state machine or a single authoritative record with testable reconciliation.
- Clarify file vs SQLite catalog boundaries; D06=A prohibits migration. Document that SIGKILL tests are **process-crash tests**, not proof of power-loss durability.

### P02. Remote ACK and uncertain delivery (D02=B)
- Define transport ACK vs remote acceptance vs remote business completion separately for EServer and PServer. Inspect actual M03/M04/M05/M10 code and tests before proposing classification.
- Provide a table for: positive ACK, explicit negative ACK, timeout, disconnect, in-flight disconnect after send, missing ACK, malformed response, local exception, remote offline and process death after remote acceptance but before durable state update.
- Define which conditions transition to `delivered`, `retryable`, `permanentFailure`, or **`uncertain`**, and whether an uncertain item is automatically retried **only if deduplication is contractually supported by the remote receiver**. Unknown remote semantics cannot be declared reliable from local tests.
- Preserve current public ACK/event payloads unless the owner explicitly approves a versioned change. Do not claim exactly-once or guaranteed remote completion.

### P03. Retry/outbox operations (D02=B)
- Propose explicit attempt semantics (whether initial send counts), backoff schedule, jitter policy for deterministic testing, max attempts, total retry horizon, offline recovery, startup scanning/order/concurrency, claim/lease/restart behavior, in-flight state recovery, and terminal outcome (dead-letter/manual reconciliation).
- Define bounded capacity/backpressure, poison-item isolation, corrupt/partial records handling, disk-full/permission errors, observability without exposing secrets, and manual reconciliation mechanism. Ensure a permanent failure does not accidentally become an infinite replay loop.
- Offer **concrete recommended numerical defaults** with reasons and configuration/compatibility implications, but mark such defaults `REQUIRES OWNER APPROVAL` unless prior repo policy explicitly authorizes them. No arbitrary sleep in tests. Do not silently impose retry on endpoints with unverified remote idempotence.

### P04. Idempotency keys, conflicts and retention (D03=B)
- Define separately F08 request, F09 result, and M13 selection. Candidate F08/F09 keys involve `task.id` **with operation identity separated**; for M13 use authenticated sender identity + supplied stable `message.id` if present. Decide precisely what happens when M13 ID is absent (explicitly non-deduplicable or an owner-approved change; never guess a stable key from identical payload alone).
- Define canonical comparison/hash of immutable payload fields, handling of timestamp / generated IDs / authenticated instance / optional metadata, exact-duplicate replay of original receipt/ACK fields, same-key/different-content conflict ACK mapping, and simultaneous duplicate submissions. `task.id` alone across request/result must not cause accidental collision.
- Define dedupe retention duration and whether dedupe may expire independently of outbox/replay records; define safe garbage collection, startup recovery, old-file backfill, file collisions, and what rollback means for data and keys. **Retention must cover the maximum replay/retry horizon**; cite invariants and migration strategy.
- Approval of D03=B is not approval to introduce a new public error code or body; where unavoidable, flag a breaking-contract decision before implementing.

### P05. Canonical delivery state (D04=B)
- Decide canonical state machine (e.g. `pending`, `attempting`, `delivered`, `retryable`, `uncertain`, `failed`), valid monotonic transitions, crash boundaries, and projection back to existing M12/M13 public statuses (`received`, `forwarded`, `forwardFailed`, `pending`). Distinguish remote transport success from business completion.
- Eliminate authoritative divergence between M13 live notification and persisted sidecar using one recoverable canonical source and projection. Define ordering of persisted transition vs live publish; what happens when status persistence succeeds but notification fails (and vice versa). Preserve prior history/reader format or include explicit compatibility reader/migration.
- Define how stale/corrupt/missing status is handled on restart and how an operator sees unresolved work.

### P06. Cross-cutting policy and operational gates
- Distinguish at-least-once **attempts**, delivery acknowledgement and downstream **side effects**. Document dependency on peer-side idempotency, which may not be proven by AAB tests alone.
- Provide a compatibility/consumer-impact matrix for M04/M05/M10/M12/M13 and external peer clients, data migration/backfill and reversibility. Retain D05=A (M09) and D06=A (M16).
- Honor TD14/R7.6: no bounded-drain/shutdown redesign in B. Document how outbox remains recoverable if shutdown interrupts work, and leave graceful drain policy to R7.6.
- Define feature enablement/rollout: do not automatically turn on externally consequential replay for unsupported peers. State safe opt-in/disabled behavior, diagnostics, and rollback that preserves queued evidence. Do not invent deployment environment guarantees.

### Gate disposition
At the end of the policy package, explicitly classify:
1. **Already approved**: D01=B, D02=B, D03=B, D04=B, D05=A, D06=A.
2. **Derived internal design decisions**, justified by documented invariants and safe within existing contracts.
3. **Unapproved policy choices** requiring architecture/product/peer-owner decision: remote ACK meaning, replay eligibility, numeric retry limits/horizon, stable ID obligations, conflict wire behavior, retention/expiry, migration and any externally visible change.

**If any decision needed for correct/safe implementation remains unapproved, STOP AFTER PRODUCING THE SINGLE REVIEWABLE POLICY PACKAGE and `R7_5_B_POLICY_GATE_REPORT.md`. Do not implement speculative production behavior or only the easy half of the protocol.** This is an internal decision gate of the same R7.5.B checkpoint, not a new micro-task or a new phase. Once the owner approves outstanding parameters, resume this same R7.5.B task at implementation; do not create a separate roadmap subdivision.

## 3. Approved implementation — ONLY AFTER policy gate is genuinely cleared

When policy approvals are available and recorded, implement the selected D01–D04 upgrade end-to-end within R7.5.B:
- Maintain intent-revealing, cohesive M12/M13 domain-specific store/workflow boundaries, with capability-based injection and explicit startup recovery composition.
- Implement durable receipt/outbox transitions, dedupe and conflict semantics, retry eligibility, bounded replay/terminal states, canonical M13 delivery state and backward-compatible projections **exactly** as approved.
- Make crash windows testable via injected persistence/clock/scheduler/delivery seams; protect against duplicate concurrent submissions, replay races and restart after remote acceptance but before status commit.
- Preserve D05 M09 partial fan-out and D06 M16 current catalog behavior, without catalog migrations.
- Explicitly document which reliability guarantees are demonstrable locally and which require remote integration or R7.5.C runtime/restart tests. No forced exactly-once claim or silent default enablement.

If approval is restricted (e.g. automatic replay cannot yet be enabled for PServer), implement only a **coherent explicitly authorized** subset with safe disabled/uncertain classification and report the remaining gap; do not label whole R7.5.B implemented.

## 4. Verification and evidence

Use repo-supported Node version (prior baseline `v22.23.5`), log actual `node --version`, exit codes, test counts, permissioned local loopback reruns and any blockers. At minimum:

```bash
node --import tsx --test tests/task-workflow.test.ts tests/resource-selection-workflow.test.ts tests/routing.test.ts tests/task-file-store.test.ts tests/resource-selection-store.test.ts tests/aa-catalog-boundary.test.ts
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

Adjust filenames to files actually present; do not falsely claim a command ran if it did not. If stopped at policy gate, execute only checks applicable to any docs/characterization changes and state that implementation verification has **not** occurred.

For implementation, add deterministic controlled-clock/fault-injection tests: write/flush/rename failures; partial atomic state; concurrent duplicates/conflicts; outbox claim/restart; bounded retries; remote ACK negative/timeout/unknown; delivery success before state commit; status store failure; legacy receipt reading; corruption; temporary filesystem cleanup. Save full child-process crash/restart matrix and deployment-specific verification for R7.5.C (do not claim it passed now).

## 5. Deliverables and STOP

**Policy gate, whether approved or blocked**:
- `docs/architecture/R7_5_RELIABILITY_POLICY.md`, with exact decisions, traceability, compatibility/risk matrix, approved vs pending markings and owner questions grouped into **one** decision package.
- `R7_5_B_POLICY_GATE_REPORT.md` when any required detail is pending; list precise decisions, recommended defaults, consequences and blocked implementation scope. No misleading `APPROVED` labels.
- Update `PROJECT_STATE.md` carefully: R7.5.A may already be committed, R7.5.B may be blocked awaiting parameter approvals. Preserve other phase statuses.

**If the policy gate is cleared and implementation is completed**:
- Code, targeted tests and documents covering only approved D01–D04 semantics.
- `R7_5_B_RELIABILITY_UPGRADE_IMPLEMENTATION_REPORT.md` with actual base SHA, approved parameter references, modified paths, state machine/recovery diagram, migration/rollout notes, test outcomes and residual risks.
- Update relevant TD10/TD11 and R7.5 checkpoint state; leave TD12/TD13 unchanged except cross-links justified by D05/D06.

**STOP for reviewer approval. No commit/push, no R7.5.C or R7.6.** Do not treat this task as license to make unapproved external contract, retry, data migration, or business behavior changes.
