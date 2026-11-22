# R7.6.A — Lifecycle Contracts, Readiness & Shutdown Policy Report

## Checkpoint

- Repository: `vutuantrung/base-aa-backend`, branch `main`.
- Actual committed baseline: `9c3cb2bec19dcc2cf9d31ce505bd84dc7a90a539` (expected and verified).
- Pre-existing dirty files preserved: `docs/architecture/PROJECT_STATE.md`, `R7_5_RELIABILITY_POLICY.md`, `TECHNICAL_DEBT.md`, `docs/operations/R7_5_RELIABILITY_OUTBOX.md`; pre-existing untracked R7.5.B/C and R7.6.A prompt files preserved. These contain the R7.5.C local reconciliation from the previous checkpoint; this report did not overwrite them.
- Added this report, [baseline inventory](docs/architecture/R7_6_LIFECYCLE_DECISION_BASELINE.md), [pending policy package](docs/architecture/R7_6_LIFECYCLE_POLICY.md), and one focused test file described below. No production source, public contract, config default, persistence format, or operational behavior changed. No commit/push.
- R7.5.C is reviewer-accepted and conditionally closed for scoped Linux process-crash reliability. The committed report/harness are authoritative evidence; no power-loss, production filesystem, remote dedupe, exactly-once or unconditional at-least-once claim.

## Scope and files

| File | Change |
|---|---|
| `docs/architecture/R7_6_LIFECYCLE_DECISION_BASELINE.md` | Resource ownership inventory, current startup/shutdown sequences, readiness/failure matrix, dependency ordering proposal and evidence boundaries. |
| `docs/architecture/R7_6_LIFECYCLE_POLICY.md` | D01–D06 alternatives, recommendations, effects, failure behavior and acceptance criteria; explicitly pending. |
| `R7_6_A_LIFECYCLE_CONTRACTS_SHUTDOWN_POLICIES_REPORT.md` | This checkpoint result and approval gate. |
| Characterization test file | None retained: listener permission blocked meaningful execution. Existing runner characterization remains the only executable evidence used in this checkpoint. |
| Existing local R7.5 docs/prompts | Preserved, not rewritten. They remain dirty/untracked from the preceding task and must be reconciled separately with the accepted C commit if desired. |

## Current behavior findings

### Source-derived

- M02 constructs persistence, HTTP/Socket.IO, optional peer gateway and optional PServer connector in `createApplication`. SQLite open and connector validation can fail during construction. `startApplication` registers demo transformation, awaits `listen`, then returns; main installs signals only after that.
- `listen` starts task then selection runner before binding HTTP. PServer connect begins only in the successful listen callback. A bind error does not close the already-started gateway. There is no serialized lifecycle state/shared listen promise.
- `close` is PServer close → peer gateway close (runner stop/store lock close) → Socket.IO → HTTP if listening → SQLite. It is sequential and fail-fast; an error skips later cleanup. Runner close clears timer/pending queue and returns whether startup/execution is active; it does not await. Global slot waiters, work between storage operations, in-flight ingress, snapshots, M09 fan-out and direct sender calls are not centrally tracked.
- `/health` returns the existing `{status:"ok"}` from the HTTP route and says nothing about PServer session readiness, per-instance destination availability, outbox capacity or storage health. M04 ready requires transport connected plus successful session ACK. Preserve route/auth/ACK semantics pending D02.
- First SIGINT/SIGTERM invokes close and then entrypoint `process.exit(0/1)`; repeated signals are ignored. There is no total deadline. If startup fails, handlers are not installed.

### Deterministic/current test evidence

