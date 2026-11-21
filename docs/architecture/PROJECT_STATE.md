# AAB — Current checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`; committed R7.3.A baseline `8044bfe60735d3fe13ab9dadac51c94a833e24d7`. R7.2 has reviewer approval as **CONDITIONALLY CLOSED**. R7.3.B documentation and focused assertion additions are local/uncommitted; no production source changed.
- R7.2 status remains: TD02 **OPEN** under Option B (all-aborts identity cleanup; spontaneous single-middleware abort remains unverified); TD03 **PARTIALLY REMEDIATED** (real PServer timing/resume contract and already-started delivery remain outside evidence); TD04 **remediated under deterministic characterization**, with real topology timing and non-atomic lookup-to-send limits. See [R7.2 closure review](../../R7_2_CLOSURE_REVIEW_REPORT.md).
- **R7.3.B — compatibility consolidation complete locally; recommendation CLOSED for this scope, pending reviewer approval.** D01=A through D04=A are approved as current-behavior preservation decisions; no runtime behavior changed. The stable [TD05–TD08 compatibility baseline](R7_3_COMPATIBILITY_BASELINE.md) and [B verification report](../../R7_3_B_COMPATIBILITY_CONSOLIDATION_VERIFICATION_REPORT.md) record evidence and external-consumer limits. TD05–TD08 remain characterized risks, not behavior fixes. TD12 catalog schema/data migration remains deferred to R7.5.
- Fresh Node 22.23.5 verification: focused applicable tests **50/50**, architecture checker passed, typecheck/build passed, backend **180/180**, playground **32/32**, diff check passed. Exact outcomes are in the R7.3.B report; no external PServer or production service was contacted.
- Next gate: reviewer approval of R7.3.B. **Do not begin R7.4.** No commit/push.
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
