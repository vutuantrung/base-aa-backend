# R7.10.C — Architecture Scope Decision Policy

**Status: SC-D01–SC-D05 ALL PENDING OWNER APPROVAL.** Recommendations are proposals. No implementation, survey, ownership reclassification, debt closure, R7.10.D or R7.11 is authorized.

## Provenance and guardrails

Committed baseline: `3af7920814e2260ae3cdfeef220ef75fbea0daeb`. The later R7.10.A approval record governs: AS-D01=A, AS-D02=B, AS-D03=A, AS-D04=A, AS-D05=A scoped, AS-D06=A. R7.10.B fulfilled AS-D02=B with exact feature-mode characterization and added only two tests to existing files. Its local test evidence is committed; it is not evidence of deployed env values or external PServer behavior.

R7.5 P01–P06, R7.6 D01–D06, R7.7 manifest/serial/profile/playground rules, R7.8 C-D01/02/03=A, and R7.9 RC/FI decisions remain binding. M12/M13 stay TBD; M14/M15 stay APP. TD15–TD17 and all existing debt stay open. M02 extraction remains **DEFERRED — EQUIVALENCE NOT PROVEN**. R7.9 F1/F2 proof limitations, historical unattributed failures and unresolved focused-versus-Full discrepancy remain unchanged.

| Scope | Current evidence | Conflict guard |
|---|---|---|
| Feature modes | Source and B tests agree on exact flags, defaults, separate consumers and both mismatches; no named defect. | Retain exact `'1'`, defaults, PServer injection, callback/registration/listen order and app-local registry. |
| External callers | README demonstrates embedding; package manifest is private/no exports; committed audits say external uses unknown. | Do not infer non-use or remove/narrow any handle/facade without a named distribution owner and consumer evidence. |
| Business ownership | M12/M13 implementation exists but formal ownership is TBD. | Do not classify/move based on names/imports/demo fixtures. Preserve receipt/ACK/persistence contracts. |
| Additive design | No accepted caller/product/operator requirement, budget, or version migration boundary is recorded. | No abstract capability design now. A future proposal requires independent approval and named evidence. |
| Verification | C is docs-only; B already records full verification. | Run documentation-scope architecture/manifest/diff checks only; later test/code work uses scoped focused tests plus maintained serial/Full/playground gates. |

## SC-D01 — Feature-mode disposition

| Option | Scope and trade-off |
|---|---|
| **A — Freeze current compatibility semantics (recommended)** | Treat R7.10.B matrix as the current contract; no more mode tests or code unless a material caller-specific gap appears. Low risk and avoids repetitive testing; broader TD16 remains open. |
| **B — One additional bounded characterization** | Target one named combination/outcome that current source/tests cannot settle. Can close a concrete proof gap; requires a user-visible contract question and might still not answer deployment behavior. |
| **C — Separately approved versioned gate/default change** | Could intentionally revise a compatibility contract, but requires a named consumer need, versioning/release policy, migration, rollback and full proof. Not supported by current evidence. |

**Recommendation: A. Status: PENDING OWNER APPROVAL.** Do not describe A as closing TD16.

## SC-D02 — Next responsibility evidence target

| Option | Scope and trade-off |
|---|---|
| **A — External app API/distribution and legacy caller inventory** | Target `createApplication`/`startApplication`, 11 `ApplicationInstance` fields, documented embedding and named legacy facade imports, but only for channels an accountable release/deployment owner confirms. Produces compatibility evidence; current package is private and no provider/channel is named. |
| **B — M12/M13 product ownership and receiver contract discovery** | Identify product/API, downstream receiver and operator owners; record outcomes, ACK, retention and support boundaries without reclassification. High value for future business ownership; no owner is named in the repo. |
| **C — Defer discovery until an accountable evidence provider and target are named (recommended)** | Preserve code/contracts/TBD while asking the Architecture Owner to identify a package/release maintainer, supported channel, product owner or operator. Avoids a speculative survey; leaves uncertainty explicit. |

**Recommendation: C now.** If an owner supplies a repository/release maintainer and supported channel, A is the smallest initial survey; if a product owner and receiver are named, B can be separately scoped. **Status: PENDING OWNER APPROVAL.** A or B selection does not authorize changes.

## SC-D03 — Threshold for additive capability/versioned design