- Node 22.23.5 `node --import tsx --test --test-reporter=spec tests/reliable-outbox.test.ts`: PASS (existing file-level tests include startup/close race, close with active attempt preserving writer lock, duplicate scan suppression and process-wide concurrency cap).
- `npm run check:architecture`: PASS; 55 files / 131 resolved import-export edges, 0 runtime file SCCs. Existing M10↔M12↔M13 runtime module SCC and M06↔M10↔M11↔M12↔M13 all-import SCC remain.
- `npm run typecheck`: PASS. `npm run build`: PASS.
- Application listener characterization was attempted, but the sandbox returned `listen EPERM` on wildcard and loopback addresses. A narrow escalated attempt was granted, but the nested tool execution still returned EPERM. The exploratory test file was removed; no listener behavior is claimed reproduced. No full backend or playground suite was run because no final test code was retained and the requested focus was characterization/docs.
- `git diff --check`: PASS, exit 0.

### Risk classification

| Topic | Disposition |
|---|---|
| Startup runner before HTTP bind; failed bind leaves it started | Source-supported risk; app-level EADDRINUSE cleanup reproduction unverified due listener sandbox. |
| Partial startup rollback across app resources | Source-supported risk; runner sibling cleanup exists in M05, but app rollback around runner/listener/PServer failures is absent. Injected app-level failure not exercised. |
| Concurrent/repeated listen, close-before/during-listen, listen-after-close | Source-supported unspecified behavior; no app-level result asserted. Existing runners/stores have local start/close guards; not equivalent to application lifecycle contract. |
| Active outbox close and writer evidence | Existing deterministic runner/store test passes; it proves lock preservation for active execution, not full app drain or process exit. |
| Waiting shared limiter slot, late callback, ingress commit/ACK, M09 partial fan-out, snapshots, HTTP keepalive, hung ACK and close ordering | Source-supported risks; no deterministic app-level reproduction in A. Need explicit B tests. |
| Readiness dimensions and compatibility | Direct source plus existing M04/R7.3 tests; deployed health-check consumer behavior unverified. |

## Owner decision package

All D01–D06 remain **PENDING**. The policy document recommends M02 as one-shot lifecycle owner; internal local readiness separate from remote readiness and preserving `/health`; stop admission/scheduler launches and settle already-admitted receipts/already-started send commits only; one monotonic total close budget with 15 seconds as an unapproved candidate; best-effort dependency-safe cleanup with aggregation; and entrypoint-only signal ownership with minimal safe diagnostics. Exact gate responses, public API changes, deadline/default/result shape and repeated-signal escalation require owner answers. No R7.6.B behavior is authorized by this report.

## Residual R7.5 limits carried forward

- C03: concurrent same-key prepare/transform can run twice before receipt serialization. Transformers must be side-effect-free or idempotent for safe use; receipt dedupe does not dedupe transformer effects.
- Process-wide attempt limit is 4. Composed M12/M13 quotas remain fixed at 5,000 records / 128 MiB per directory (aggregate 10,000 / 256 MiB). No automatic GC.
- Stale writer lock recovery fails closed; require verified-owner-dead procedure. No automatic lock removal.
- TD10/TD11 remain conditionally remediated/closed for scoped C evidence pending reviewer status; TD12/TD13 unchanged; TD14 open for bounded drain; TD02 deferral unchanged.
- No power-loss durability, remote receiver dedupe, business completion, exactly-once or unconditional at-least-once guarantee.

## Required owner answers and next step

1. D01: confirm one-shot M02 lifecycle, legal transitions, concurrent-call semantics and whether public application shape remains unchanged.
2. D02: approve internal readiness only or an additive endpoint; define admissions by surface and exact compatibility-safe rejections.
3. D03: confirm drain work set, cutoff, treatment of generic M09 fan-out/snapshots/direct calls and dependency order.
4. D04: approve total deadline/default, timeout/close result semantics, repeated-signal escalation and supervisor responsibilities.
5. D05: approve best-effort aggregated cleanup and writer/limiter ownership guarantees.
6. D06: approve entrypoint-only signal policy and minimal diagnostic fields.

**STOP for owner approval.** No production fix, R7.6.B, commit or push was started. Before B, rerun app listener characterization in an authorized local-loopback environment, then implement only the approved decisions and verify the full lifecycle matrix.
