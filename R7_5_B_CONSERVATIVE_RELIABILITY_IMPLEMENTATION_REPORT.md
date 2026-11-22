# R7.5.B Stage 2 — Conservative Reliability Implementation

## Checkpoint and result

- Branch: `main`; tested committed base: `33061c8eea051cfcfba9ad7356e51233a2c1980d`.
- Initial Stage 2 worktree was clean except for the user's untracked implementation prompt; it remains untouched. No files were staged, committed, or pushed.
- Node: `v22.23.5`.
- **Result: IMPLEMENTED LOCALLY for the approved conservative P01–P06 policy; awaiting review.** This is not a claim of power-loss durability, remote business completion, exactly-once effects, or production filesystem compatibility.

## Design and state behavior

- M12 F08/F09 and M13 write versioned, checksummed canonical JSON operation records under `.r7.5-outbox` in their existing configured state directories. Each record contains the receipt ACK, dedupe key/fingerprint, validated operation, authenticated/effective routing identity, prepared outbound message, state and attempt metadata.
- Initial publication uses a same-directory exclusive `0600` temp file, complete write, file sync and close, then non-overwriting hard-link publication. Directory sync is attempted. Existing canonical names are never overwritten on create. State transitions use synced temp files plus atomic rename. Unexpected post-publication sync failures reconcile to `uncertain`; unresolved keys are blocked/quarantined and not sent.
- One active AAB writer per state directory is required. `.writer.lock` is exclusive across processes; in-process key/capacity operations are serialized. Stale locks are not automatically removed. Legacy files remain readable/projection-only and are not backfilled or replayed.
- `queued → attempting → delivered | retryable | failed | uncertain`; restart changes stale `attempting` to `uncertain`. Only offline/proven-unsent work is retried. Possibly-started sends without a positive accepted peer ACK become `uncertain` and are never automatically replayed for current peers.
- Defaults are centralized: 6 maximum send attempts, 2s/10s/60s/300s/1800s delays with equal jitter, 24h maximum age, startup scan oldest-first in batches of 100 with concurrency 4, 1s bounded scan, and capacity of 10,000 records or 256 MiB. Clock, randomness and policy can be injected.
- F08 uses `F08:<task.id>` and fingerprints validated task plus captured effective target. F09 uses `F09:<task.id>` and fingerprints validated result plus authenticated EServer instance. M13 uses authenticated AAUI plus supplied message ID; absent caller IDs remain independently receipted. Exact duplicates return the stored ACK and do not enqueue a second send. Conflicts use existing `INVALID_MESSAGE` with stable text. Dedupe records do not expire.
- M13 canonical states project `queued/attempting/retryable/uncertain → pending`, `delivered → forwarded`, `failed → forwardFailed`; canonical records override legacy sidecars. Persisted state precedes best-effort live notification. D05 M09 fan-out and D06 M16 catalog behavior were left unchanged.

## Approval-to-code and test trace

| Approved decision | Implementation evidence | Focused evidence |
|---|---|---|
| D01/P01 — atomic receipt plus intent | `atomic-json-record-store.ts`; workflow commits before returning receipt ACK | write, file-sync, close, hard-link, rename, directory-sync and capacity failure cases; no ACK commit on uncertain initial publication |
| D02/P02–P03 — bounded conservative replay | `reliable-outbox-runner.ts`; M05/M04 proven-unsent classification | controlled jitter/bounds, offline wake, `attempting` recovery, uncertain no-replay, positive ACK then failed local commit |
| D03/P04 — idempotency and conflicts | M12/M13 canonical keys and fingerprints | exact ACK replay, conflicting payload, F08/F09 key isolation, authenticated F09 instance, M13 ID/no-ID behavior |
| D04/P05 — canonical state | M13 store/workflow and state projection callbacks | persisted state projection, stale-sidecar precedence and uncertain status behavior |
| D05=A, D06=A; P06 | M09 and M16 production paths unchanged | full backend and playground suites; no migration or schema changes |

Focused command `node --import tsx --test tests/reliable-outbox.test.ts tests/task-workflow.test.ts tests/resource-selection-workflow.test.ts tests/peer-destination-policy.test.ts`: **47/47 cases passed**. Local Socket.IO loopback workflow tests also passed within the full serial backend run.

## Verification

| Command | Result |
|---|---|
| `node --version` | `v22.23.5` |
| `npm run typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0 |
| `npm test -- --test-concurrency=1` | PASS, **199/199** individual backend cases, exit 0 |
| `npm --prefix testing run test:playground` | PASS, **32/32**, exit 0 |
| `git diff --check` | PASS, exit 0 |
| `npm run check:architecture` against the uncommitted worktree | Exit 1: checker reads Git-tracked `src` files, so it reports the three new untracked source files as absent from the graph |
| Architecture check with a temporary Git index containing proposed `src` and checker changes | PASS, exit 0: **55 files, 130 edges (61 runtime, 69 type-only), 0 runtime file SCCs**; the existing module runtime SCC M10↔M12↔M13 and all-import SCC remain reported; dependency rules passed |

The temporary-index check did not modify the real index. The direct architecture command's untracked-file limitation is reported, not represented as a pass. `package.json` places `--test-concurrency=1` before the test glob so the repository's loopback listener suites run serially; the requested trailing flag remains harmless.

## Changed paths

- Root: this report; `R7_5_B_POLICY_GATE_REPORT.md` (historical gate resolution).
- Architecture/operations: `docs/architecture/ARCHITECTURE_DECISIONS.md`, `PROJECT_STATE.md`, `R7_5_RELIABILITY_POLICY.md`, `TECHNICAL_DEBT.md`, `docs/operations/R7_5_RELIABILITY_OUTBOX.md`.
- Runtime/config/checker: `package.json`, `scripts/check-architecture.ts`, `src/app/create-app.ts`, `src/infrastructure/socket/{peer-gateway,socket-gateway,socket-peer-message-delivery,socket-server}.ts`, `src/modules/peer-messaging/{peer-destination-policy,peer-message-service}.ts`, `src/modules/pserver/pserver-protocol.ts`, `src/modules/resource-selection/{resource-selection-store,resource-selection-workflow}.ts`, `src/modules/task-workflow/{task-file-store,task-workflow}.ts`, `src/shared/contracts/reliable-delivery.ts`, `src/shared/persistence/{atomic-json-record-store,reliable-outbox-runner}.ts`.
- Tests: `tests/{f09-task-result-receipt,resource-selection-persistence,resource-selection-workflow,task-received-routing,task-workflow}.test.ts`, `tests/reliable-outbox.test.ts`, `tests/helpers/memory-reliable-store.ts`.

## Limits and next step

- No child-process SIGKILL/restart matrix was run; restart behavior is characterized by deterministic store reopen/startup tests. R7.5.C must add the process-level failure matrix; neither that nor local tests prove OS/power-loss durability.
- Remote receiver deduplication is unverified, so uncertain replay remains disabled. A positive ACK means peer protocol acceptance only. Real deployment filesystem support for hard links/directory sync, cross-process stress, active-send shutdown timing, operator repair and capacity operations require operational validation.
- No bounded shutdown drain was added; R7.6 remains responsible. TD10/TD11 are implemented locally but remain open pending reviewer acceptance and R7.5.C evidence. TD12/TD13 remain unchanged; TD14 remains deferred.
- Stop here for review. Do not commit/push or begin R7.5.C/R7.6.
