# R7.5.A — Durability Contracts, Receipt Semantics & Failure Policies

## Checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`.
- Actual base HEAD: `fa60d2d97887299e323f74eb2d408448e3f23529` (`refactor(r7.4): introduce explicit inbound operation dispatch`). R7.4 dispatcher, tests, report and TD09 record are present in this commit and in current history.
- Initial status: only pre-existing untracked prompts `prompts/R7_4_EXPLICIT_INBOUND_OPERATION_DISPATCH_CODEX_PROMPT.md` and `prompts/R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_CODEX_PROMPT.md`; both preserved.
- Runtime: Node `v22.23.5`. No production source, wire/API/ACK behavior, schemas, scheduler or runtime data changed. No production services contacted.
- Changed paths: `tests/task-workflow.test.ts`, `tests/resource-selection-workflow.test.ts`, `tests/routing.test.ts`, `docs/architecture/R7_5_DURABILITY_DECISION_BASELINE.md`, `docs/architecture/TECHNICAL_DEBT.md`, `docs/architecture/PROJECT_STATE.md`, and this report.

## Current guarantees

The detailed path/failure matrix is [R7.5 durability baseline](docs/architecture/R7_5_DURABILITY_DECISION_BASELINE.md). Main findings:

- M12 F08/F09 and M13 return a `received` ACK only after their current local JSON write resolves and their current synchronous notification/scheduler-registration steps return. The wire ACK is emitted by the ingress callback after the workflow promise resolves.
- This boundary is not `fsync`, atomic replacement, power-loss durability, remote business completion, or exactly-once execution. Deferred `setImmediate` closures are volatile and startup does not requeue them.
- F08/F09 peer delivery is a separate later attempt. M10 delivery resolves after its peer ACK handling succeeds; that ACK’s business durability meaning is external and unknown. Failures after receipt are presented separately through workflow lifecycle status.
- M13 persists an immutable receipt and overwrites a separate delivery sidecar. Sidecar write failure does not change the in-memory delivery result or suppress its independent live notification. Missing/unknown status reads as `pending`; malformed JSON propagates.
- M09 starts planned adapter deliveries concurrently. `publish` may reject while another destination has already delivered or is still in flight. It has no rollback, persistence or retry.
- M16 stores JSON payloads without runtime DTO validation and has no declared parent/child foreign keys. Existing malformed JSON propagates; child rows can be orphaned/moved. Catalog policy and migration remain separate from workflow receipts.

## Decision package — all PENDING

Recommendations below are proposals for owner review, not approvals. They preserve R7.3 D01–D04, R5-D06/D07/D08, and R4-D05/D07. External PServer/EServer semantics and consumer inventory are incomplete.

| Decision | Options and proposed default | Compatibility, migration and failure/rollback | Acceptance if approved | Not yet established |
|---|---|---|---|---|
| **R7.5-D01 Receipt durability boundary — PENDING** | **A:** keep current write-completion receipt. **B:** write temp, flush, then atomic rename (process-crash consistency; not power-loss proof absent directory sync). **C:** define durable receipt as committed transaction/fully synced file and required directory/WAL policy. **Recommend C only if ACK must survive power loss; otherwise A is the honest preserve-current contract.** | A preserves ACK but accepts partial/lost files. B/C delay ACK and add I/O cost. No format migration expected; B/C need temp/truncated-file recovery and rollback to prior complete data. File and SQLite guarantees differ. | Fault inject write/flush/rename/commit; prove ACK follows chosen boundary; restart must yield complete old/new state. Unit tests cannot prove universal power-loss behavior. | Deployed filesystems, storage cache behavior and required power-loss guarantee. |
| **R7.5-D02 Post-ACK recovery — PENDING** | **A:** retain best-effort volatile forwarding. **B:** durable outbox and replay after restart with bounded at-least-once attempts. **C:** durable queue plus operator reconciliation, no automatic retry. **Recommend B where receipt promises later delivery, paired with D03 and a separately approved R7.6 shutdown protocol.** | B may redeliver after remote success; requires attempt/backoff/dead-letter policy and consumer tolerance. Existing receipts need backfill or compatibility window. Rollback must retain queued items for reconciliation, not delete them. | Fault/transition tests and child-process restart at persisted boundaries; prove bounded attempts, not exactly-once. Coordinate remote ACK meaning. | Remote ACK guarantees, consumer idempotence, retry limits and outage expectations. |
| **R7.5-D03 Idempotency/deduplication — PENDING** | **A:** preserve current F08/F09 duplicate errors and M13 new UUID per submission. **B:** replay receipt for exact duplicate; conflict on same key/different content. Candidate keys: F08/F09 `task.id`; M13 `(authenticated sender, supplied message.id)` only when present. **Recommend B only with conflict and retention policy.** | Current retries may return `DELIVERY_FAILED`; M13 duplicates create another send. B changes ACK/error outcomes and may need receipt metadata/index migration. Rollback preserves original and disables dedupe consistently. Optional M13 IDs limit coverage. | Exact/conflicting/concurrent duplicate, restart, expiry/retention and ACK replay tests; use authenticated identity. | Upstream retry patterns, stable message IDs, retention period and conflict policy. |
| **R7.5-D04 M13 status consistency — PENDING** | **A:** retain sidecar/live notification; absent/unknown means pending. **B:** atomically persist receipt + delivery state or use D02 outbox as canonical; derive notifications. **C:** retain format with reconciliation/corruption reporting. **Recommend B if D02 outbox is approved; else A plus visible gap.** | B changes file/read compatibility and needs migration fallback; C changes operations. A can show pending after delivery. Rollback retains receipt and exposes uncertain state; notifications remain projections. | Inject failures around remote ACK and status update; restart and compare canonical state; approve missing/corrupt-state behavior. | Product meaning of each status and reconciliation owner. |
| **R7.5-D05 M09 partial fan-out — PENDING** | **A:** preserve `Promise.all` and rejection contract. **B:** expose per-destination settled outcomes. **Recommend A for R5-D08 compatibility unless consumers require partial results.** | B changes return semantics/API. Delivered side effects cannot be rolled back; no data migration. Failure handling must report uncertainty, not imply all-or-none. | Controlled adapter tests for settled results and caller/API compatibility; external contract review before B. | External callers and their interpretation of rejection after partial delivery. |
| **R7.5-D06 M16 catalog schema/relationships — PENDING** | **A:** preserve current read/write behavior. **B:** validate new writes while retaining legacy reads/rows. **C:** validate reads/writes and migrate/backfill with orphan/raw-ID policy. **Recommend staged B after writer inventory and DTO agreement; defer C until migration/rollback is designed.** | B may reject typed-but-invalid inputs; C may break legacy rows and needs backup/rollback. Rollback requires verified restore; upsert/parent-child semantics need policy. Keep TD12 migration separate from D01–D05. | Corpus audit, invalid/orphan fixtures, compatibility reads, dry-run migration, row counts/checksums, rollback rehearsal and HTTP tests. | Production corpus, all writers, canonical DTO validators and tolerated legacy cases. |

