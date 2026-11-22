# Codex Task — R7.5.B Stage 2: Conservative Reliability Implementation

## 0. Task authority and hard gate

Repository: `vutuantrung/base-aa-backend`; target branch: `main`.

Last independently verified GitHub HEAD when this prompt was prepared:
`33061c8eea051cfcfba9ad7356e51233a2c1980d` (`update 11212248`).
It contains the R7.5.B Stage 1 policy package and gate report; do not assume it is still HEAD without checking.

**User/architecture-owner approval for Stage 2:**
- R7.5-D01=B, D02=B, D03=B, D04=B, D05=A, D06=A.
- Approve the **Conservative Reliability Policy P01–P06** as specified below, with explicit limits on replay, compatibility, retention, and storage operations.
- Scope remains **R7.5.B Stage 2**, one substantial implementation task. Do not split into micro-tasks or prematurely start R7.5.C/R7.6.

**Before coding:**
1. Read `AGENTS.md`, `docs/architecture/PROJECT_STATE.md`, `docs/architecture/ARCHITECTURE_DECISIONS.md`, `docs/architecture/R7_5_RELIABILITY_POLICY.md`, `docs/architecture/R7_5_DURABILITY_DECISION_BASELINE.md`, `R7_5_B_POLICY_GATE_REPORT.md`, and the R7.5.A report. Read exact current M12/M13 store/workflow, M04/M05 delivery, M10, M09, and relevant tests, only expanding where needed.
2. Run `git branch --show-current`, `git rev-parse HEAD`, `git log -1 --oneline`, `git status --short`. Confirm Stage 1 documents are **committed** on `main` and report actual base SHA. If baseline is missing or relevant local changes conflict: **STOP**, do not reset/stash/overwrite anything.
3. Reconcile the policy document's **PENDING** text against these newly supplied explicit owner approvals; amend the architecture decision record accordingly. Historical descriptions and the earlier gate report remain historical evidence, not current blockers once the exact policies are recorded.
4. Work only on approved source/test/docs; no commit/push unless separately authorized. Preserve unrelated work.

## 1. Binding conservative policy — implementation contract

### P01 — Receipt commitment and atomic state

- Introduce a **versioned, canonical, per-operation persistent record** that contains receipt data, exact original ACK response for duplicate replay, effective target/authenticated source, stable outbound message identity/payload, dedupe key/fingerprint where applicable, delivery state and attempt metadata. Receipt and its initial outbox intent **must be committed together**; do not accept a receipt with a volatile-only outbox entry.
- For new records: same-directory exclusive temporary file (`wx`, `0600`), complete serialization, `FileHandle.sync()`, close, then atomic publication to canonical path. Attempt directory sync where supported. Clearly distinguish a) failure before publication, b) publication succeeded but directory sync/result is uncertain. No ACK `received` unless the committed canonical state is confirmed according to the chosen protocol. Do not claim universal power-loss durability.
- **Critical:** ordinary `rename(temp, existingTarget)` may overwrite a file, so it is not by itself collision-safe. Ensure canonical creation and duplicate-key handling are non-overwriting/serialized; design and test the platform-compatible no-overwrite publication strategy (e.g., exclusive hard link on supported local filesystems or another proven atomic create protocol). If the supported platform/filesystem cannot satisfy the intended guarantee, **STOP with evidence rather than implementing an unsafe approximation**.
- Single active AAB writer per state directory is an **explicit deployment invariant**, supplemented with in-process per-key serialization. Do not imply cross-process locking where none exists. Document startup detection/operational safeguards and directory configuration isolation.
- Directory sync errors: if unsupported by an explicitly documented platform/filesystem, record/report the limitation and continue **only under the approved process-crash-consistency boundary**; unexpected errors after publication require `uncertain` commit reconciliation and no sending until resolved. Never return a confidently failed receipt if a canonical record may already exist without preserving/reconciling it.
- On startup, validate record schema/version/checksum; exclude incomplete temp files from receipt visibility; reconcile or quarantine suspicious temp/canonical collisions. Never overwrite an existing canonical receipt or silently discard it. Existing task and selection files remain readable, **legacy read-only/no automatic replay or automatic backfill**. Do not change M16 SQLite catalog.

