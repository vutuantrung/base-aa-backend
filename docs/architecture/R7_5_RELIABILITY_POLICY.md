# R7.5 Reliability Policy — Owner Decision Package

## Status and authority

Prepared against committed `main` HEAD `464d88fa50a5060a83f8395cd1a64312e0b9c12f`.
The owner has approved the high-level selections D01=B, D02=B, D03=B, D04=B,
D05=A and D06=A. That approval does **not** approve the detailed settings below.
All proposed details marked **REQUIRES OWNER APPROVAL** remain pending. No runtime
implementation is authorized until the gate report's required decisions are answered.

The current-behavior evidence is in [R7.5.A baseline](R7_5_DURABILITY_DECISION_BASELINE.md)
and [A report](../../R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md).
R5-D06/D07/D08, R7.2 destination affinity, R7.3 D01–D04 and R7.4 dispatch precedence
remain binding. This package does not claim power-loss durability or exactly-once work.

## P01 — Receipt commit and persistence boundary (D01=B)

| Item | Proposed policy |
|---|---|
| Current | M12/M13 ACK after final-path JSON write and current synchronous workflow steps; no explicit flush, atomic replacement or recoverable intent. |
| Exact proposed boundary | Return `received` only after one canonical record containing the validated receipt, original receipt ACK data, stable outbound message, dedupe identity/content digest, target/authenticated source, and initial delivery state has been committed. Do not split receipt and outbox into unrelated files. |
| Commit protocol | Same-directory temp `.<record-key>.<revision>.<random>.tmp`, opened exclusively (`wx`, mode `0600`); write complete serialized record; `FileHandle.sync()`; close; atomically rename to canonical key path; attempt directory sync. Temp and canonical files must be on the same filesystem. Startup validates schema/version and digest; incomplete temp is not a receipt. |
| Directory sync / errors | **Requires approval:** recommended to attempt directory sync where supported, warn on documented unsupported-platform errors, and fail acceptance on other errors. If rename succeeded but directory sync failed, read back canonical record and report commit as uncertain; do not schedule/send until reconciliation. No universal power-loss promise. |
| Concurrency/recovery | **Requires approval:** a single writer per state directory, enforced within this process by per-key serialization and operationally by one AAB process. A portable cross-process lock has not been identified. Startup must reconcile valid temp/canonical pairs without overwriting an existing key; conflicting/corrupt artifacts go to quarantine and block that key for operator review. |
| Compatibility / rollout | ACK timing increases to include sync/rename. Existing F08/F09/M13 files remain legacy-readable and are not auto-replayed or backfilled: their prior side effects/targets are unknown. New record format is versioned. Rollback disables new intake/replay but preserves canonical and quarantined evidence. |
| Tests / boundary | Inject write, sync, close, rename and directory-sync failures; concurrent duplicate; temp recovery; existing canonical collision; child-process termination. SIGKILL tests prove process-crash behavior only, not OS/power-loss durability. SQLite catalog remains outside this file protocol; D06=A prohibits catalog migration. |
| State / owner | **REQUIRES OWNER APPROVAL** — M12/M13 stores and application composition. |

## P02 — Remote acknowledgment and uncertain outcomes (D02=B)

Current source: M05 `SocketPeerMessageDelivery.deliver` and M04 PServer delivery both use
`peer:message` `emitWithAck(..., 5000)` and accept only a truthy `response.ok`. This is a
transport/application ACK in the existing protocol, not proof of remote persistence or
business completion. The peer receiver's deduplication and side-effect semantics are unknown.

| Observed result at send boundary | Proposed canonical state | Automatic retry proposal |
|---|---|---|
| Offline before send, validated locally and no emit invoked | `retryable` | Retry within approved bound; no remote side effect was initiated. |
| `ok:true` response | `delivered` (means peer ACK only) | None. Do not label business work complete. |
| Explicit `ok:false` | `failed` unless a documented peer error explicitly guarantees transient/no-side-effect semantics | No retry by default; current ACK has no agreed transient classification. |
| Timeout, disconnect after emit, missing or malformed ACK, local exception after emit begins | `uncertain` | No automatic retry unless that destination's receiver has a contractually approved stable-ID dedupe guarantee. |
| Local validation/serialization failure before emit | `failed` | No retry. |
| Process death after remote acceptance but before local state commit; stale `attempting` at restart | `uncertain` | Same restriction as timeout; receiver may already have acted. |
| Negative ACK after possible remote side effect | `uncertain` unless peer contract proves rejection means no side effect | No retry absent dedupe. |

