# R7.10.A — Architecture Scope Decision Policy

**Status: ALL AS-D01–AS-D06 PENDING OWNER APPROVAL.** This decision package prepares choices for the next phase. It grants no implementation, reclassification, debt closure, compatibility migration or R7.10.B authorization.

## Decision provenance and conflict matrix

The accepted baseline is `ea08e70f7855c96e8ce7ab18c83c224aada1f545`. R7.5 P01–P06 and R7.6 D01–D06 remain reliability/lifecycle constraints; R7.7 preserves manifest/profile/serial/playground boundaries and unknown rows; R7.8 C-D01/02/03=A protects the bounded lifecycle-to-example edge, direct-start callback/registration/listen order, distinct flags and app-local registry. R7.9 RC-D01–D07 and FI-D01–D05 are accepted; RC-D02 is scoped/equivalence-first, M02 extraction remains DEFERRED—EQUIVALENCE NOT PROVEN, and F1/F2 proof limits remain. M12/M13 stay TBD; M14/M15 stay APP. TD15–TD17 and other open debt stay open.

| New decision area | Existing constraint it may touch | Conflict control |
|---|---|---|
| Objective / candidate | RC-D01 narrow responsibility scope; no implicit R7.10 continuation | Discovery can choose which evidence to gather; does not reopen RC decisions. |
| Candidate scope | RC-D02 parity-first M02; FI-D05 test-only first; C-D01/02/03 compatibility | M02, if selected, remains characterization only; no extraction without separate owner scope and parity proof. |
| Ownership | M12/M13 TBD; M14/M15 APP; TD16/17 caller gaps | No ownership change inferred from paths/imports/demos or lack of local use. |
| Compatibility | R7.5/6 reliability, R7.7 tests, R7.8 public/startup contracts, R7.9 RC/FI decisions | Any supersession must name the exact contract and be approved before implementation. |
| Verification | 55-file manifest, serial backend, additive profiles, playground, Node 22.23.5 | Never weaken tests or claim deployment guarantees from local evidence. |
| Governance | Existing phase gates | R7.10.A ends with owner choice; R7.10.B authorization must be explicit and scoped. |

## AS-D01 — R7.10 primary objective

| Option | Scope / trade-off |
|---|---|
| **A — Business-boundary ownership evidence (recommended)** | Identify product/API owner and accepted outcomes for TBD capabilities. Resolves ownership questions, but needs product/external participants and may yield no code work. |
| **B — Risk-driven reliability and operations evidence** | Define supported deployment/runtime targets and verify bounded persistence/observability claims. Addresses explicit evidence gaps, but depends on operator target information and environment access. |
| **C — Maintainability improvement** | Select a bounded internal seam. Fastest visible code movement, but current evidence does not demonstrate that size/awkwardness is a business problem; compatibility and proof burden higher. |

**Recommended: A. State: PENDING OWNER APPROVAL.**

## AS-D02 — First bounded checkpoint selection

| Option | Scope / trade-off |
|---|---|
| **A — Deployment/runtime evidence plan and bounded verification (recommended)** | Candidate 1; report-only until operator defines supported targets. Covers concrete proof limits, but target access may be unavailable. |
| **B — Exact feature-mode characterization** | Candidate 3; repository-local and testable while preserving gates. Smaller; does not answer external ownership/deployment needs. |
| **C — Defer/no implementation** | Preserve current behavior and select no technical work until owner evidence arrives. Lowest change risk; known unknowns remain. |

**Recommended: A, conditional on operator target matrix; otherwise C. State: PENDING OWNER APPROVAL.**

## AS-D03 — Ownership and contract discovery policy

| Option | Scope / trade-off |
|---|---|
| **A — Preserve current TBD/APP labels until affirmative evidence (recommended)** | Product/operator survey may document evidence, but labels change only after explicit owner decision. Conservative; questions persist longer. |
| **B — Narrowly survey external callers and product owners** | Gather named consumer/release/product evidence for selected boundary; no automatic reclassification. More effort; can make migration decisions verifiable. |
| **C — Reclassify from current code shape/imports** | Treat existing implementation or local absence of use as ownership evidence. Quick but unsafe; conflicts with approved TBD and unknown-consumer rules. |

**Recommended: A, with B as a separately scoped evidence task when owner identifies a target. State: PENDING OWNER APPROVAL. Option C is unsafe under current baseline.**

## AS-D04 — Implementation and compatibility gate