### P02 — Remote ACK / replay safety

- Keep the existing public Socket.IO event names, `peer:message` payload envelope, ACK shapes and 5,000 ms peer ACK timeout unless required for an explicitly approved, evidence-backed compatibility-preserving internal adapter change. `ok:true` means **peer protocol ACK accepted**, not guaranteed remote persistence or business completion. No exactly-once assertion.
- Distinguish **proven pre-send / no `emit` invoked** from **send may have begun**. Proven-unsent offline/unavailable and demonstrably pre-emit errors can become `retryable`. Local invalid input is terminal `failed`.
- Persist `attempting` **before** invoking transport. Once an emit could have started, timeout, disconnect, malformed/missing ACK, exception of ambiguous phase, process death or unverified negative ACK -> `uncertain`, **no automatic retry**. On restart stale `attempting` -> `uncertain`. Only an independently evidenced and explicitly approved receiver stable-ID dedupe guarantee could permit post-send replay; **none is currently approved**, so leave it disabled for **all** existing EServer/PServer receivers.
- `ok:true` -> `delivered` only after persisted state update; `ok:false` remains nonretryable (`failed` only if proven no side effect, otherwise `uncertain`). Do not invent retryable negative ACK codes, remote dedupe, or new wire semantics.
- A destination-ready event may wake a scheduler but **never changes an item's eligibility**. Initial intended send should continue for new accepted work under the approved safe state transition; do not accidentally disable all normal processing while disabling unsafe replay.

### P03 — Retry/backpressure operations (approved configurable defaults)

| Setting | Approved default |
|---|---|
| Total send attempts | **6**: initial + **5** retries |
| Retry delays | **2s / 10s / 60s / 300s / 1800s** |
| Jitter | **Equal jitter:** uniform in `[delay/2, delay]` |
| Maximum item age | **24 hours** |
| Startup scan | **Oldest first**, batch **100**, concurrency **4** |
| Active capacity | **10,000 records OR 256 MiB**, first limit reached |
| Wake-up | Startup scan and eligible destination-offline-to-ready trigger; periodic bounded scan if required to meet due times |

- The defaults should be configuration-backed/testable, not magic numbers scattered across workflow implementations. Use injectable clock/random and controlled scheduler; no flaky sleeps. Preserve strict per-item attempt/accounting on restart. The attempt limit and age bound terminate automatic retry; exhausted items need terminal/manual-review visibility, not a perpetual retry loop.
- Capacity checks must reject **before** issuing receipt ACK or committing an accepted new record; use existing `DELIVERY_FAILED` ACK code for backpressure with a stable, non-sensitive error message. Never report `received` for an item not committed. Count/archive evidence consistently: capacity/retention must not silently delete dedupe keys or queued/uncertain items. For a single-process writer, make capacity reservation and concurrency behavior deterministic under parallel intake.
- Corrupt/poison records: quarantine individually with key/reason and operator-visible diagnostics; do not leak secrets/payloads in routine logs. Continue processing unrelated healthy keys. No automatic deletion or unsafe replay of quarantined records.

### P04 — Idempotency, conflict, retention

