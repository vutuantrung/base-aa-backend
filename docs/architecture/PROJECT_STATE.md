# AAB — Current checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`; current tested committed base for R7.6.B is `3fe329bc596e768935d2e611b20164153f5199b5`; all R7.6.B source/tests/docs are dirty/uncommitted. R7.5.C remains conditionally closed for scoped Linux process-crash reliability at its accepted checkpoint. No commit/push.
- R7.2 status remains: TD02 **OPEN** under Option B (all-aborts identity cleanup; spontaneous single-middleware abort remains unverified); TD03 **PARTIALLY REMEDIATED** (real PServer timing/resume contract and already-started delivery remain outside evidence); TD04 **remediated under deterministic characterization**, with real topology timing and non-atomic lookup-to-send limits. See [R7.2 closure review](../../R7_2_CLOSURE_REVIEW_REPORT.md).
- **R7.3.B — reviewer-accepted compatibility consolidation remains the prior phase.** D01=A through D04=A preserve current behavior; TD05–TD08 remain characterized risks, not behavior fixes. TD12 catalog schema/data migration remains deferred to R7.5.
- **R7.4 — reviewed/accepted and committed** at `fa60d2d97887299e323f74eb2d408448e3f23529`; TD09 explicit dispatch is implemented. See [R7.4 report](../../R7_4_EXPLICIT_INBOUND_OPERATION_DISPATCH_REPORT.md).
- **R7.5.A — committed and accepted.** Historical Node 22.23.5 verification is recorded in the [A report](../../R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md).
- **R7.5.B Stage 2** was implemented from committed baseline `33061c8eea051cfcfba9ad7356e51233a2c1980d`; the historical [Stage 2 report](../../R7_5_B_CONSERVATIVE_RELIABILITY_IMPLEMENTATION_REPORT.md) records its verification and limits. P01–P06 remain the approved policy.
- **R7.5.C — conditionally closed for reviewer approval.** Source fixes address C01/C02 and conservative bounds, cache/quarantine, writer lifecycle and capacity findings. The process harness used child `SIGKILL` on Linux/tmpfs; this does not establish production filesystem or power-loss behavior. See the [failure/restart report](../../R7_5_C_FAILURE_RESTART_VERIFICATION_REPORT.md) for the crash matrix, final verification and evidence boundaries. TD10/TD11 are conditionally closed for the scoped contract pending reviewer acceptance; TD12/TD13 remain unchanged and TD14 bounded drain stays with R7.6.
- **R7.6.B — implementation complete, pending reviewer assessment.** Tested committed base `3fe329bc596e768935d2e611b20164153f5199b` on `main`; current worktree is dirty and includes this checkpoint plus the pre-existing untracked prompt. M02 one-shot lifecycle/admission, 15s default bounded shutdown deadline, coordinated drain, entrypoint signal handling and process-local runner exclusivity are implemented. Node 22.23.5: typecheck/build pass; backend **241/241**, playground **32/32**. Focused lifecycle/app loopback 14/14; R7.5 crash/outbox 9/9. Ordinary architecture check reports new untracked sources missing from tracked graph; temporary-index result recorded in report. See [implementation report](../../R7_6_B_COORDINATED_BOUNDED_LIFECYCLE_IMPLEMENTATION_VERIFICATION_REPORT.md), [approved policy](R7_6_LIFECYCLE_POLICY.md) and [implemented baseline](R7_6_LIFECYCLE_DECISION_BASELINE.md). No commit/push; stop for reviewer.
- R7.5 C03 residual remains: same-key transformations may run twice; transformers need side-effect-free/idempotent behavior. Global attempt limit is 4, quotas remain 5,000 records/128 MiB per M12/M13 directory (10,000/256 MiB aggregate), there is no auto GC, and stale-lock recovery fails closed. No power-loss, receiver-dedupe or exactly-once claim.
- Stop for reviewer assessment. Do not commit/push or begin R7.7.
- R7.1 remains conditionally closed; its module SCC and checker limitations remain deferred. See [R7.1 closure review](../../R7_1_CLOSURE_ARCHITECTURE_REVIEW_REPORT.md).

## Read on demand
| Need | File / section |
|---|---|
| Runtime topology, flows, roadmap | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Ownership and implementation paths | [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) |
| Prior architectural constraints | [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) |
| Known risks and sequencing | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) |
| R7.2 reliability evidence | [R7_2_RELIABILITY_RISK_INVENTORY.md](R7_2_RELIABILITY_RISK_INVENTORY.md) |

## Checkpoint protocol
Check HEAD/status first. Preserve unrelated work. Record the committed source baseline and dirty paths; never invent a future SHA. Use current source/tests over summaries, and keep pending decisions explicit. Do not commit/push or advance phases without authorization.
