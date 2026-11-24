# R7.9.A — Runtime Cleanup Decision Policy

**Status: OWNER APPROVED for RC-D01–RC-D07.** Approval applies to the options listed below and is operationalized by the R7.9.B prompt. RC-D02=A is scoped by a mandatory failure-boundary characterization and equivalence gate; if one private seam cannot preserve acquisition, rollback, exception, cleanup and timing behavior, defer production extraction. RC-D04=C defers diagnostics changes. All choices preserve the accepted R7.8 boundary unless explicitly superseded by a separate decision.

## RC-D01 — Runtime cleanup objective and boundary

| Option | Scope | Trade-off |
|---|---|---|
| A — Narrow internal responsibility cleanup (recommended) | One bounded owner seam at a time; preserve behavior, public surface and deployment modes. | Small reviewable rollback; does not address feature design or unknown consumers. |
| B — Feature/config redesign | Rename/split gates and defaults, potentially add capabilities. | Could clarify intent but changes caller/runtime compatibility and conflicts with ES-D06 absent superseding approval. |
| C — Broad runtime rewrite | Recompose gateways, storage, lifecycle and diagnostics together. | Large behavior attribution and rollback burden; no evidence supports this scope. |

**Approved: A.** Source shows bounded opportunities; unknown external consumers remain a compatibility constraint.

## RC-D02 — M02 lifecycle/composition sequencing

| Option | Scope | Trade-off |
|---|---|---|
| A — Bounded owner-by-owner extraction (recommended) | Characterize construction/start/close/failure seams, then extract one private responsibility at a time. | Preserves auditability; requires rigorous acquisition and exception-order tests. |
| B — Batch restructuring | Reorganize factory, lifecycle and gateways together. | May simplify topology but obscures parity and rollback. |
| C — Preserve unchanged pending external caller evidence | No source split until caller inventory is improved. | Lowest immediate risk; leaves composition concentrated. |

**Approved: A, scoped by failure-boundary characterization and parity.** A candidate that cannot prove callback/registration behavior, API compatibility, acquisition, rollback, exception, cleanup and timing parity must be deferred. Affected paths: `src/app/*`, `src/main.ts`, possibly gateway construction. Hard gates: retain direct `createApplication`/`startApplication`, returned shape, callback timing, registration order/exception boundary, startup rollback, close deadline and signals. Roll back one private extraction at a time.

## RC-D03 — Feature gate policy

| Option | Scope | Trade-off |
|---|---|---|
| A — Preserve gate and record debt (recommended) | Exact env `'1'`, top/nested booleans, CLI PServer/SQLite defaults retained. | Compatibility-safe; name remains broader than effects. |
| B — Additive capability facade | New opt-in capability mapping while legacy inputs preserve old semantics. | Potentially clearer but duplicates policy and requires migration/caller evidence. |
| C — Breaking replacement | Remove/replace current gate. | Not compatible with ES-D06 and direct programmatic use absent a superseding decision. |

**Approved: A.** No choice here supersedes ES-D06; B/C require explicit later owner approval. Affected paths: M01/M02/M05/M03 composition and configuration tests. Gates: full flag/default matrix and no change to peer gateway, demo rule, PServer, M12/M13 or SQLite.

## RC-D04 — Observability/diagnostics scope

| Option | Scope | Trade-off |
|---|---|---|
| A — Narrow internal M18 consistency (recommended) | Inventory safe fields and route selected internal diagnostics through M18 without altering events. | Improves consistency; logs can still be operationally consumed. |
| B — Change health/readiness semantics | Expose aggregate readiness or revise `/health`. | Client/operations contract migration, explicitly outside current scope. |
| C — Defer | No changes before operator requirements and redaction rules. | Safest where consumers/requirements unknown; leaves inconsistency. |

**Approved: C.** Defer diagnostics changes until logging consumers and redaction requirements are known. Never infer that `/health` means readiness. Affected paths: diagnostics, direct console sites, lifecycle tests if later approved.

## RC-D05 — Legacy exports and unused utilities

