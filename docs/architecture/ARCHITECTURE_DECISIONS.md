# AAB — Architecture decisions

The following 28 decisions are transcribed from user-supplied `AAB_REFACTOR_R0_R8_HANDOFF.md` §§4,6–8 (conversation handoff dated 2026-11-18). This is historical secondary evidence, not original ADR files or renewed user approval. The standalone original R0–R5 records were absent in the inspected repository. Do not represent these summaries as independently recovered original ADRs. Preserve decisions; resolve contradictions through explicit review.

| ID | Subject | Decision |
|---|---|---|
| ES-D01 | Generic Messaging | APP |
| ES-D02 | Task Workflow | TBD |
| ES-D03 | Resource Selection | TBD |
| ES-D04 | Generic Session | TBD |
| ES-D05 | Process Usage | TBD |
| ES-D06 | AA Catalog | APP |
| R3-D01 | PServer Transport & Protocol | Separate |
| R3-D02 | Peer Directory | Separate |
| R3-D03 | Generic & Peer Messaging | Separate |
| R3-D04 | Message Transformation | Separate |
| R3-D05 | Access Control | Distributed |
| R3-D06 | Persistence | Hybrid |
| R4-D01 | State Ownership | Single Owner |
| R4-D02 | Peer Directory State | Logical State Only |
| R4-D03 | Dependency Direction | Acyclic Dependencies |
| R4-D04 | Messaging Connection Access | Capability-based |
| R4-D05 | Resource Lifecycle | Coordinated Lifecycle |
| R4-D06 | Application Readiness | Separate Readiness States |
| R4-D07 | Pending Operations on Shutdown | Bounded Graceful Drain |
| R4-D08 | Environment State Isolation | Per-instance Isolation |
| R5-D01 | Interface Design | Consumer-driven |
| R5-D02 | Transport Contract | Protocol-neutral Event Transport |
| R5-D03 | Peer Directory Access | Separate Reader / Writer |
| R5-D04 | Messaging Contracts | Independent Contracts |
| R5-D05 | Inbound Operation Dispatch | Explicit Handler Composition |
| R5-D06 | Acknowledgment Semantics | Separate Semantics |
| R5-D07 | Repository Contracts | Domain-specific Repositories |
| R5-D08 | External Contract Compatibility | Preserve Existing Contracts |

## R7.3 compatibility decisions — approved

The architecture owner approved the following preserve-current options after the R7.3.A characterization. These decisions explicitly preserve observed behavior; they do not claim the behavior is ideal or prove compatibility with unknown external consumers. Evidence is summarized in the [R7.3 compatibility baseline](R7_3_COMPATIBILITY_BASELINE.md), characterized in the [R7.3.A report](../../R7_3_A_CONTRACT_COMPATIBILITY_DECISIONS_REPORT.md), and verified in the [R7.3.B report](../../R7_3_B_COMPATIBILITY_CONSOLIDATION_VERIFICATION_REPORT.md).

| Decision | Approved option and invariant | Evidence boundary / consequence |
|---|---|---|
| **R7.3-D01 — TD05 ACK-gated ingress** | **A — Preserve.** Without an ACK callback, M05 and M04 do not process peer-message/workflow payloads. Preserve M04's readiness-specific return/logging distinction from M05. No fire-and-forget, synthetic ACK, retry or implicit rejection. | M05 behavior is covered by local Socket.IO loopback; M04 by deterministic fake transport. No production PServer client was tested. This is compatibility preservation, not an endorsement that every sender currently uses ACKs. |
| **R7.3-D02 — TD06 transformer reference/output behavior** | **A — Preserve.** Retain mutable registered rule references, resolve-once execution, ordering/matching/cloning and existing output checks. Blank output `version` and `data: null` remain accepted where accepted now. No freeze/snapshot or validation tightening. | Mutation and execution behavior is deterministic unit-tested; metadata preservation is service-tested. External transformer consumers and produced payload corpus are unknown. Future tightening requires a new decision. |
| **R7.3-D03 — TD07 optional HTTP capability matrix** | **A — Preserve.** Keep absent-port empty 200/201, catalog route mounting and record 404 bodies, SQLite-disabled 503, auth-before-disabled 401, and exact `/extension` versus `/extension/...` behavior. No status/body normalization. | Local HTTP tests cover the recorded cases and note source-inferred combinations separately. No external HTTP client inventory exists; any response change requires API compatibility review. |
| **R7.3-D04 — TD08 process-usage validation/response** | **A — Preserve.** Keep strict HTTP validation and unknown-key stripping; keep direct repository acceptance wherever SQLite accepts; preserve immediate `create` response spread behavior, including runtime `id` overwrite. No DB schema or return-shape change. | Local HTTP and in-memory SQLite tests verify validation and immediate-versus-stored ID discrepancy. Direct repository consumer inventory is unknown. Any correction requires a new decision and caller migration assessment. |

