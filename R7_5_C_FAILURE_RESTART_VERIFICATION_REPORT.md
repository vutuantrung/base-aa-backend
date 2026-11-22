# R7.5.C — Failure and Restart Verification

## Checkpoint and recommendation

- Repository: `vutuantrung/base-aa-backend`, branch `main`.
- Tested committed source HEAD: `5dfc2f10e3055ac3a886b313b56904f46fb9314d` (Stage 2). The implementation and this report are dirty, uncommitted changes; the two pre-existing untracked task prompts remain untouched.
- Policy baseline: `33061c8eea051cfcfba9ad7356e51233a2c1980d`. The R7.5.B source delta was reviewed at the requested paths; no incompatible checkpoint drift was found.
- **Recommendation: CONDITIONALLY CLOSED for the scoped process-crash contract.** The tested local rules fail closed around uncertain delivery and preserve accepted receipt identity. Production filesystem semantics, receiver behavior and operator environment remain unverified.
- **R7.6 recommendation: GO after reviewer accepts this report and its limits.** This is not authorization to begin R7.6. TD14 shutdown drain remains deferred. No commit or push was made.

## Approval-to-code trace

| Approved scope | Current evidence and result |
|---|---|
| D01/P01 receipt plus intent | Canonical record publication, checksum/key validation, write/sync/link/rename failures and capacity rejection. No `received` ACK for unconfirmed initial publication. |
| D02/P02 replay classification | `attempting` is durable before emit; only offline/proven-unsent transitions retry. Timeout, negative/malformed ACK and post-invocation exceptions remain uncertain/failed, never inferred unsent from error text. |
| D03/P04 identity | F08 captured target, F09 authenticated instance, M13 supplied-ID digest/no-ID behavior, exact ACK replay and conflict mapping retained. |
| D04/P05 projection | Canonical state precedes notification; projection failures remain best effort; legacy records remain projection/read-only and are not replayed or backfilled. |
| D05/D06/P06 | M09 fan-out, M16 behavior and M04/M05 public message, ACK and event shapes remain unchanged. |

## C01–C07 dispositions

| Finding | Disposition |
|---|---|
| C01 — prepared transformer payload validation | **Reproduced and fixed.** The durable delivery method revalidated output with the stricter incoming Zod schema, rejecting R7.3-D02=A output such as blank version, `data:null`, and extension fields. Envelope metadata is still validated; prepared payload keeps the existing executor checks. Generic delivery and a prepared message persisted/reloaded through the production record store now both pass. |
| C02 — F08 captured identity in ACK | **Reproduced and fixed.** The pre-B source returned sole-instance `toInstanceId`; Stage 2's ACK omitted it while outbound state captured it. ACK now includes the first effective target. Explicit/sole/unresolved/ambiguous cases and duplicate after topology change/reopen are covered. |
| C03 — concurrent duplicate transformation | **Reproduced risk; no side-effect guarantee added.** Barrier-controlled same-key arrivals invoke prepare/transform twice before create serialization, but commit one receipt, one notification, one outbox record and one send. Preparation remains before commit so the approved record can contain the exact prepared message. A transformer with external side effects must be idempotent or side-effect-free; that is not guaranteed by receipt dedupe. Offline readiness does not increment attempts; transform failure commits terminal failed state with the existing received ACK/lifecycle sequence. |
| C04 — two runners, bounds and overlap | **Bounded and documented.** M12/M13 now share a process-wide four-attempt limiter; overlapping wakes/scans do not schedule one key twice. Policy overrides are copied/frozen and reject increased attempts/age/batch/concurrency, shortened delay entries or faster scans. Since the approved text did not define capacity scope across two directories, the composed app splits the 10,000/256 MiB total evenly: 5,000 records/128 MiB per directory. Retry due time, 24-hour expiry, attempts and offline polling are covered. |
| C05 — corrupt/temp/cache recovery | **Reproduced and fixed.** Corrupt canonical JSON, conflicting temp artifacts, cached-but-missing canonical files and failed replacement temps now quarantine/block the key; blocked keys cannot be ACKed or scheduled. Canonical checksum, key/hash, finite timestamps/attempts and monotone attempt counts are checked. A key deleted before any process observed it has no tombstone evidence; external deletion remains prohibited and cannot be reconstructed after restart. |
| C06 — ownership/lifecycle | **Reproduced risks and fixed.** Concurrent same-process store initialization raced on `open('wx')`; writer acquisition/release is serialized and references are retained. Active-close lock preservation is sticky across shared store references. Runner startup/close races preserve ownership, partial M12/M13 startup failure closes the sibling, scan errors are caught, and directory aliases/cross-process lock exclusion are tested. No stale lock is auto-removed. |
| C07 — capacity and transitions | **Bounded for retained records.** Canonical and quarantined artifacts count toward record/byte capacity; duplicate at full capacity returns stored ACK; new unmatched receipt rejects. Cross-instance create refreshes quarantine accounting. State growth is checked before replacement, attempt metadata cannot decrease, and failed publication evidence is retained. Temporary write/replacement files are transient overhead outside retained-byte accounting; provision additional filesystem headroom. No GC or key deletion was added. |

## Child-process crash/restart matrix

Environment was Node `v22.23.5`, Linux, `/tmp` on `tmpfs`. The harness used the production `AtomicJsonRecordStore` and `ReliableOutboxRunner`, child IPC barriers, parent-issued `SIGKILL`, bounded event deadlines, temporary directories and a parent-owned send-counter file synced independently of the child. All killed children reported `code=null, signal=SIGKILL`. The counter and disk results establish process-kill behavior on this filesystem only; they do not establish power-loss behavior.