| Option | Scope | Trade-off |
|---|---|---|
| A — Retain until consumer inventory (recommended) | Keep MessageBus, utilities, facade exports and concrete app handles. | Avoids breaking unknown embedders; leaves possible dead code. |
| B — Opt-in deprecation mapping | Deprecate named exports with documented migration and support window. | Provides path but requires actual package/deployment consumer map. |
| C — Delete candidates | Remove symbols based on current local usage. | Unsafe inference from no internal references; compatibility break. |

**Approved: A.** Paths include `shared/transport`, facade reexports, utilities and app surface. Preserve architecture checker exceptions and README integrations. Roll back by restoring aliases.

## RC-D06 — M12/M13 and persistence ownership

| Option | Scope | Trade-off |
|---|---|---|
| A — Preserve TBD/no move (recommended) | Keep current workflow/store/outbox/runtime composition and classifications. | Preserves accepted R7.8 and R7.5/6 behavior; leaves ownership question open. |
| B — Separate product-ownership investigation | Gather product/API caller evidence without modifying code/classification. | May resolve future boundary with explicit evidence; does not authorize behavior change. |
| C — Reclassify or relocate now | Treat demo labels/paths as ownership proof. | Contradicts ES-D02/03 scoped approvals and risks durable/API contracts. |

**Approved: A.** B can be a separately authorized discovery task. C is not eligible absent new superseding approval and migration plan. Preserve paths, schema, receipts, ACKs, outbox and lock semantics.

## RC-D07 — Safety gates and checkpoint partitioning

| Option | Scope | Trade-off |
|---|---|---|
| A — Minimal parity matrix then bounded full gates (recommended) | For each future batch: public/runtime mode matrix, failure/cleanup boundary, focused tests, architecture/manifest/typecheck/build, backend + playground full, diff check. Add process/crash checks when lifecycle/durable code is touched. | Evidence proportional to change while keeping full merge gate; requires explicit stop criteria. |
| B — Fast tests only | Use selected profile as completion gate. | Does not protect cross-layer lifecycle, SQLite, playground or crash behavior. |
| C — Rewrite tests with implementation | Simplifies migration but risks losing assertions and R7.7 selection compatibility. | Not acceptable without separate test-architecture approval. |

**Approved: A.** Preserve serial `npm test`, test manifest and profiles; Node 22.23.5 baseline; native SQLite, local listener and child-process requirements. Stop on removed/changed assertions, unknown runtime consumer, behavior drift, lost writer lease/late settlement, or unexplained verification failure. Roll back only the current batch, rerun prior full gates.

## Cross-decision hard gates

- Do not change production contracts, feature gates, `/health`, signal ownership, exception boundaries or runtime behavior under discovery authorization.
- Preserve C-D01=A/C-D02=A/C-D03=A: lifecycle-to-example edge, implicit registration and per-app registry. Reconsider only with strong evidence plus superseding owner decision.
- M12/M13 remain TBD; M14/M15 remain APP. No persistence path/schema/ACK/delivery move.
- Preserve R7.5 P01–P06, R7.6 D01–D06, R7.7 manifest/validator/profiles/serial `npm test` and independent playground.
- At each later checkpoint identify source baseline, dirty paths, actual tests/counts, changed assertions and rollback; do not claim deployment/power-loss/external-peer proof from local suites.

## Approval record

| Decision | State | Owner selection |
|---|---|---|
| RC-D01 | OWNER APPROVED | A — narrow internal responsibility cleanup only |
| RC-D02 | OWNER APPROVED, SCOPED | A — characterize first; at most one private seam only with exact parity; otherwise defer extraction |
| RC-D03 | OWNER APPROVED | A — preserve exact gates and defaults |
| RC-D04 | OWNER APPROVED | C — defer logging/diagnostics changes |
| RC-D05 | OWNER APPROVED | A — retain legacy exports, utilities and concrete handles |
| RC-D06 | OWNER APPROVED | A — M12/M13 remain TBD; M14/M15 remain APP |
| RC-D07 | OWNER APPROVED | A — focused evidence and full verification gates |