| Option | Scope / trade-off |
|---|---|
| **A — Discovery/characterization first, then separately approved implementation (recommended)** | Establish observable contract, owner and acceptance evidence before code. Protects R7.5–R7.9; takes more checkpoints. |
| **B — Implement a bounded change now under a named approved scope** | Could reduce elapsed checkpoints, but no such scope is presently approved and current assessment is discovery-only. Requires a new explicit decision before any edit. |
| **C — Stop/no action** | Keep code untouched until a demonstrated need appears. Lowest compatibility risk; does not reduce current technical debt. |

**Recommended: A. State: PENDING OWNER APPROVAL.**

## AS-D05 — Verification and failure-evidence policy

| Option | Scope / trade-off |
|---|---|
| **A — Candidate-targeted gates plus full maintained regression gates when implementation is separately authorized (recommended)** | Use precise focused/contract tests, architecture + manifest, typecheck/build as relevant, serial backend, Full and independent playground; capture logs/metadata and qualify environment. Strongest evidence, highest runtime cost. |
| **B — Discovery-only evidence, no tests unless a test contract is proposed** | Lowest cost for report-only ownership/deployment inquiry; makes no runtime claims. Does not satisfy implementation verification. |
| **C — Fast profile only for all future work** | Cheaper but misses listener/SQLite/process coverage; conflicts with R7.7’s use of Full/serial compatibility gates. Not acceptable without a separately approved exception. |

**Recommended: A for future implementation; B for report-only discovery. State: PENDING OWNER APPROVAL. C conflicts with the accepted baseline.**

## AS-D06 — Scope governance and exit criteria

| Option | Scope / trade-off |
|---|---|
| **A — Explicit checkpoint approval and bounded exit record (recommended)** | R7.10.A completes only when artifacts, baseline, evidence limits, shortlist and pending decisions are reviewed; each later implementation requires owner, contract, files, tests, rollback and stop criteria. Clear traceability; more formal checkpoints. |
| **B — Standing authorization for an entire R7.10 implementation phase** | Fewer approvals but broadens risk and can implicitly supersede compatibility constraints. Not appropriate absent a written scope/budget. |
| **C — Close A and defer all follow-on work** | Leaves every later action unapproved until new evidence/need appears. Simple and safe; open questions remain. |

**Recommended: A. State: PENDING OWNER APPROVAL. R7.10.A exit means this assessment is reviewable, not completed/accepted. R7.10.B would require a separate explicit owner approval naming objective, boundary, owner, contracts, permitted paths, verification, rollback and stop conditions.**

## Approval record

| Decision | State | Owner selection |
|---|---|---|
| AS-D01 | **PENDING OWNER APPROVAL** | — |
| AS-D02 | **PENDING OWNER APPROVAL** | — |
| AS-D03 | **PENDING OWNER APPROVAL** | — |
| AS-D04 | **PENDING OWNER APPROVAL** | — |
| AS-D05 | **PENDING OWNER APPROVAL** | — |
| AS-D06 | **PENDING OWNER APPROVAL** | — |

The original R7.10.A record above reflected the state before owner review. The following approval record supersedes its pending status for AS-D01–AS-D06 only; option descriptions and recommendation prose above remain the proposal snapshot and are not rewritten.

## Architecture Owner approval record — R7.10.B scope

**Approved scope:** R7.10.B Exact Feature-Mode Compatibility Characterization only. No implementation, contract redesign, ownership reclassification, R7.10.C or R7.11 authorization.

| Decision | State | Owner selection | Binding scope |
|---|---|---|---|
| AS-D01 | **OWNER APPROVED** | A | Evidence-backed business-boundary ownership objective; no code movement for its own sake. |
| AS-D02 | **OWNER APPROVED** | B | Exact Feature-Mode Compatibility Characterization is the first bounded checkpoint; deployment/runtime evidence stays separate. |
| AS-D03 | **OWNER APPROVED** | A | Preserve M12/M13 TBD and M14/M15 APP; no inferred ownership changes. |
| AS-D04 | **OWNER APPROVED** | A | Characterization before separately authorized implementation; no runtime/contract redesign. |
| AS-D05 | **OWNER APPROVED, SCOPED** | A | Focused/contract-oriented evidence; maintained full regression gates where tests change; do not force Full for docs-only work. |
| AS-D06 | **OWNER APPROVED** | A | Separate owner authorization for later changes and explicit bounded exit/stop criteria. |

Approval authorizes R7.10.B only. It does not authorize feature normalization, refactoring, new DI seams, module ownership changes, or a subsequent checkpoint.
