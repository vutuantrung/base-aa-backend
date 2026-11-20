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

## Interpretation and unresolved matters
- Architecture targets are not current conformance claims. R4-D03 acyclic dependencies and R4-D07 bounded graceful drain require R7 verification/implementation. R5 contract names in handoff are illustrative, not mandatory exports.
- APP/DEMO/TBD: 14 APP and 4 TBD runtime modules per handoff. Keep M12–M15 functionality until explicit classification. Target app/test/demo separation: app must not import test/demo, test and demo independent; current `testing/` playground stays until R7.7–9. Generic Messaging retained APP; mock generation DEMO, receiving/forwarding APP.
- R6 implementation choices (not new approved ADRs): minimal contract extraction, preserve adapter import compatibility, independent M12/M13 workflow classes and scheduler injection; no generic workflow/repository framework; M16 existing reader port sufficient, no hypothetical writer. Evidence: R6.4.A–E reports.
- No automatic retry, durability or ACK policy change; existing external shapes retained. Any intentional behavior correction requires task-level authorization and a recorded decision where appropriate.
