# AS — Product Development Baseline Checkpoint

> Current naming overlay: active feature work should use AS, CDC, SPA, AA and EServer names and identities. This checkpoint's original accepted baseline evidence and embedded prompt are preserved verbatim in meaning; historical references below remain historical. This note does not change its scope or decisions.

**Checkpoint ID:** AAB-PDEV-BASELINE-2026-11-24  
**Date:** 2026-11-24  
**Repository:** `vutuantrung/base-aa-backend`  
**Branch:** `main`  
**Verified HEAD:** `72b31e54e266743fbfd18b6169e4a85c843ddeb7` (`checkpoint R7.10 final architecture closure`)  
**Status:** Baseline recorded for **controlled development use**; **NOT a production-release certification**.  
**Next operating mode:** Feature-driven Product Development (not refactor-roadmap-driven implementation).

## 1. Decision and intent

From this checkpoint forward, treat AAB as a **development product baseline**: develop new functionality through bounded feature work, preserve current compatible behaviors, and document the involved responsibilities/components **before implementation**. The documentation must make later architecture change/refactoring safer by preserving the original business intent, interaction topology, data ownership and compatibility impact.

This decision **does not** declare AAB production-ready, authorize R8.1–R8.5 or R7.11, close technical debt, or permit implicit redesign of existing public contracts. R8.0 was proposed/prepared as a planning-only prompt; do not treat its future decisions as approved or executed unless separately evidenced.

## 2. Existing architectural baseline (do not silently change)

- R7.1–R7.10 accepted scoped decisions and R7.5 receipt/ACK/uncertain delivery/retry/lock/quota constraints remain binding.
- R7.6 lifecycle: admission fence, bounded shutdown/deadline and late-mutation ownership remain binding; timeout is not cancellation of an active mutator.
- R7.7 tests: maintain the 55-file manifest, Fast/Integration/Full profiles, original serial backend tests and independent playground testing; Node.js **22.23.5** / npm **10.9.9** was the authoritative tested environment at R7.10.B.
- R7.8–R7.10 exact feature-mode semantics are frozen: CLI env flags enable only on exact `'1'`; top-level `enableTestPeers` controls demo-rule registration; nested `application.enableTestPeers` controls peer gateway/workflow composition and PServer connector eligibility; both mismatched combinations are valid. Direct `createApplication` defaults SQLite enabled if omitted; CLI-resolved/default `startApplication` defaults SQLite disabled. `startApplication` order is `onCreated` → conditional demo rule registration → `listen`. Per-app registry, public handles and `/health` semantics remain unchanged.
- M12/M13 ownership = **TBD**; M14/M15 = **APP**. M02 extraction = **DEFERRED — EQUIVALENCE NOT PROVEN**. Do not infer product ownership from filenames, imports or demos.
- External callers, real deployment/runtime and real PServer behavior remain unverified. TD15–TD17, TD18–TD19 and other still-open debt are **not** automatically closed.
- Local historical R7.10.B verification: backend Full **259/259**, playground **32/32**, serial backend **259/259**, with zero skips. These are **historical evidence** only, not a fresh run or proof of production use.

## 3. Working agreement for each new feature

### 3.1 Before touching implementation

Create one feature document from [`docs/features/FEATURE_IMPACT_AND_RESPONSIBILITY_TEMPLATE.md`](../features/FEATURE_IMPACT_AND_RESPONSIBILITY_TEMPLATE.md), with a stable feature ID and clear title. Minimum required contents:

1. **User-facing outcome / business requirement:** who needs it, why, observable acceptance criteria, non-goals.
2. **As-is behavior and entrypoints:** applicable HTTP, Socket.IO, PServer, generic/peer message flows, CLI/direct programmatic paths; cite actual source paths and contract evidence.
3. **Responsibility map:** affected M01–M18 modules; existing owner vs tentative owner vs TBD, and why. Separate business responsibility from technical adapter.
4. **Interaction/data flow:** source → authentication/validation → routing/dispatch → state changes → output/ACK/error; write sequence steps or a Mermaid diagram.
5. **State and persistence:** data models, database/files, transaction/durability/retention, failure/retry/idempotency/uncertain delivery and restart behavior.
6. **Compatibility impact:** public APIs, event names/payloads, statuses, defaults, flags, startup/shutdown, existing consumers, migration/rollback; identify UNKNOWN explicitly.
7. **Change plan:** specific source/test/docs paths, dependency direction, bounded increments, risks, tests and stop conditions.
8. **Human-readable refactor notes:** observed cross-boundary coupling, responsibilities that could eventually move, decisions deliberately deferred; do not equate discovery with permission to refactor.

