# R7.5 M12/M13 Outbox Operations

## State directories and writer ownership

- Task operations use `${AAB_TASK_STORE_DIR}/.r7.5-outbox`; default legacy root is
  `./data/tasks`.
- Selection operations use `${AAB_SELECTION_STORE_DIR}/.r7.5-outbox`; default legacy root
  is `./data/resource-selections`.
- Directories must be isolated per AAB deployment and reside on a local filesystem that
  supports same-directory hard links and atomic replacement. New files use mode `0600`.
- Run exactly one active AAB writer per state directory. `.writer.lock` is exclusive and
  contains the owner PID/start time. A lock conflict fails startup. After confirming the
  PID is not running and the directory is not mounted by another writer, an operator may
  remove a stale lock; the application never removes it automatically. Active send at close
  deliberately preserves the lock for manual review.

## Capacity and retention

Defaults are 10,000 canonical/quarantined records or 256 MiB total retained state, whichever
comes first. There is no time-based dedupe-key expiry and no automatic archival or deletion.
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