TD12 catalog stored-data/schema migration remains deferred to R7.5; this decision set does not authorize it.

## R7.5 reliability decisions — detailed policy approved for Stage 2

The architecture owner approved D01–D06 and the detailed P01–P06 policy recorded in the
[R7.5 reliability policy](R7_5_RELIABILITY_POLICY.md). The approval authorizes the bounded
implementation described there; it does not claim peer-side deduplication, power-loss
durability, exactly-once business effects, or a shutdown drain. Verification and residual
limits are in the [Stage 2 report](../../R7_5_B_CONSERVATIVE_RELIABILITY_IMPLEMENTATION_REPORT.md).

| Decision | Approved selection | Scope and evidence boundary |
|---|---|---|
| R7.5-D01 — Receipt consistency | **B — approved.** One versioned canonical receipt+outbox record; exclusive temp, file sync, non-overwriting hard-link publication, directory sync attempt; no power-loss promise. |
| R7.5-D02 — Post-ACK recovery | **B — approved.** Only proven-unsent work is retryable. Any possibly-started send without a positive accepted ACK becomes `uncertain`; replay is disabled for current peers. |
| R7.5-D03 — Idempotency | **B — approved.** F08/F09 operation-prefixed task keys; M13 authenticated-AAUI + supplied message ID; exact ACK replay; stable `INVALID_MESSAGE` conflict; no missing-ID dedupe or key expiry. |
| R7.5-D04 — Delivery state | **B — approved.** Canonical persisted state precedes notification; M13 legacy statuses are projections and canonical records override old sidecars. |
| R7.5-D05 — M09 fan-out | **A — preserve current Promise.all/partial outcomes.** No aggregate result or retry change. |
| R7.5-D06 — M16 catalog | **A — preserve current behavior; no migration.** TD12 stays open. |

R7.5.A evidence is in the [A report](../../R7_5_A_DURABILITY_CONTRACTS_FAILURE_POLICIES_REPORT.md)
and [durability baseline](R7_5_DURABILITY_DECISION_BASELINE.md). The earlier
[policy-gate report](../../R7_5_B_POLICY_GATE_REPORT.md) records the former pending state;
the explicit approval and implementation supersede that gate.

R7.5.C was reviewer-accepted and conditionally closed for the scoped Linux process-crash
contract at commit `9c3cb2bec19dcc2cf9d31ce505bd84dc7a90a539`. See the committed
[C report](../../R7_5_C_FAILURE_RESTART_VERIFICATION_REPORT.md). C03 remains a usage risk:
same-key prepare/transform can run more than once, so transformers should be side-effect-free
or idempotent. This status does not claim power-loss durability, receiver deduplication or
exactly-once effects.

## R7.6 lifecycle decisions — approved D01–D06

The architecture owner approved the coordinated one-shot M02 lifecycle, internal readiness,
admission cutoff and tracked drain, single 15-second monotonic total deadline, dependency-safe
aggregated cleanup, and entrypoint-only signal ownership. The implemented contract and evidence
are recorded in the [R7.6.B report](../../R7_6_B_COORDINATED_BOUNDED_LIFECYCLE_IMPLEMENTATION_VERIFICATION_REPORT.md)
and [lifecycle policy](R7_6_LIFECYCLE_POLICY.md). The application API remains unchanged;
`SHUTDOWN_TIMEOUT_MS` is the approved bounded configuration. `/health` is unchanged and no
readiness endpoint is added. Evidence is local Linux loopback and process tests, not deployed
filesystem, remote receiver, power-loss, or unconditional delivery evidence. R4-D05–D08 and
R5-D08 remain preserved constraints.

## Interpretation and unresolved matters
- Architecture targets are not current conformance claims. R4-D03 acyclic dependencies and R4-D07 bounded graceful drain require R7 verification/implementation. R5 contract names in handoff are illustrative, not mandatory exports.
- APP/DEMO/TBD: 14 APP and 4 TBD runtime modules per handoff. Keep M12–M15 functionality until explicit classification. Target app/test/demo separation: app must not import test/demo, test and demo independent; current `testing/` playground stays until R7.7–9. Generic Messaging retained APP; mock generation DEMO, receiving/forwarding APP.
- R6 implementation choices (not new approved ADRs): minimal contract extraction, preserve adapter import compatibility, independent M12/M13 workflow classes and scheduler injection; no generic workflow/repository framework; M16 existing reader port sufficient, no hypothetical writer. Evidence: R6.4.A–E reports.
- No automatic retry, durability or ACK policy change; existing external shapes retained. Any intentional behavior correction requires task-level authorization and a recorded decision where appropriate.
