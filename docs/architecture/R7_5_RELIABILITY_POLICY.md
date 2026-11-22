# R7.5 Reliability Policy — Approved Stage 2 Contract

## Authority and status

The architecture owner approved D01=B through D04=B, D05=A, D06=A and detailed P01–P06
for this Stage 2 implementation. These decisions supersede the pending proposal language
in the historical [Stage 1 gate report](../../R7_5_B_POLICY_GATE_REPORT.md). The R7.5.A
current-state evidence remains in the [durability baseline](R7_5_DURABILITY_DECISION_BASELINE.md)
and [A report](../../R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md).
Implementation evidence and deviations are recorded in the
[Stage 2 report](../../R7_5_B_CONSERVATIVE_RELIABILITY_IMPLEMENTATION_REPORT.md).

Approval establishes the local AAB contract. It does not establish receiver-side
idempotency, remote business completion, exactly-once behavior, or OS/power-loss durability.
The state directory requires one active AAB writer. Existing legacy files remain readable
but are not replayed or migrated automatically.

## P01 — Receipt commit and persistence boundary (D01=B)

- New F08, F09 and M13 operations use one versioned canonical JSON record containing the
  receipt ACK, normalized receipt, authenticated source/effective target, prepared outbound
  message, dedupe key/fingerprint, delivery state and attempt metadata. Receipt and initial
  outbox intent are committed together.
- Records live under `.r7.5-outbox` inside the configured legacy workflow directory:
  `AAB_TASK_STORE_DIR` or `AAB_SELECTION_STORE_DIR`. Legacy task/result/selection files
  retain their old read format and are written only as secondary compatibility projections.
- Create protocol: serialize a complete record into a same-directory `wx` temporary file,
  mode `0600`; `writeFile`; `FileHandle.sync`; close; hard-link the temp to the canonical
  hash path (atomic and non-overwriting); remove the temporary link; attempt directory
  sync. State replacement uses a synced same-directory temp followed by atomic rename.
  The hard-link protocol assumes the configured local filesystem supports same-directory
  hard links; unsupported publication fails closed.
- Directory sync is attempted. Known unsupported platform errors are logged and accepted
  only within the process-crash-consistency boundary. An unexpected error after publication
  triggers canonical uncertain-state reconciliation; if it cannot be confirmed, that key is
  blocked/quarantined and no send is scheduled. No `received` ACK is returned for an
  unconfirmed initial commit.
- Startup validates format version/checksum and filename/key agreement. Incomplete temps
  are excluded from receipt visibility and quarantined; a temp identical to a valid
  canonical record is resolved as duplicate evidence. Corrupt or conflicting artifacts
  are quarantined and block the affected key from ACK lookup, listing and scheduling. A
  stale in-memory record whose canonical file disappears also blocks that key. No automatic
  legacy backfill, migration or legacy replay.
- A process-level `.writer.lock` is created exclusively. In-process keyed mutation and
  capacity operations are serialized. A stale lock is not removed automatically; verify
  the process and directory before operator removal. This is not a distributed lock.
- `received` means the canonical receipt and initial delivery intent were confirmed under
  this protocol. It does not promise power-loss durability, peer receipt or business work.

## P02 — Peer ACK and replay safety (D02=B)

- Existing `peer:message` event, envelope, ACK shapes and 5,000 ms timeout remain unchanged.
  `ok:true` means the peer protocol ACK was accepted; it does not prove remote persistence
  or business completion.
- Offline/readiness checks and failures proven to occur before emission are retryable.
  Persist `attempting` before invoking transport. Any timeout, disconnect, malformed or
  missing ACK, rejected ACK without a proven no-side-effect guarantee, ambiguous local
  exception, process stop during send, or stale startup `attempting` is `uncertain`.
- Current EServer and PServer receivers have no independently approved stable-ID
  deduplication guarantee. Therefore uncertain sends are never automatically replayed.
  A positive ACK becomes `delivered` only after its state update is committed. Negative
  ACKs are not retried. Invalid/preparation failures are terminal `failed`.
- Readiness notifications wake bounded scanning but do not make uncertain records eligible.

## P03 — Bounded retries and capacity

The default policy is centralized in `DEFAULT_RELIABILITY_POLICY` and can be injected via
the optional `ApplicationConfig.reliabilityPolicy` for controlled deployment/test settings.
The approved defaults are:

| Setting | Default |
|---|---:|
| Maximum attempts | 6 total; initial attempt plus at most 5 retries |
| Retry delays | 2 s, 10 s, 60 s, 300 s, 1,800 s |
| Jitter | Equal jitter, uniform from half-delay through full delay |
| Maximum item age | 24 hours |
| Startup scan | Oldest first, 100 records per batch, concurrency 4 |
| Periodic scan | 1 second; also scan at startup and destination-ready events |
| Capacity | 10,000 records or 256 MiB, whichever is reached first |

Clock and random source are injectable. A readiness preflight that finds the peer offline
does not increment send attempts; a proven pre-emit error after `attempting` does. Retry
age/attempt exhaustion becomes terminal `failed`. Capacity checks occur before commit/ACK;
capacity failure returns the existing `DELIVERY_FAILED` code with a stable non-sensitive
message. No terminal or quarantined record/key is silently deleted to make room. Disk and
permission failures do not return `received` without a confirmed canonical record.