| Option | Scope and trade-off |
|---|---|
| **A — Require an accepted, named observable requirement before design (recommended)** | Require an accountable consumer/product/operator, concrete unmet outcome, present contract and impact, compatibility/versioning boundary, migration/rollback plan, budget and acceptance tests. Prevents speculative abstractions; delays design until need is evidenced. |
| **B — Conduct more discovery before any design** | May identify the requirement/provider if one is named; otherwise risks an open-ended exercise. Must be separately bounded and report-only. |
| **C — Reject additive design under current evidence** | No current design proposal. Avoids unneeded API surface; reconsider only through a new explicit owner decision when a requirement exists. |

**Recommendation: A, with present eligibility marked NOT ELIGIBLE.** There is no named requirement or change budget in committed A/B evidence. No capability names, interface, migration or code design is proposed. **Status: PENDING OWNER APPROVAL.**

## SC-D04 — Verification and evidence policy

| Option | Scope and trade-off |
|---|---|
| **A — Proportional evidence gates (recommended)** | For docs-only work: architecture, manifest and diff checks; state Node/npm and no test rerun. If a later test/code checkpoint is separately approved: focused tests for the contract plus typecheck/build as relevant, unchanged serial backend, Full backend plus playground, environment qualification, bounded attempts and complete logs/metadata. Strong traceability with cost matched to change. |
| **B — Run Full/serial/playground even for every docs-only checkpoint** | Produces fresh broad regression evidence at higher time/cost without testing changed runtime. It must not be presented as required by this docs-only decision. |
| **C — Fast-only for future code changes** | Lower cost but omits listener/native SQLite/process coverage; conflicts with the maintained R7.7 regression contract absent a specific separately approved exception. |

**Recommendation: A. Status: PENDING OWNER APPROVAL.** No application tests are authorized or needed in this decision-only checkpoint.

## SC-D05 — R7.10 exit and governance

| Option | Scope and trade-off |
|---|---|
| **A — Record decision package and stop for owner choices (recommended)** | C exits when evidence, options, pending decisions and verification are reviewable. Owner acceptance may freeze the feature-mode subtopic; unresolved debt/ownership is recorded, not closed. Clear scope; no automatic next phase. |
| **B — Permit one separately approved discovery checkpoint** | Owner may later name the evidence provider, target, scope, output and stop condition. Can reduce unknowns; does not authorize implementation or reclassification. |
| **C — Standing authorization for broad follow-on architecture/implementation** | Fewer gates but risks implicitly changing APIs, ownership and R7.5–R7.9 contracts. Not appropriate and prohibited by this checkpoint. |

**Recommendation: A, with B only by explicit later owner scope. Status: PENDING OWNER APPROVAL.** R7.10.D and R7.11 require separate authorization; this package grants none.

## Approval record

| Decision | State | Owner selection |
|---|---|---|
| SC-D01 | **PENDING OWNER APPROVAL** | — |
| SC-D02 | **PENDING OWNER APPROVAL** | — |
| SC-D03 | **PENDING OWNER APPROVAL** | — |
| SC-D04 | **PENDING OWNER APPROVAL** | — |
| SC-D05 | **PENDING OWNER APPROVAL** | — |

No decision is selected or approved in this checkpoint. Stop for Architecture Owner review.

## Architecture Owner approval record — 2026-11-24

The Architecture Owner approved the following decisions for the final R7.10 closure checkpoint. This later record supersedes the pending status above for current governance; the original proposal tables and pending snapshot are retained as historical evidence.

| Decision | Approved selection | Binding scope |
|---|---|---|
| SC-D01 | **A** | Freeze the exact feature-mode compatibility semantics characterized in R7.10.B. No extra tests, normalization, default/API change or redesign absent a named material caller-specific gap. |
| SC-D02 | **C** | Defer external caller/product ownership discovery until an accountable evidence provider and named target/channel/boundary exist. Unknown consumers are not presumed absent. |
| SC-D03 | **A** | Require an accepted concrete observable unmet need, accountable product/consumer/operator, versioning/compatibility boundary, migration/rollback budget, and acceptance evidence before additive/versioned capability design. Current eligibility: **NOT ELIGIBLE**. |
| SC-D04 | **A** | Use proportional checks now. Separately authorized future test/implementation work must use scoped tests plus maintained serial/Full/playground gates as applicable and capture bounded complete failure evidence. |
| SC-D05 | **A** | Record bounded exit and owner review. This approval grants no standing authority for implementation, R7.10.D or R7.11. |

These approvals do not close technical debt, reclassify ownership, execute an external survey, establish deployment/PServer behavior, or prove any unverified R7.5–R7.9 boundary. M12/M13 remain TBD; M14/M15 remain APP; M02 extraction remains **DEFERRED — EQUIVALENCE NOT PROVEN**. Final R7.10 closure remains subject to review of the closure report; this record does not self-approve that final closure.