| Kill boundary | ACK observed by parent | Disk/restart result | Parent-observed sends |
|---|---|---|---:|
| Temp opened before write; after full write before file sync; after file sync before link | No | No canonical. Temp quarantined on restart; key blocked; no auto-send. | 0 |
| After hard link with matching temp still present | No | Canonical queued survives; matching temp moves to resolved quarantine; duplicate returns exact stored ACK. Restart sends once, commits delivered. | 1 total |
| After temp unlink, before canonical directory sync/ACK | No | Canonical queued survives on tmpfs; duplicate returns exact stored ACK; restart sends once. | 1 total |
| Receipt ACK observed, before first attempt callback | Yes, stable ID | Canonical remains queued; restart schedules once with original payload/destination/ID. | 1 total |
| `attempting` committed, before emit | Yes | Restart converts attempting to uncertain; no schedule. | 0 |
| Remote side effect observed, before peer ACK | Yes | Canonical attempting; restart uncertain; no duplicate side effect. | 1 total |
| Positive peer ACK observed, before delivered rename | Yes | Conflicting synced delivered temp is quarantined and blocks the canonical attempting key; no ACK lookup or replay. | 1 total |
| Delivered rename complete, before directory sync | Yes | Canonical delivered survives this process crash; terminal record is not scheduled. | 1 total |
| Retryable known-unsent with future due date, attempts=2 | Yes | Restart retains retry metadata and does not schedule before `nextAttemptAt`. | 0 |
| Delivered, failed and uncertain terminal records | Yes | Exact stored ACK remains; restart does not schedule any terminal state. | 0 |
| Second live writer and post-crash stale lock | No | Second writer fails; killed owner's lock remains; restart fails closed until the harness observes child exit and removes only its own temp lock. | 0 |

The tests also cover temp/canonical checksum conflict, corrupt canonical JSON, injected rename failure, delivered-state sync failure, startup partial failure, close during active send, same-process writer references, directory symlink alias, capacity growth and blocked-key duplicate attempts. `SIGKILL` is not a power-cut simulation. The `/tmp` filesystem may differ from deployment filesystems.

## Source review and environmental limits

- Transport: offline preflight and `ProvenUnsentDeliveryError` are retryable only before invocation. Missing/negative ACK, timeout, disconnect/exception after invocation and positive remote ACK followed by local commit uncertainty are not replayed. M04 session generation and M05 socket lookup retain existing readiness/affinity behavior; no workflow ingress recursion was introduced.
- F09 fingerprints validated task plus authenticated EServer instance. M13 semantic digest excludes volatile timestamp and missing IDs remain independent receipts. Duplicate ACK equality survives restart. Legacy task/selection files remain read/projection-only; canonical projection precedes best-effort notification.
- Application-level loopback coverage ran through `createApplication` and authenticated peer routes in the serial backend suite; this was local fake-peer evidence, not a production receiver test.
- Capacity is 5,000 records/128 MiB per composed workflow directory, 10,000/256 MiB aggregate; transient temp usage needs additional disk headroom. No retention or operator replay path exists.
- Stale-lock recovery requires stopping the service, resolving canonical directory/mount identity, checking service and host/container process ownership, corroborating PID and start time, preserving evidence, and removing only the verified lock. PID absence from one shell is insufficient.
- Unverified: production filesystem hard-link/directory-sync support, actual EServer/PServer receiver deduplication and business completion, cross-host shared-mount ownership, power-loss recovery, OS crash consistency beyond this process-kill test, and real disk exhaustion behavior.

## Verification

Commands were run against the dirty tree based on committed source HEAD `5dfc2f10e3055ac3a886b313b56904f46fb9314d`.

| Command | Result |
|---|---|
| `node --version` | `v22.23.5` |
| Ordinary pre-change `npm run check:architecture` | PASS on tracked committed graph; 55 files, 130 edges, zero runtime file SCCs. |
| Final `npm run check:architecture` | PASS; 55 files, 131 edges (62 runtime, 69 type-only), zero runtime file SCCs; existing module SCCs/warning remain. No new source file required temporary-index inclusion. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run build` | PASS, exit 0. |
| `npm test -- --test-concurrency=1` | PASS, **223/223 individual backend cases**, exit 0; full serial suite included local loopback routes. |
| `npm --prefix testing run test:playground` | PASS, 32/32, exit 0. |
| `git diff --check` | PASS, exit 0. |

The sandbox initially returned `listen EPERM`; the final full backend suite was rerun with narrowly approved local listener execution and passed. The playground suite does not require listeners. This is not an independent rerun on a deployment host.

## Corrective files and next step

Runtime fixes are limited to [atomic-json-record-store.ts](src/shared/persistence/atomic-json-record-store.ts), [reliable-outbox-runner.ts](src/shared/persistence/reliable-outbox-runner.ts), [peer-message-service.ts](src/modules/peer-messaging/peer-message-service.ts), [task-workflow.ts](src/modules/task-workflow/task-workflow.ts), and [peer-gateway.ts](src/infrastructure/socket/peer-gateway.ts). Regression evidence is in `tests/reliable-outbox.test.ts`, `tests/reliable-crash-process.test.ts` plus `tests/helpers/reliable-crash-child.ts`, `tests/peer-message-service.test.ts`, and `tests/task-workflow.test.ts`. Policy/operations text records the conservative aggregate limits and verified-owner-dead lock procedure. No package script, public wire/ACK/event schema, architecture checker rule or migration changed. TD12/TD13 are unchanged; TD14 remains deferred.

Stop for reviewer approval. Do not commit/push or begin R7.6 in this checkpoint.
