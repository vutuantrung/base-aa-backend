# AAB — Current checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`; committed and reviewer-accepted R7.4 HEAD `fa60d2d97887299e323f74eb2d408448e3f23529`. R7.5.A local source baseline is this HEAD. Pre-existing untracked prompts for R7.4 and R7.5.A were preserved. R7.5.A docs and characterization tests are local/uncommitted; no production source changed. No commit/push.
- R7.2 status remains: TD02 **OPEN** under Option B (all-aborts identity cleanup; spontaneous single-middleware abort remains unverified); TD03 **PARTIALLY REMEDIATED** (real PServer timing/resume contract and already-started delivery remain outside evidence); TD04 **remediated under deterministic characterization**, with real topology timing and non-atomic lookup-to-send limits. See [R7.2 closure review](../../R7_2_CLOSURE_REVIEW_REPORT.md).
- **R7.3.B — reviewer-accepted compatibility consolidation remains the prior phase.** D01=A through D04=A preserve current behavior; TD05–TD08 remain characterized risks, not behavior fixes. TD12 catalog schema/data migration remains deferred to R7.5.
- **R7.4 — reviewed/accepted and committed** at `fa60d2d97887299e323f74eb2d408448e3f23529`; TD09 explicit dispatch is implemented. See [R7.4 report](../../R7_4_EXPLICIT_INBOUND_OPERATION_DISPATCH_REPORT.md).
- **R7.5.A — durability contract and failure-policy baseline in progress locally.** Current M12/M13/M09/M16 guarantees and crash boundaries are recorded in [R7.5 decision baseline](R7_5_DURABILITY_DECISION_BASELINE.md); D01–D06 remain **PENDING**. Three deterministic characterization tests were added for F08 duplicate ID, identical M13 redelivery and M09 partial fan-out. No production code, wire/ACK behavior, schema or scheduler changed. See [A report](../../R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md).
- Fresh Node 22.23.5 verification: focused durability tests **39/39**, architecture checker passed, typecheck/build passed, backend **185/185**, playground **32/32**, diff check passed. Crash/power-loss recovery and external peer durability are not tested; loopback test execution used authorized local-only access.
- Next gate: owner review and approval of R7.5 D01–D06. **Do not begin R7.5.B/C or R7.6** until that review. No commit/push.
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