Product/peer-owner input is required for the meaning of `received`, F08/F09 duplicate conflicts, M13 message-ID guarantees, remote ACK durability, and whether M09 partial results are externally useful. No decision is approved by this report.

## Characterization and verification

Three deterministic tests were added: F08 duplicate task ID preserves the first file and does not reschedule; identical M13 message redelivery creates distinct receipt IDs and deferred work; M09 sibling fan-out can complete after `publish` rejects. Existing tests already cover F09 exclusive duplicate result, receipt-write failure, M13 status-sidecar failures, M16 malformed JSON/orphan/raw-ID behavior, and F08/F09 deferred failures. Tests use temp directories, controlled promises and local fakes.

| Command | Result |
|---|---|
| Focused `node --import tsx --test tests/task-workflow.test.ts tests/resource-selection-workflow.test.ts tests/routing.test.ts tests/resource-selection-store.test.ts tests/aa-catalog-boundary.test.ts` | **39/39 passed** |
| `npm run check:architecture` | Passed: 52 files, 113 edges (51 runtime, 62 type); zero runtime file SCCs; existing module SCCs M10↔M12↔M13 runtime and M06↔M10↔M11↔M12↔M13 all-import |
| `npm run typecheck` / `npm run build` | Passed / passed |
| `npm test -- --test-concurrency=1` | **185/185 passed** |
| `npm --prefix testing run test:playground` | **32/32 passed** |
| `git diff --check` | Passed |

Local loopback/catalog tests ran with narrowly authorized execution after sandbox listener restrictions. No abrupt host-process, OS-crash, power-loss, or production remote-peer test ran. Such outcomes remain source-derived or unverified, as marked in the baseline.

## R7.5.B / C plan and stop

- **B — policy-approved implementation:** begin only after D01–D06 are decided. Separate receipt commit from outbox state; preserve public ACK/wire schemas unless explicitly approved. Sequence D03 keys with D02 replay to avoid unsafe duplicate delivery. Keep TD12 migration separate. Obtain R7.6 shutdown decision before adding shutdown drain semantics.
- **C — failure/restart verification:** use fault-injected store boundaries and child-process termination/restart to verify every persisted state transition and replay/duplicate behavior. Use temporary files/SQLite only. Power-loss durability requires target filesystem/SQLite deployment testing and must not be inferred from `SIGKILL`; remote ACK semantics require approved local protocol contracts or controlled peer integration.
- **TD14/R7.6 boundary:** this checkpoint documents that M02 does not drain deferred work. It defines no drain timeout, shutdown ordering, or close policy.

**Disposition:** R7.5.A evidence and characterization are complete locally; D01–D06 remain **PENDING**. Stop for owner review. No production behavior changed, no commit/push, and no R7.5.B/C or R7.6 work started.
