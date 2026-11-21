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

## Interpretation and unresolved matters
- Architecture targets are not current conformance claims. R4-D03 acyclic dependencies and R4-D07 bounded graceful drain require R7 verification/implementation. R5 contract names in handoff are illustrative, not mandatory exports.
- APP/DEMO/TBD: 14 APP and 4 TBD runtime modules per handoff. Keep M12–M15 functionality until explicit classification. Target app/test/demo separation: app must not import test/demo, test and demo independent; current `testing/` playground stays until R7.7–9. Generic Messaging retained APP; mock generation DEMO, receiving/forwarding APP.
- R6 implementation choices (not new approved ADRs): minimal contract extraction, preserve adapter import compatibility, independent M12/M13 workflow classes and scheduler injection; no generic workflow/repository framework; M16 existing reader port sufficient, no hypothetical writer. Evidence: R6.4.A–E reports.
- No automatic retry, durability or ACK policy change; existing external shapes retained. Any intentional behavior correction requires task-level authorization and a recorded decision where appropriate.
