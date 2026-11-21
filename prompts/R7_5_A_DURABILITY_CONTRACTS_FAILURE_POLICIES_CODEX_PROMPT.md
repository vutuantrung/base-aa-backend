# Codex Task — R7.5.A: Durability Contracts, Receipt Semantics & Failure Policies

## 0. Authority, baseline and scope gate

Repository: `vutuantrung/base-aa-backend`, branch `main`.
Reviewer-verified committed HEAD: **`fa60d2d97887299e323f74eb2d408448e3f23529`** (`refactor(r7.4): introduce explicit inbound operation dispatch`). R7.4 has been reviewed/accepted and its implementation and tests are committed; R7.5 has not started.

Before doing anything:
1. Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` once. Run `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, `git log -1 --oneline`.
2. Confirm R7.4's `createPeerMessageHandler`, dispatcher tests/report and relevant TD09 documentation exist in current history. If HEAD is newer, record actual HEAD and only inspect relevant diffs; don't assume the SHA above remains HEAD.
3. Preserve uncommitted and unrelated changes; never reset, stash, overwrite or auto-commit. If conflicting work exists, report and stop rather than discarding it.
4. This is **one substantial architecture/contract checkpoint** for critical-risk R7.5, not a string of microtasks. Do not implement a durability mechanism until the owner approves exact policies after reviewing the resulting decision package. No commit/push without permission. Do not start R7.5.B/C or R7.6.

## 1. Objective

Establish a precise, evidence-based persistence, acknowledgment, delivery and crash-recovery contract for the application **before** making behavior-changing implementation decisions. Focus on technical debts **TD10, TD11, TD12 and TD13**; touch TD14 (shutdown) only to document the boundary deferred to R7.6. Identify what a successful receipt currently guarantees, when ACK is emitted, which side effects occur after it, what states are durable versus in memory, and how restart/failure can affect the result.

Do not equate `writeFile` resolution with fsync, transactional durability, downstream receipt, or exactly-once execution. Distinguish **local persistence**, **ACK to sender**, **deferred scheduling**, **attempt to send**, **remote acknowledgment** and **presentation/notification status**.

R7.3's D01–D04 current-behavior-preservation decisions and R7.4 explicit dispatcher are binding and unchanged. R5-D06 (separate ACK semantics), R5-D07 (domain repositories), R5-D08 (preserve external contracts), R4-D05 (coordinated lifecycle) and R4-D07 (bounded graceful drain) are architecture constraints, not approval to change behavior.

## 2. Bounded source and evidence inspection

Read the specific source and tests necessary to establish the sequence:
- `docs/architecture/TECHNICAL_DEBT.md` (TD10–TD13; TD14 cross-reference), `ARCHITECTURE_DECISIONS.md`, `PROJECT_STATE.md`, `ARCHITECTURE.md` workflow invariants, relevant R6.4.A/B/E and R6.3.A reports **only when source/tests leave an ambiguity**.
- `src/modules/task-workflow/{task-workflow,task-file-store}.ts` (M12 F08/F09).
- `src/modules/resource-selection/{resource-selection-workflow,resource-selection-store}.ts` (M13 selection, status sidecar).
- `src/infrastructure/socket/peer-gateway.ts` (defer via `setImmediate`, dispatcher and publishing, no-ACK gate), `src/modules/peer-messaging/{peer-message-service,peer-destination-policy}.ts` as needed for delivery outcome, and `src/modules/messaging/{messaging,message-router,route-registry}.ts` for M09 best-effort fan-out (validate actual paths).
- `src/modules/aa-catalog/{contracts,sqlite-catalog}.ts` and M17 DB/persistence only for TD12 persisted schema, validation, raw IDs, orphan implications and migration inventory; do not alter schema.
- Existing narrow tests: `tests/task-workflow.test.ts`, `tests/resource-selection-workflow.test.ts`, `tests/task-received-routing.test.ts`, `tests/pserver-aaui-task-roundtrip.test.ts`, `tests/aaui-resource-selection-routing.test.ts`, catalog and generic messaging tests; expand narrowly as needed.

Do not broadly re-audit unrelated modules. Prefer current source/tests as behavioral truth over historical summary.

## 3. Required deliverable A — Current-state contract and failure timeline

Document an evidence table for each of the following paths:

**M12 F08 PServer -> AAB -> EServer:** input/ACK gate; payload and target capture; exclusive JSON receipt write; lifecycle notification; ACK `{ok:true,status:'received'}`; in-memory `defer` and later forwarding; offline or ambiguous EServer; forward success/failure notifications; duplicate receipt ID; process death between any two stages; restart without requeue.

**M12 F09 EServer -> AAB -> PServer:** authenticated instance attribution; correlation to original task; exclusive `.result.json` file; receipt ACK versus PServer delivery; failures before and after write; duplicate finished result; process death; history projection.

**M13 resource selection:** validate/store receipt; initial `pending`; publish updated; ACK; scheduled forwarding; sidecar status update `forwarded`/`forwardFailed`; independent live update; sidecar read/write failure or torn content; restart; duplicate selection and external redelivery. Preserve existing independence of notification and status persistence as an observed behavior.

