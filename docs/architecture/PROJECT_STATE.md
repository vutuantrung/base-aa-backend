# AAB — Current checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`; actual committed R7.5.A HEAD `464d88fa50a5060a83f8395cd1a64312e0b9c12f` (`update 11212221`). R7.5.A report, baseline, characterization tests and docs are committed. At R7.5.B start, working tree and index were clean. No commit/push in this checkpoint.
- R7.2 status remains: TD02 **OPEN** under Option B (all-aborts identity cleanup; spontaneous single-middleware abort remains unverified); TD03 **PARTIALLY REMEDIATED** (real PServer timing/resume contract and already-started delivery remain outside evidence); TD04 **remediated under deterministic characterization**, with real topology timing and non-atomic lookup-to-send limits. See [R7.2 closure review](../../R7_2_CLOSURE_REVIEW_REPORT.md).
- **R7.3.B — reviewer-accepted compatibility consolidation remains the prior phase.** D01=A through D04=A preserve current behavior; TD05–TD08 remain characterized risks, not behavior fixes. TD12 catalog schema/data migration remains deferred to R7.5.
- **R7.4 — reviewed/accepted and committed** at `fa60d2d97887299e323f74eb2d408448e3f23529`; TD09 explicit dispatch is implemented. See [R7.4 report](../../R7_4_EXPLICIT_INBOUND_OPERATION_DISPATCH_REPORT.md).
- **R7.5.A — committed and accepted** at the HEAD above. Historical Node 22.23.5 verification is recorded in the [A report](../../R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md); this checkpoint does not claim a new test run.
- **R7.5.B Stage 2 — local implementation based on committed HEAD `33061c8eea051cfcfba9ad7356e51233a2c1980d`.** Detailed P01–P06 are approved and recorded; the earlier gate report is historical. Canonical receipt/outbox records, bounded proven-unsent retries, duplicate handling and M13 projections are implemented in the dirty tree. No future commit is claimed; the original untracked task prompt is preserved.
- **Fresh verification completed on Node 22.23.5:** focused outbox/workflow/policy tests passed (47 cases); backend **199/199**, playground **32/32**, typecheck and build passed. The direct architecture command reports the new untracked source files are outside its Git-tracked graph; a temporary-index run including all proposed `src` and checker changes passed with 55 files / 130 edges and 0 runtime file SCCs. `git diff --check` passed. Details and residual verification limits are in the [Stage 2 implementation report](../../R7_5_B_CONSERVATIVE_RELIABILITY_IMPLEMENTATION_REPORT.md).
- R7.5.B Stage 2 is locally implemented for review, not committed. Real receiver idempotency, production filesystem behavior, cross-process stress, process-kill matrix and power-loss durability remain unverified; TD10/TD11 stay open pending review and R7.5.C. TD12/TD13 remain unchanged; TD14 bounded drain stays with R7.6. No commit/push. **Do not begin R7.5.C or R7.6** here.
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