**Requires owner/peer approval:** define whether existing `ok:true` means receipt by the
handler or a stronger promise; define any `ok:false` retryable codes; approve per-peer
replay eligibility. Recommended conservative default: only retry proven pre-send offline
and failures proven to occur before emit; classify all post-invocation ambiguity as
`uncertain`. Internal adapter errors may need a typed distinction between pre-send and
post-send; do not change public ACK/event payloads.

Compatibility: external peers may observe duplicate `peer:message` deliveries if replay is
enabled. AAB tests cannot prove their idempotency. **Status: REQUIRES OWNER AND PEER-OWNER
APPROVAL.**

## P03 — Outbox limits, retry schedule and operations (D02=B)

Concrete proposal for decision, not an approved runtime default:

| Parameter | Proposed default | Rationale / status |
|---|---:|---|
| Total sends | 6 (initial + 5 retries) | Bounds repeated side effects; **approval required**. |
| Delays | 2s, 10s, 60s, 300s, 1800s | Bounded recovery without unbounded retry; **approval required**. |
| Jitter | Equal jitter in `[delay/2, delay]`, injected deterministic random source in tests | Avoid synchronized fleet retries; **approval required**. |
| Max item age | 24h | Operator escalation bound; retry cap occurs first for this schedule; **approval required**. |
| Startup scan | Oldest first, batches 100, concurrency 4; also trigger on destination-ready event | Prevent startup burst; no such readiness recovery contract currently exists; **approval required**. |
| Active capacity | 10,000 records or 256 MiB, whichever first | Bounded disk use; reject before `received`; **approval required**. |
| Poison/corrupt items | Quarantine individually; continue other keys; expose key/reason to operator, never payload/secrets in routine logs | Isolate damage; quarantine format and operator tool require approval. |

Initial send counts as attempt 1 and persist `attempting` before transport invocation. A
crash in `attempting` recovers to `uncertain`, not `retryable`. `retryable` is only for a
known-unsent result or an approved peer-idempotent class. Exhausted/expired items become
terminal `failed`/manual-review records and are not replay loops. Disk-full/permission
errors block new receipts before ACK; preserve existing public error mapping only if the
owner approves that compatibility consequence. Backpressure response cannot be finalized
without an approved existing ACK mapping.

No timer-based unbounded retry. Proposed scheduler uses a controlled clock and injectable
jitter, not wall-clock sleeps in tests. **All numeric values, capacity response, offline
trigger, and operator reconciliation mechanism: REQUIRES OWNER APPROVAL.**

## P04 — Idempotency keys, conflict and retention (D03=B)

| Operation | Proposed key and canonical comparison |
|---|---|
| F08 request | `F08:<task.id>`; compare validated task plus effective captured EServer target. Operation prefix prevents collision with F09. |
| F09 result | `F09:<task.id>`; compare validated result plus authenticated `sourceInstanceId`; never trust envelope `from` as authenticated identity. |
| M13 selection | Authenticated AAUI identity + supplied stable incoming `message.id`; compare normalized selection and immutable semantic envelope. If ID absent, do not dedupe; do not hash identical selection into a synthetic key. |

Proposed canonicalization recursively sorts object keys over validated semantic fields.
Capture and replay the first complete ACK envelope (including generated IDs/timestamps) so
an exact duplicate returns the same receipt ACK and does not enqueue again. Include routing
target and authenticated instance in digest. Exclude only explicitly volatile transport
metadata after owner review. Same key/different digest is a conflict. Simultaneous same-key
arrivals serialize on the key; one commits and the other reads the committed result.

**Wire conflict mapping is unresolved:** current public ACK codes do not define an
idempotency conflict code. Recommendation is reuse `INVALID_MESSAGE` with a stable conflict
message only if product accepts this new observable mapping; otherwise use an existing
`DELIVERY_FAILED` mapping with its weaker semantics. Do not add a code/body without explicit
approval. Both alternatives require consumer review.

Retention proposal: retain dedupe identity while outbox is active and for **90 days after
terminal state**, then garbage-collect receipt and key atomically. However the external
sender retry horizon is unknown; safe recommendation is **no expiry until sender retry
horizon is documented**, with capacity limits and operator archival instead. Owner must
choose horizon/GC policy. Retention must be no shorter than max retry horizon. Legacy files
cannot safely be backfilled into outbox or dedupe records because target, generated ACK
envelope and prior-send state may be unknown. No automatic backfill/replay.

**Requires owner/product/peer approval:** absent M13 ID behavior, semantic digest fields,
conflict ACK mapping, retention/expiry, and migration/capacity trade-off. Tests: exact replay,
conflict, concurrent duplicate, operation separation, F09 authenticated-instance key,
M13 missing-ID behavior, expiry boundary and restart.

## P05 — Canonical delivery state and projections (D04=B)

Proposed state machine (not implemented):