**M09 generic messaging:** concurrent best-effort multi-destination fan-out, partial side effects, failure/return semantics, no automatic rollback/retry; distinguish it from peer messaging and M12/M13 workflows. Describe what current tests prove.

**M16 catalog:** JSON data/ID/parent-child relationship validation actually performed at write/read; existing-row compatibility; invalid/orphan records and migration hazards. Keep this as a separate approval branch rather than folding it into receipt/delivery changes.

For each, record: input and owner, exact source path/method, current ACK/HTTP outcome, persisted artifact and persistence guarantee **as actually established**, pending volatile state, failure injection point, external effect, restart behavior and evidence level (`tested`/`source-derived`/`hypothesis`/`unverified`). Explicitly separate: host process crash, graceful stop, OS crash/power loss, remote disconnect, duplicate sender retry, I/O rejection and partial writes. Do not claim crash-replay or fsync guarantees if not implemented/tested.

## 4. Required deliverable B — Decision package for the architecture owner

Propose **coherent options and a recommended default** for each decision below, but mark all **PENDING** until user approval; do not silently select policies through new tests or production code:

- **R7.5-D01 — Receipt durability boundary:** preserve current file-write-complete receipt versus stronger atomic-write/fsync/transaction semantics. Define exactly what `received` means and its crash/power-loss guarantees.
- **R7.5-D02 — Post-ACK recovery:** preserve volatile best-effort forwarding versus durable outbox/replay-on-restart, including how shutdown R7.6 interacts; define duplicate delivery and bounded recovery expectations.
- **R7.5-D03 — Idempotency/deduplication:** duplicate F08/F09 task IDs and M13 selection submissions, which key applies, conflict versus exact retry, ACK/error semantics and any migration constraints. No invented exactly-once claim.
- **R7.5-D04 — M13 receipt/status consistency:** sidecar atomicity, corruption handling, failed status write, independent live notifications, reconciliation after restart and definition of `pending`/`forwarded`/`forwardFailed`.
- **R7.5-D05 — M09 partial fan-out:** keep best-effort semantics or adopt explicit aggregate/partial outcome model; consider public contract and external consumer compatibility.
- **R7.5-D06 — M16 catalog schema/relationships:** leave legacy stored rows as-is, validate on new writes, migrate existing data, and policy for orphan records/raw IDs; specify migration/rollback requirements before touching storage.

Each decision must include current behavior, A/B (and C if warranted), recommendation with rationale, compatibility impact, required data migration, failure/rollback handling, test acceptance criteria, and what cannot yet be established. Use a compact matrix, not 6 unrelated long essays. Highlight any choices that require product policy or external PServer/EServer agreement.

**Important:** Approval of R7.5.A itself is **not** approval to introduce new retries, outbox, fsync, automatic replay, idempotency semantics, error codes, database schema changes, or changes to wire ACKs.

## 5. Required deliverable C — Deterministic verification and B/C plan

Add **only meaningful current-behavior characterization tests** if the existing suite lacks important coverage; examples: `save` success but later deferred delivery failure; write failure before ACK; status sidecar failure with independent live update; duplicate exclusive create; partially successful fan-out; invalid catalog parent/JSON handling. Use temporary directories, fake schedulers/ports, controlled promises or fault-injected stores. No arbitrary sleeps, external production systems, power-loss simulations passed off as real evidence, or production-data changes. Avoid test churn to raise counts.

Produce one **R7.5.B implementation plan** scoped to approved policies and one **R7.5.C failure/crash/restart verification plan** with meaningful acceptance gates. Mark runtime-/OS-dependent tests as requiring real integration and do not assume network access or power-loss testing. Explain potential need to distinguish B/C policy work from R7.6 bounded graceful drain.

## 6. Verification

Use supported Node 22.23.5 or report actual version; capture exact command status, test case counts and sandbox permission workarounds:

```bash
npm run check:architecture
npm run typecheck
npm run build
npm test -- --test-concurrency=1
npm --prefix testing run test:playground
git diff --check
git status --short
```

Run targeted tests for files actually changed first. If sandbox blocks local socket listener or native modules, request narrowly scoped permission, distinguish environment errors from application failures, and rerun. Do not claim PASS from stale numbers or when a command did not succeed.

## 7. Outputs and stop condition

- Root: `R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md` — concise executive finding, actual base HEAD, scoped paths, evidence-linked failure matrix, D01–D06 decision package, chosen-by-owner status **PENDING**, risks, recommendation for B/C and exact tests.
- `docs/architecture/R7_5_DURABILITY_DECISION_BASELINE.md` (or a suitable existing focused file) — current guarantees, failure windows and acceptance boundaries.
- Update `docs/architecture/TECHNICAL_DEBT.md` for TD10–TD13 and relevant TD12 only (do not mark remediated), and `docs/architecture/PROJECT_STATE.md` to record R7.4 reviewed/committed and R7.5.A local progress plus current HEAD.
- Focused tests only if they fill proven evidence gaps. **Do not change production code, wire/API/ACK behavior, file/DB schemas, scheduler, retry/replay behavior, runtime flags, or unrelated docs.**
- Stop for review with D01–D06 unresolved. **No commit/push, no R7.5.B/C or R7.6.**