- **F08 key:** `F08:<task.id>`, fingerprint of validated task and captured effective EServer target.
- **F09 key:** `F09:<task.id>`, fingerprint of validated result plus **authenticated** EServer `sourceInstanceId`; do not trust `from` field as authority.
- **M13 key:** authenticated AAUI identity plus caller-supplied stable incoming `message.id`; fingerprint of normalized selection plus relevant immutable semantic envelope. If no stable ID is supplied: **retain existing non-deduplicated submission behavior**, generate independent receipt for each arrival. Do not dedupe solely by equal selection content or a generated ID.
- Canonicalize semantic objects deterministically; deliberately document included/excluded fields, especially effective target, actual authenticated identity and volatile timestamp. If same key+digest returns, replay **the exact previously committed receipt ACK envelope** (IDs/timestamps unchanged), do **not** schedule a second send. Same key+different digest -> existing public `INVALID_MESSAGE` code with stable conflict text; **do not add a new public ACK code**. Serialization/concurrency must ensure one committed record and deterministic concurrent duplicate outcomes. The new conflict behavior is an explicitly approved compatibility change; add contract tests.
- **Retention:** no time-based dedupe-key expiry/GC until a verified sender retry horizon and separate owner-approved retention policy exist. Keep dedupe identity through active and terminal records; finite active capacity is enforced without silently evicting dedupe evidence. If archival/space pressure cannot be resolved safely, reject new intake with `DELIVERY_FAILED` and expose operator diagnostics. Never erase keys to make space. Any proposed archive tool must preserve dedupe lookup semantics and rollback visibility.
- No automatic migration, backfill, dedupe reconstruction or replay of pre-R7.5 records; read-only legacy compatibility. Include tests for duplicate across restart and missing-ID behavior.

### P05 — Canonical state, public projections and notifications

Canonical states: `queued`, `attempting`, `retryable`, `delivered`, `failed`, `uncertain`. Allowed transitions must be explicit/validated, including recovery after restart. Persist the canonical state before emitting related live notification. Treat notifications as **best-effort projections**, never a second transaction participant.

Legacy status projections for M13: `queued/attempting/retryable/uncertain -> pending`; `delivered -> forwarded`; `failed -> forwardFailed`. Document the approved change in status timing (offline may remain `pending` while an eligible retry is pending). If notification emit fails, canonical state is unchanged; snapshots recover the persisted projection. M12 F08/F09 lifecycle notifications similarly must not fabricate forwarding success or roll back receipt. Preserve event names/payload field shapes and original ACK shape.

Legacy M13 sidecars: remain readable; absence/unknown state behaves per existing legacy reader; corrupt legacy artifacts remain visible as an operational error (or isolated quarantine) rather than silently converted to a successful state. New canonical records are authoritative for new writes. Define precedence explicitly so stale sidecars never override canonical state. No mixed-format write corruption.

### P06 — Rollout, operator safety and deferred boundaries

- New-format intake and normal first-attempt delivery may be enabled after verified commit; **automatic retry only for proven-unsent items**. Replay of `uncertain`, unverified remote peer deliveries, and any legacy record stays **disabled by default**. Rollback must retain all canonical, queued, uncertain, failed and quarantined evidence; no destructive reset.
- Provide meaningful diagnostics/inspection for queue depth, due retries, uncertain items, quarantine, terminal failures and capacity pressure without logging sensitive data. Manual reconciliation may be documented, but **do not invent a wire-level operator API** or auto-replay uncertain items.
- D05=A: leave M09 generic fan-out / `Promise.all` semantics unchanged. D06=A: leave M16 catalog schema/DTO/migration unchanged. TD14/R7.6 bounded shutdown is **not part of this task**. Existing R7.3 ACK gating and R7.4 explicit dispatch remain untouched; preserve R7.2 logical destination-instance affinity.

## 2. Implementation approach and architecture constraints

Implement the smallest coherent set of changes that delivers the above invariants. A suitable design includes:
- Domain-owned M12/M13 receipt/idempotency and delivery status ports; reusable *internal* atomic JSON record storage only where it meaningfully removes duplication. Avoid a generic workflow framework, service locator, or circular runtime dependency.
- A narrowly scoped persistence/outbox capability and deterministic scheduler, with injectable clock/random, IO, delivery and diagnostics. Keep new state encapsulated; do **not** leak outbox metadata into public `PeerMessage` envelopes or mutate the generated receipt ACK for normal first arrival.
- Preserve public application exports/constructors or explicitly stop on compatibility conflict; composition stays in M02/M05 as appropriate. Use Intent-Revealing Methods and Extract Method. Avoid giant orchestration methods, speculative abstractions and unrelated refactoring.
- Confirm that `TaskFileStore.saveResult` relationship/correlation checks still hold, that F08 target affinity survives restart, that F09 authenticated source instance survives restart, and that M13 persistence/result projection cannot contradict the canonical state.
- Preserve existing `AAB_TASK_STORE_DIR` / `AAB_SELECTION_STORE_DIR` legacy behavior and document how new state directory relates. Avoid writing mixed-format new records into paths interpreted as legacy `task-*.json` or selection `<uuid>.json` unless backward reader behavior is demonstrably preserved.