In the composed M12/M13 application, concurrency 4 is shared across both outbox runners.
Policy overrides may lower attempts, age, scan batch and concurrency; retry delays cannot be
shortened and scans cannot run more often than the approved one-second interval. The single
capacity limit was ambiguous across the two separately configured state directories, so the
application divides it evenly: each directory is limited to 5,000 records or 128 MiB. The
aggregate composed limit remains 10,000 records or 256 MiB. Standalone stores retain the
10,000/256 MiB defaults. Temporary replacement files are transient disk overhead and are
outside the retained-state accounting; deployments need additional free-space headroom.

## P04 — Idempotency, conflicts and retention (D03=B)

| Operation | Key | Fingerprint |
|---|---|---|
| F08 | `F08:<task.id>` | Validated task plus effective EServer target captured for the first receipt. A duplicate with no explicit target reuses the original captured target for comparison. |
| F09 | `F09:<task.id>` | Validated finished result plus authenticated EServer `sourceInstanceId`; envelope `from` is not authority. |
| M13 with caller ID | `M13:aaui:<message.id>` | Authenticated AAUI identity plus normalized selection and immutable semantic envelope fields. Volatile incoming timestamp is excluded. |
| M13 without caller ID | Unique per-arrival key | No content-only or generated-ID deduplication. |

Canonical JSON recursively sorts object keys and omits undefined properties. Exact duplicates
return the stored ACK envelope verbatim (including original generated IDs/timestamps) and do
not schedule another delivery. Same key with a different fingerprint returns existing
`INVALID_MESSAGE` with stable operation-specific conflict text; no new public code is added.
Concurrent commits serialize in-process; the single-writer lock is required across AAB
processes. There is no time-based dedupe expiry or garbage collection. Terminal, uncertain
and quarantined evidence consumes capacity. When full, intake fails closed and operators
must preserve/reconcile evidence before expanding or archiving storage.

## P05 — Canonical state and projections (D04=B)

Canonical states and allowed transitions:

```text
queued -> attempting | retryable | failed | uncertain
attempting -> delivered | retryable | failed | uncertain
retryable -> attempting | failed | uncertain
delivered, failed, uncertain -> terminal
```

State is persisted before a related live event. `queued`, `attempting`, `retryable` and
`uncertain` project to M13 `pending`; `delivered` projects to `forwarded`; `failed` projects
to `forwardFailed`. M12 lifecycle events are emitted for receipt and terminal delivered/
failed outcomes; uncertain work does not imply failure or success. A notification is a
best-effort projection and never rolls back canonical state.

For new M13 records, the canonical record overrides the legacy receipt/status sidecar;
stale sidecars cannot override it. Legacy records without canonical state retain their
existing sidecar reader behavior. Corrupt legacy artifacts remain an error for legacy-only
records; corrupt canonical records are quarantined and are not treated as pending success.

## P06 — Rollout, operations and deferred boundaries

- New receipt commit and normal first delivery are enabled for new accepted operations.
  Automatic retries are limited to known-unsent items. Replay of uncertain work and all
  legacy records stays disabled.
- Operators inspect JSON records by key/state/attempt/next-attempt and `.quarantine` by
  filename/reason; routine logs do not contain stored payloads. There is no operator HTTP
  API. Capacity pressure, stale writer locks and quarantined keys require manual review.
- Rollback means stop new work/replay through deployment rollback while preserving the
  entire canonical/quarantine directory. Do not delete records, dedupe keys or locks to
  force startup. See [outbox operations](../operations/R7_5_RELIABILITY_OUTBOX.md).
- D05=A preserves M09 `Promise.all` partial fan-out. D06=A preserves M16 catalog storage,
  DTO and relationship behavior; no schema migration. TD12 remains separate.
- R7.3 ACK-gated ingress, R7.4 dispatch precedence and R7.2 logical-instance affinity
  remain binding. TD14/R7.6 owns bounded graceful drain; this implementation keeps queued
  work recoverable and preserves the writer lock if a send is active at close, but does not
  drain it.

## Evidence limits

Local tests establish deterministic file protocol, workflow classification, retry timing,
dedupe and process-restart record interpretation. Loopback tests use local peer fakes only.
No real remote receiver semantics, production deployment filesystem, cross-process
concurrency stress, SIGKILL crash matrix, OS crash or power-loss behavior is established.
Do not claim exactly-once processing or universal durable storage.

## R7.5.C accepted scope and R7.6 lifecycle boundary

R7.5.C was reviewer-accepted and conditionally closed for its scoped Linux process-crash
contract at commit `9c3cb2bec19dcc2cf9d31ce505bd84dc7a90a539`; see the [C report](../../R7_5_C_FAILURE_RESTART_VERIFICATION_REPORT.md).
The evidence is child-process `SIGKILL` on Linux `/tmp` (`tmpfs`), not power loss or a
deployment filesystem. C03 remains: concurrent duplicate prepare/transform can execute twice;
transformers must be side-effect-free or idempotent for safe use. The process attempt limit is
four; M12/M13 retain fixed per-directory quotas of 5,000 records/128 MiB each (10,000/256 MiB
aggregate), no automatic GC, and fail-closed stale-lock recovery. TD10/TD11 are conditionally
remediated for this scope; TD12/TD13 are unchanged and TD14 remains open.

Lifecycle, readiness and bounded shutdown policy belong to R7.6. The R7.6.A [baseline](R7_6_LIFECYCLE_DECISION_BASELINE.md)
and [D01–D06 proposals](R7_6_LIFECYCLE_POLICY.md) are pending owner approval. This reliability
policy does not approve a drain order, readiness endpoint, shutdown deadline, or changed ingress
response.
