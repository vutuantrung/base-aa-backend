# R8.0 — Architecture Owner Decision Policy

> Current naming baseline for any future planning references: AS, CDC, SPA, AA and EServer, with peer IDs `as`, `cdc`, `spa`, `aa`, `eserver`. This note does not alter historical debt evidence or approve any R8 work.

**R8-D01–R8-D06: ALL PENDING OWNER APPROVAL.** Every recommendation below is a proposal. Selecting a roadmap or candidate does not authorize its execution; each checkpoint requires a separate bounded approval.

## Provenance and constraints

The historical R8.1–R8.5 outline in `ARCHITECTURE.md` names themes only; no detailed accepted checkpoint scopes or R8 decision records were found. `TECHNICAL_DEBT.md` explicitly maps TD18 to R8.3/R8.4 and TD19 to R8.2/R8.4/R8.5. Other proposed mappings in the [reconciliation matrix](R8_0_ROADMAP_RECONCILIATION_MATRIX.md) are inferred and labeled.

R7.10 final closure is accepted CLOSED within its approved scope per Architecture Owner direction and committed baseline `72b31e54e266743fbfd18b6169e4a85c843ddeb7`. The current `PROJECT_STATE.md` still labels its historical final checkpoint entry pending review; that is documentary lag, not a reopening of the decision. This planning checkpoint proposes an additive current-state annotation and preserves the historical snapshot.

Binding prior decisions remain: R7.5 P01–P06; R7.6 D01–D06; R7.7 manifest/profile/serial/playground and `unknown` row policy; R7.8 accepted lifecycle→example edge and app-local registry; R7.9 RC/FI decisions and F1/F2 limitations; R7.10 AS-D01–D06 and SC-D01–D05. Feature modes remain frozen; M12/M13 TBD; M14/M15 APP; TD15–TD17 and all other debt statuses unchanged; M02 extraction **DEFERRED — EQUIVALENCE NOT PROVEN**. No production behavior, contract, ownership taxonomy, API or technical-debt status may be changed by this plan.

## R8-D01 — Overall objective and historical outline

| Option | Trade-off |
|---|---|
| **A — Retain R8.1–R8.5 as a high-level theme outline; approve only evidence-bounded sub-checkpoints (recommended)** | Preserves continuity while clearly separating old headings from new scope. Adds approval gates and may leave unready topics unstarted. |
| **B — Reorder/rename the themes at roadmap level** | Could align order with evidence readiness, but risks invalidating historical references and must not imply authorization. Requires explicit replacement mapping. |
| **C — Mark R8 as planning complete and leave no active roadmap** | Avoids open-ended phase expectations; loses a useful index of unresolved evidence. R8.0 matrix can remain a record only. |

**Recommendation: A. Owner question:** keep the outline as themes while using bounded sub-checkpoints, or replace the outline with a new approved sequence? **Status: PENDING OWNER APPROVAL.**

## R8-D02 — First bounded checkpoint and ordering

| Option | Trade-off |
|---|---|
| **A — Risk/evidence-readiness order (recommended)** | First select an independently supportable TD10/11 local process-crash boundary review or a target-backed environment/compatibility scope. Avoids numbering for its own sake, but starts only with explicit selection and prerequisites. |
| **B — Strict R8.1→R8.5 numbered order** | Simple historical continuity; may spend time on static conformance before actionable external/reliability evidence. |
| **C — No next checkpoint until owner identifies a named provider/target** | Prevents speculative discovery; delays local-only evidence review that could proceed independently. |

**Recommendation: A with a prerequisite gate; R8.3.A local docs-only boundary review is the lowest external dependency if owner wants immediate evidence work.** This does not authorize it. **Owner question:** which one bounded candidate, if any, should be separately authorized first? **Status: PENDING OWNER APPROVAL.**

## R8-D03 — External evidence and no-provider rule

