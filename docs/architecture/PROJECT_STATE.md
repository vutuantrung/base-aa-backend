# AAB — Current checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`; actual committed source HEAD for R7.6.A is `9c3cb2bec19dcc2cf9d31ce505bd84dc7a90a539`. R7.5.C is reviewer-accepted and conditionally closed for scoped Linux process-crash reliability at this commit. The preceding checkpoint's local R7.5 documentation edits and untracked task prompts are preserved in the working tree; this checkpoint does not claim they are committed. New R7.6.A deliverables are docs plus characterization record only; no production code changed. No commit/push.
- R7.2 status remains: TD02 **OPEN** under Option B (all-aborts identity cleanup; spontaneous single-middleware abort remains unverified); TD03 **PARTIALLY REMEDIATED** (real PServer timing/resume contract and already-started delivery remain outside evidence); TD04 **remediated under deterministic characterization**, with real topology timing and non-atomic lookup-to-send limits. See [R7.2 closure review](../../R7_2_CLOSURE_REVIEW_REPORT.md).
- **R7.3.B — reviewer-accepted compatibility consolidation remains the prior phase.** D01=A through D04=A preserve current behavior; TD05–TD08 remain characterized risks, not behavior fixes. TD12 catalog schema/data migration remains deferred to R7.5.
- **R7.4 — reviewed/accepted and committed** at `fa60d2d97887299e323f74eb2d408448e3f23529`; TD09 explicit dispatch is implemented. See [R7.4 report](../../R7_4_EXPLICIT_INBOUND_OPERATION_DISPATCH_REPORT.md).
- **R7.5.A — committed and accepted.** Historical Node 22.23.5 verification is recorded in the [A report](../../R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md).
- **R7.5.B Stage 2** was implemented from committed baseline `33061c8eea051cfcfba9ad7356e51233a2c1980d`; the historical [Stage 2 report](../../R7_5_B_CONSERVATIVE_RELIABILITY_IMPLEMENTATION_REPORT.md) records its verification and limits. P01–P06 remain the approved policy.
- **R7.5.C — conditionally closed for reviewer approval.** Source fixes address C01/C02 and conservative bounds, cache/quarantine, writer lifecycle and capacity findings. The process harness used child `SIGKILL` on Linux/tmpfs; this does not establish production filesystem or power-loss behavior. See the [failure/restart report](../../R7_5_C_FAILURE_RESTART_VERIFICATION_REPORT.md) for the crash matrix, final verification and evidence boundaries. TD10/TD11 are conditionally closed for the scoped contract pending reviewer acceptance; TD12/TD13 remain unchanged and TD14 bounded drain stays with R7.6.
- **Current verification:** Node 22.23.5; backend **223/223**, playground **32/32**, typecheck/build passed; architecture 55 files/131 edges with zero runtime file SCCs; see the C report for the approved loopback rerun and diff check. No new runtime source file was added; process-test helpers are test-only.
- **R7.6.A — characterization and decision package complete, pending owner approval.** Current ownership/startup/shutdown/readiness evidence and limits are in the [baseline](R7_6_LIFECYCLE_DECISION_BASELINE.md); proposed D01–D06 options and acceptance criteria are [pending](R7_6_LIFECYCLE_POLICY.md). Listener tests were blocked by `listen EPERM`; this report claims no app-level listener reproduction. Runner characterization, architecture, typecheck and build passed. Do not implement R7.6.B until D01–D06 receive explicit answers. No commit/push.
- R7.5 C03 residual remains: same-key transformations may run twice; transformers need side-effect-free/idempotent behavior. Global attempt limit is 4, quotas remain 5,000 records/128 MiB per M12/M13 directory (10,000/256 MiB aggregate), there is no auto GC, and stale-lock recovery fails closed. No power-loss, receiver-dedupe or exactly-once claim.
- Stop for owner approval. Do not commit/push or begin R7.6.B.
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
