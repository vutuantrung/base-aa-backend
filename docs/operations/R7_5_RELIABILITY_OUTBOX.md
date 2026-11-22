# R7.5 M12/M13 Outbox Operations

## State directories and writer ownership

- Task operations use `${AAB_TASK_STORE_DIR}/.r7.5-outbox`; default legacy root is
  `./data/tasks`.
- Selection operations use `${AAB_SELECTION_STORE_DIR}/.r7.5-outbox`; default legacy root
  is `./data/resource-selections`.
- Directories must be isolated per AAB deployment and reside on a local filesystem that
  supports same-directory hard links and atomic replacement. New files use mode `0600`.
- Run exactly one active AAB writer per state directory. `.writer.lock` is exclusive and
  contains the owner PID/start time. A lock conflict fails startup. For stale-lock recovery,
  stop the service; resolve the canonical directory and filesystem/mount identity; verify
  through the service manager and host/container process namespaces that no owner is active;
  corroborate PID and start time against the recorded lock; then preserve a copy of the lock,
  canonical records and quarantine before removing only that lock. PID absence from one shell
  or host is not sufficient when containers or shared mounts may be involved. If ownership
  cannot be proved dead, do not remove the lock. The application never removes it
  automatically. Active send at close deliberately preserves the lock for manual review.

## Capacity and retention

Defaults are 10,000 canonical/quarantined records or 256 MiB total retained state, whichever
comes first. In the composed M12/M13 application the bounds are split evenly between the two
state directories (5,000 records/128 MiB each); process-wide active attempt concurrency is
four. The store accounts canonical and quarantined bytes, not transient temp-file disk usage;
leave free-space headroom for replacement and quarantine operations. There is no time-based
dedupe-key expiry and no automatic archival or deletion.
Terminal, uncertain and quarantined records consume capacity. When full, new receipts fail
with `DELIVERY_FAILED`; do not delete keys or records to restore intake. Expand storage only
after preserving a backup and reviewing record state; archival tooling must preserve lookup
of every idempotency key and is not provided here.

## States and safe handling

Inspect canonical JSON by `state`, `attempts`, `createdAt`, `updatedAt`, `nextAttemptAt`,
and `lastError`. Stored payloads can contain peer data; do not paste them into routine logs
or tickets. The app logs keys/file names and reasons for quarantine, not full payloads.

- `queued`: committed and eligible for initial delivery.
- `attempting`: send began or was about to begin. On restart it becomes `uncertain`.
- `retryable`: known not sent; bounded retries use the configured policy.
- `delivered`: peer protocol returned positive ACK and the local state transition committed.
- `failed`: terminal local validation, explicit proven failure, or exhausted bound.
- `uncertain`: remote effect may have occurred; current receivers are not approved for
  dedupe, so do not automatically replay.

`.quarantine/` contains corrupt or incomplete artifacts. A quarantined key is blocked from
new receipt creation. Preserve evidence and inspect the filename/reason; do not restore a
file to canonical path or edit its checksum by hand. There is no operator HTTP API.

## Rollout and rollback

New receipts commit canonical state before the existing `received` ACK. Normal first sends
remain enabled. Automatic retry is only for known-unsent items; all legacy records and
uncertain sends remain unreplayed. Positive peer ACK means protocol acceptance only, not
remote durable storage or business completion.

Rollback by deploying the prior application version only after disabling intake at the
deployment boundary. Preserve canonical and quarantine directories, queued records, dedupe
keys and lock evidence. The older binary will not understand/replay the new outbox; do not
delete it. Re-enable the new version only after confirming the single-writer lock and
retained state. No backfill/migration is performed for legacy files.

R7.6 owns bounded graceful drain. This implementation stops scheduling on close; queued
state remains on disk. An in-flight send is not canceled; its active lock is preserved and
its outcome must be reconciled as uncertain after restart.

R7.5.C was reviewer-accepted for the scoped Linux process-crash contract at commit
`9c3cb2bec19dcc2cf9d31ce505bd84dc7a90a539`; see the [C report](../../R7_5_C_FAILURE_RESTART_VERIFICATION_REPORT.md).
The test used child `SIGKILL` on Linux `/tmp` (`tmpfs`), not a power interruption or the
deployment filesystem. C03 remains: duplicate concurrent prepare/transform may run more than
once, so transformers must be side-effect-free or idempotent. There is no automatic GC and
stale writer locks remain fail-closed pending verified-owner-dead manual recovery.

R7.6.A has documented, but not approved, lifecycle/readiness/shutdown proposals in the
[baseline](../architecture/R7_6_LIFECYCLE_DECISION_BASELINE.md) and
[policy package](../architecture/R7_6_LIFECYCLE_POLICY.md). Do not infer a new shutdown
deadline or operator action from that proposal.