| Option | Trade-off |
|---|---|
| **A — Require named accountable provider and target/channel/boundary; stop if unavailable (recommended)** | Keeps unknown distinct from absent and makes discovery actionable; work may remain blocked. |
| **B — Repository-only inventory before naming a provider** | Can list local surfaces cheaply but cannot establish external consumers or supported distributions and risks implying completeness. |
| **C — Treat local absence/private package/grep as evidence of non-use** | Fast but unsound; may break compatibility contracts. Not recommended. |

**Recommendation: A. Owner question:** name role and target only if actual evidence is available; otherwise accept blocked status. No contact or survey is authorized here. **Status: PENDING OWNER APPROVAL.**

## R8-D04 — Production/runtime target matrix

| Option | Trade-off |
|---|---|
| **A — Require operator-supplied matrix and isolated approved test target before runtime verification (recommended)** | Establishes Node/OS/native SQLite/env/storage context and protects data; requires operator preparation. |
| **B — Verify only local supported Node 22 baseline** | Reproducible and useful for local behavior, but does not resolve TD18/19 deployment gaps. |
| **C — Infer production compatibility from mocks or local tests** | Avoids external setup, but conflates test evidence and deployment proof. Not acceptable. |

**Recommendation: A for target claims, with B only labeled local evidence.** Owner question: is there a named operator, supported runtime/channel, and safe disposable data path? No target means blocked, not passed. **Status: PENDING OWNER APPROVAL.**

## R8-D05 — Compatibility, ownership and debt treatment

| Option | Trade-off |
|---|---|
| **A — Preserve contracts/classifications/debt until affirmative evidence and separate decision (recommended)** | Protects R7.5–R7.10 commitments and prevents speculative cleanup; uncertainty remains visible. |
| **B — Permit only evidence-backed scoped exceptions per separately approved checkpoint** | Allows a concrete caller need to be addressed, with migration/rollback evidence; requires a named affected contract and owner. |
| **C — Use R8 to close/reclassify accumulated debt by roadmap placement** | Simplifies tracking but debt mapping is not proof or approval; rejected. |

**Recommendation: A, with B available only via explicit checkpoint authorization.** Preserve M12/M13 TBD, M14/M15 APP, TD15–TD17 open, all other recorded statuses, frozen feature mode, and deferred M02 extraction. **Owner question:** confirm these preservation rules govern every R8 scope. **Status: PENDING OWNER APPROVAL.**

## R8-D06 — Verification, authorization and exit

| Option | Trade-off |
|---|---|
| **A — Proportional checks and per-checkpoint approval/exit (recommended)** | Docs-only gets architecture/manifest/diff and Markdown checks. Separately authorized test/code gets focused evidence, typecheck/build as applicable, maintained serial/Full/playground gates, complete logs/metadata and bounded attempts. Strong traceability; explicit process per checkpoint. |
| **B — Run Full/serial/playground for every documentation checkpoint** | Broad evidence at additional time cost without changed runtime; not needed for R8.0. |
| **C — Approve roadmap-wide implementation and Fast-only verification** | Fast but removes maintained safeguards and conflates planning with authorization. Rejected. |

**Recommendation: A. Owner question:** accept proportional verification and require separate scoped approvals, rollback/stop criteria and closure evidence for each checkpoint? **Status: PENDING OWNER APPROVAL.**

## Approval record

| Decision | State | Owner selection |
|---|---|---|
| R8-D01 | **PENDING OWNER APPROVAL** | — |
| R8-D02 | **PENDING OWNER APPROVAL** | — |
| R8-D03 | **PENDING OWNER APPROVAL** | — |
| R8-D04 | **PENDING OWNER APPROVAL** | — |
| R8-D05 | **PENDING OWNER APPROVAL** | — |
| R8-D06 | **PENDING OWNER APPROVAL** | — |

Codex has selected or approved none of these decisions. R8.0 planning approval is not execution authorization for R8.1–R8.5, R7.10.D, R7.11, surveys, production verification or implementation. Stop for Architecture Owner review.