```text
queued -> attempting -> delivered
                    -> retryable -> attempting
                    -> uncertain (manual or approved dedupe-safe replay only)
                    -> failed (terminal)
```

`attempting` is persisted before send. Restart converts stale `attempting` to `uncertain`;
it must not infer unsent. `delivered` means peer ACK accepted under the approved protocol,
not business completion. Retry count/age exhaustion moves `retryable` to terminal `failed`.
Only operator reconciliation or explicit peer-idempotence policy can move `uncertain` back
to `queued`.

Proposed legacy public projection: `queued/attempting/retryable/uncertain -> pending`,
`delivered -> forwarded`, `failed -> forwardFailed`. This changes timing versus current
immediate `forwardFailed` on offline/rejection and needs approval. Persist canonical state
before publishing live status. If persist succeeds and publish fails, canonical record is
truth and a later snapshot can project it; a missed live event is not guaranteed. If publish
is needed for accepted work, use a durable notification cursor in the record or another
approved projection mechanism. No dual-write can guarantee both file state and an external
Socket.IO notification atomically.

Legacy M13 sidecars remain readable during rollout; absent status continues to map to
`pending`. Corrupt sidecar handling and stale sidecar precedence require explicit migration
rules. Proposed startup quarantines corrupt canonical records and reports them, rather than
silently treating them as pending. **State names, projection/timing, corrupt/missing data
policy and operator visibility: REQUIRES OWNER APPROVAL.**

## P06 — Compatibility, rollout and adjacent decisions

| Boundary | Compatibility constraint / proposed impact |
|---|---|
| M04/M05 ingress | Keep ACK gate and inbound ACK shape. New receipt commit delays `received`; external senders may time out sooner than the stronger commit completes. No synthetic ACK/retry. |
| M10 / M05 / M04 outbound | Keep `peer:message` schema, current 5s timeout and ACK shapes. Replay can duplicate delivery; enable only per receiver with approved stable message-ID dedupe. |
| M12 F08/F09 | Keep event names and receipt ACK envelope. Exact duplicate replay changes current duplicate error into prior ACK; same-key conflict needs approved mapping. |
| M13 | Keep public event/payload schema. Canonical status projection may delay `forwardFailed` and alter when `pending` appears. |
| External peers | Receiver dedupe, retry horizon and ACK meaning are unknown. Local compatibility is insufficient to enable ambiguous replay. |
| M09 / TD13 | D05=A: preserve concurrent `Promise.all`, partial side effects and rejection semantics. No outbox integration. |
| M16 / TD12 | D06=A: preserve catalog DTO/relationship behavior; no schema/data migration in this work. |
| TD14 / R7.6 | No bounded shutdown drain redesign here. Outbox records remain on disk if shutdown interrupts; startup reconciliation is separate. R7.6 owns drain/close ordering and timeout. |

Recommended rollout: new durable receipts commit before ACK, but automatic replay remains
disabled per destination until dedupe support is evidenced and approved. A safe disabled
mode can retain queued/uncertain records for operator visibility, not claim successful
forwarding. Rollback disables new replay and retains all records/keys; never delete queued
evidence during rollback. Legacy records are read-only and never auto-replayed.

This rollout behavior itself changes current delivery behavior and requires owner approval.
No production data or peer integration is available in this checkpoint.

## Gate disposition

### Already approved (high-level only)

- D01=B atomic replacement/flush, without proven power-loss durability.
- D02=B durable outbox and bounded at-least-once replay.
- D03=B exact duplicate idempotency and same-key/different-payload conflict.
- D04=B canonical persisted delivery state with notifications as projections.
- D05=A preserve M09 fan-out behavior; D06=A preserve M16 behavior/no migration.

### Derived internal design proposals

Single canonical per-operation record instead of a receipt/outbox multi-file transaction;
persist `attempting` before send; use explicit `uncertain`; separate operation keys; never
backfill legacy records into automatic replay. These reduce inconsistent states but still
need approval where they alter current stored format or observable status.

### Unapproved decisions blocking implementation

1. Meaning of remote positive/negative ACK and per-peer dedupe/replay eligibility.
2. Retry counts, schedule, jitter, horizon, scan/batch/concurrency, capacity and backpressure ACK.
3. Canonical key/hash fields, M13 missing-ID handling, conflict wire code/body and exact duplicate ACK replay fields.
4. Retention/expiry, safe GC, legacy reader/backfill, corrupt-record and quarantine policy.
5. State-to-public-status projection and timing; persistence/notification failure handling.
6. Single-writer guarantee, directory-sync portability/error policy, rollout/disabled mode and operator reconciliation.

**Overall status: REQUIRES OWNER APPROVAL.** See [R7.5.B policy gate report](../../R7_5_B_POLICY_GATE_REPORT.md).