**Critical gate inside Stage 2:** If a required invariant cannot be satisfied without an unapproved public change, cross-process assumption, receiver-side guarantee, or unsafe on-disk collision behavior, STOP, document exact evidence and minimal viable alternatives. Do not weaken an approved safety rule for the sake of completing the task.

## 3. Acceptance tests (not exhaustive)

Use Node v22.23.5 compatible with `better-sqlite3`; create isolated temporary directories and deterministic fakes. Add focused tests for each of the following:

1. Receipt write, sync, close, publish, directory sync and record/capacity failure; ACK only after valid canonical commit; correct handling when commit outcome is uncertain.
2. Same-key concurrent intake and cross-restart exact duplicate ACK replay (same IDs and timestamps); conflicting duplicate returns `INVALID_MESSAGE`; F08 vs F09 key isolation; F09 authenticated instance and F08 captured target in digest; M13 with/without caller ID.
3. Canonical state transition assertions; persist before send; crash/restart stale `attempting` -> `uncertain`; no duplicate send for `uncertain` even after destination-ready signal.
4. Proven-unsent retry schedule/bounds (initial+5, delays/jitter, 24h age) using fake time; 100 batch, concurrency 4, 10k/256 MiB capacity logic and race-free quota reservations.
5. `ok:true` means delivered peer ACK only; negative/malformed ACK, timeout, ambiguous transport failures and partial state-store failure do not become unsafe auto-retries.
6. M13 status sidecar/canonical precedence, live notification failure, snapshot after restart and no status mutation falsely implying delivery.
7. Legacy F08/F09 and M13 files remain readable but no automatic replay, no automatic migration; invalid/corrupt new canonical files quarantine without blocking healthy items.
8. Existing F08/F09/M13 ACK receipt ordering and lifecycle behavior, M04/M05 no-ACK gate, R7.4 dispatch, R7.2 logical destination affinity; M09/M16 behavior unchanged.
9. Child-process termination/restart if feasible in this stage, with granular crash-boundary harness for R7.5.C. Do not claim OS/power-loss proof from SIGKILL.

Run and report **actual** results:
```bash
node --version
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```
Also run all relevant new focused tests explicitly. If sandbox blocks loopback, request narrowly scoped permission and clearly separate blocked attempts from successful runs. Do not claim tests passed without execution.

## 4. Documentation and deliverables

Update:
- `docs/architecture/ARCHITECTURE_DECISIONS.md` — record **approved detailed P01–P06** including exceptions, exact config defaults and real-remote evidence limits.
- `docs/architecture/R7_5_RELIABILITY_POLICY.md` — update pending/approval markers only where user has explicitly approved; document implemented behavior, deviations and residual risks.
- `docs/architecture/PROJECT_STATE.md` and TD10/TD11 (plus exact affected TDs only) in `TECHNICAL_DEBT.md` — mark implemented vs verified vs still open, especially no receiver dedupe, no remote durability proof, legacy no replay and TD14 deferred.
- Operation/runbook documentation for state directory, single-writer ownership, capacity, quarantine, no-key-expiry, safe rollout/rollback and manual review.

Create repository-root:
`R7_5_B_CONSERVATIVE_RELIABILITY_IMPLEMENTATION_REPORT.md`

The report must include actual base HEAD, modified files, design and state machine, detailed approval-to-code/test trace, external compatibility effects (especially duplicate/conflict ACK and changed status timing), precise fault tests/exits, remaining uncertainty and whether Stage 2 is **IMPLEMENTED**, **PARTIALLY IMPLEMENTED** or **BLOCKED**. Distinguish modeled process crash from real production receiver semantics.

**STOP for reviewer review. Do not commit/push. Do not begin R7.5.C or R7.6.**