### 3.2 During implementation

- Work in narrowly scoped tasks with clearly stated acceptance evidence and no unrelated cleanup.
- Prefer intent-revealing names, small methods and explicit business responsibilities over speculative abstractions.
- Preserve behavior unless a contract change is specifically authorized and versioning/migration requirements are recorded.
- Keep the feature document current when implementation diverges; record **Observed / Verified / Assumed / Unknown / Deferred** separately.
- For test/code changes, run relevant focused tests plus the maintained verification gates appropriate to scope; retain failures and environment limitations, never relabel historical logs as new evidence.
- Document commit SHAs, verification results, residual risks and follow-up work after human review.

### 3.3 Feature completion gate

Feature is **development-accepted**, not necessarily production-ready, only when business acceptance criteria, documented interfaces/data flows, scoped tests, integration smoke test (where applicable), rollback implications, and known limitations are reviewed. Update the feature's status and link its verification report. Production deployment remains a separate release decision.

## 4. Suggested repository structure

```text
docs/
  architecture/
    PRODUCT_DEVELOPMENT_BASELINE_CHECKPOINT.md
  features/
    FEATURE_IMPACT_AND_RESPONSIBILITY_TEMPLATE.md
    FTR-001-<short-feature-slug>.md
prompts/
  <feature-specific-codex-prompts>.md
<feature-specific-verification-report>.md
```

Keep the template reusable; do not copy a previous feature's assumptions as facts. Feature ID naming is a proposed convention, not an existing repository contract.

## 5. Risks and deferred tracks

| Area | Current boundary | Reopen only when |
|---|---|---|
| Production readiness | Development baseline only | Supported OS/Node/storage, security, deployment, backup/recovery and real integration acceptance are defined |
| TD18/TD19 | Runtime/deployment and missing external evidence | Named operator/targets and authorized safe verification exist |
| TD02 | Namespace admission cleanup flaw reproduced; remediation deferred | Supported namespace-scoped terminal lifecycle solution and bounded tests exist |
| TD03/TD10/TD11 | Local reliability evidence; external ACK, dedupe, power loss unproven | Named receiver/deployment contract and acceptance criteria exist |
| TD16 | Feature mode compatibility frozen | Named caller-specific incompatible outcome and migration policy exist |
| TD01/TD17 | External/legacy consumers unknown | Named maintainer, supported distribution channels and actual consumer inventory exist |
| M12/M13 | Business ownership TBD | Accountable product/API owner and downstream operator/receiver can confirm contracts |
| M02 | Extraction deferred | Independent equivalence proof and explicit owner approval exist |

## 6. Handoff for a new conversation / coding agent

> Work from `main` HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7` as the **starting checkpoint**, but **verify current HEAD before editing**. R7.10 is closed. We now operate AAB as a controlled development product and add features one at a time. Before implementing each feature, create and review a document using `docs/features/FEATURE_IMPACT_AND_RESPONSIBILITY_TEMPLATE.md`. Preserve existing accepted behavior, ownership labels and reliability/compatibility contracts. Avoid broad refactor and speculative abstractions. Code/tests may change only within the separately approved feature scope. Codex must not stage, commit or push unless the human explicitly changes this working agreement. Report outcomes, test evidence and remaining unknowns.

## 7. References

- `docs/architecture/PROJECT_STATE.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/TECHNICAL_DEBT.md`
- `docs/architecture/R7_10_FINAL_CLOSURE_DECISION_AND_HANDOFF.md`
- `docs/architecture/R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_MATRIX.md`
- `docs/architecture/R7_10_C_ARCHITECTURE_SCOPE_DECISION_POLICY.md`

**Checkpoint exit condition:** This file is a planning/governance record only. It does not claim any fresh test execution or change the application.
