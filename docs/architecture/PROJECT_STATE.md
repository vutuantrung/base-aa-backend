# AAB — Current checkpoint

- Repository `vutuantrung/base-aa-backend`, branch `main`; R7.3.A source baseline `986967fcae9176e87e53c792b07e9e68374ad74e`. R7.2 has reviewer approval as **CONDITIONALLY CLOSED**. The R7.3.A tests and documentation below are local, uncommitted changes based on this committed HEAD; the supplied untracked prompt is preserved. No production source changed.
- R7.2 status remains: TD02 **OPEN** under Option B (all-aborts identity cleanup; spontaneous single-middleware abort remains unverified); TD03 **PARTIALLY REMEDIATED** (real PServer timing/resume contract and already-started delivery remain outside evidence); TD04 **remediated under deterministic characterization**, with real topology timing and non-atomic lookup-to-send limits. See [R7.2 closure review](../../R7_2_CLOSURE_REVIEW_REPORT.md).
- **R7.3.A — compatibility decision baseline in progress.** TD05–TD08 source and test characterization is documented in [decision report](../../R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_REPORT.md). Decisions R7.3-D01 through D04 are **PENDING**; no disputed policy or production behavior is implemented. TD12 catalog schema/data changes remain deferred to R7.5.
- Fresh Node 22.23.5 verification after changes: focused relevant suite **50/50**, architecture check PASS (52 files, 113 edges; zero file runtime SCCs; M10↔M12↔M13 module runtime SCC reported), typecheck PASS, build PASS, backend **180/180**, playground **32/32**, and diff check PASS. See the R7.3.A report for exact commands and initial sandbox/fixture rerun notes.
- Next gate: architectural review of pending D01–D04. **Do not begin R7.3.B or R7.4** until decisions are approved. No commit/push.
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
