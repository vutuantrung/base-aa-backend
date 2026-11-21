# R7.3.B — Compatibility Consolidation & Verification

## Baseline and changed scope

- Branch `main`; committed R7.3.A base `8044bfe60735d3fe13ab9dadac51c94a833e24d7` (`updated 11212123`), verified at task start. R7.3.A report, five test files, TD05–TD08/checkpoint updates, and prompt are tracked in that commit. Initial working tree was clean.
- Current B work is local and uncommitted. No production code, wire/API schema, ACK contract, dependency, SQLite schema or catalog data changed. No commit/push.
- Approved decisions: **D01=A, D02=A, D03=A, D04=A**. The decisions preserve characterized behavior; they do not claim it is ideal or verify unknown external consumers.

## Decisions and evidence trace

| Decision | Approved compatibility invariant | Regression evidence |
|---|---|---|
| **R7.3-D01 / TD05 — A** | M05 and M04 processing stays ACK-callback-gated. Preserve M04 pre-ready return and ready-path logging differences; no fire-and-forget, synthetic ACK, retry or implicit reject. | M05 local Socket.IO loopback in `peer-connections.test.ts`; M04 fake transport tests in `pserver-protocol.test.ts`, including no callback before readiness (no log/gateway) and after readiness (receive log, no gateway). |
| **R7.3-D02 / TD06 — A** | Keep mutable registered rule references, resolve-once sequential execution, current matching/order/cloning/output checks; blank output version and null data remain accepted. | `transformation-executor.test.ts` mutation, matching, ordering, clone, output and unregister cases; `peer-message-service.test.ts` metadata-preservation tests. |
| **R7.3-D03 / TD07 — A** | Keep per-route status/body differences, auth before disabled-SQLite gate, and exact `/extension` path handling. No normalization. | `session-http-api.test.ts`, `process-usage-http-api.test.ts`, `http-gateway.test.ts`, `aa-catalog-boundary.test.ts`; test coverage and source-inferred combinations are separated in [baseline](docs/architecture/R7_3_COMPATIBILITY_BASELINE.md). New assertion checks `/api/extension` 404 HTML content type/message without pinning framework-specific HTML bytes. |
| **R7.3-D04 / TD08 — A** | Keep strict HTTP validation/unknown-key stripping and direct repository permissiveness as accepted by SQLite, including current immediate response spread behavior. | `process-usage-http-api.test.ts` verifies caller `id` is stripped; `process-usage-repository.test.ts` verifies negative PID/fractional memory and immediate ID 900 versus stored ID 1. |

R5-D05 (Explicit Handler Composition), R5-D06 (Separate Semantics) and R5-D08 (Preserve Existing Contracts) remain the compatibility constraints. R7.3 does not reinterpret them or rewrite historical records.

## Consolidated contract and residual risks

- New [R7.3 compatibility baseline](docs/architecture/R7_3_COMPATIBILITY_BASELINE.md) records producer/consumer boundaries, tested versus source-inferred HTTP combinations, M05/M04 no-ACK distinctions, M11 mutation/output rules, M15 direct/HTTP differences, repository-known callers and unknown external consumers.
- TD05–TD08 remain recorded debt/risk, **not fixed defects**. Approved policy is current-behavior preservation. Real PServer integration and external peer emitter behavior were not tested. External HTTP clients, transformer authors/payload corpus and direct M15 repository consumers are unknown.
- TD07 unmounted route HTML is not pinned byte-for-byte; current status and key default response text are asserted. Source combinations not individually tested remain marked inferred.
- TD08 HTTP strips `id`; demonstrated immediate/stored mismatch is limited to direct runtime repository calls. No schema migration or return-shape correction is included.
- TD12 catalog JSON/ID/orphan and migration work is deferred to **R7.5**. No catalog-data migration was done. The existing TD12 registry entry was left untouched because this checkpoint updates TD05–TD08 only.
- Architecture graph remains unchanged: 52 files, 113 resolved edges, zero file runtime SCCs; M10↔M12↔M13 module runtime SCC remains reported for review.

## Verification — Node 22.23.5

- `node --version`: **exit 0, v22.23.5**.
- Focused command from the B prompt (8 files): **exit 0, 50/50 passed**. It ran local Socket.IO/HTTP tests, fake PServer transport, in-memory SQLite and deterministic transformation tests. No external PServer or production service was contacted.
- `npm run check:architecture`: **exit 0**, rules pass; 52 files / 113 edges (51 runtime, 62 type-only), 0 runtime file SCCs; existing module SCCs are reported.
- `npm run typecheck`: **exit 0**.
- `npm run build`: **exit 0**.
- `npm test -- --test-concurrency=1`: **exit 0, 180/180 passed**.
- `npm --prefix testing run test:playground`: **exit 0, 32/32 passed**.
- `git diff --check`: **exit 0** after final edits. `git status --short`: **exit 0**; it lists the two existing test files modified here, three architecture documents modified here, and the two new report/baseline documents. The tracked task prompt remains unchanged. No unrun check is reported as passing.

## Closure and stop

**Recommendation: CLOSED for R7.3 compatibility consolidation only.** The approved decisions are recorded and directly traced to tests; the stable matrix distinguishes observed outcomes from inference. This does not close TD05–TD08 as behavior defects or certify external compatibility. Those risks remain documented for any future change to require new approval and consumer/migration review.

Stop for reviewer approval. R7.4 has not started. No commit/push.

## Changed paths

- `docs/architecture/ARCHITECTURE_DECISIONS.md` — add approved R7.3 decisions without rewriting prior ADR summaries.
- `docs/architecture/R7_3_COMPATIBILITY_BASELINE.md` — new contract matrix.
- `docs/architecture/TECHNICAL_DEBT.md` — TD05–TD08 only.
- `docs/architecture/PROJECT_STATE.md`.
- `tests/pserver-protocol.test.ts` and `tests/aa-catalog-boundary.test.ts` — add assertions to existing cases; no new test declarations.
- `R7_3_B_COMPATIBILITY_CONSOLIDATION_VERIFICATION_REPORT.md`.
