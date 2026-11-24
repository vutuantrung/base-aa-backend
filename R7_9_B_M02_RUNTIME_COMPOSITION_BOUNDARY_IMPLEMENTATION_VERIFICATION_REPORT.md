# R7.9.B — M02 Runtime Composition Boundary Implementation & Verification

## Checkpoint outcome

- Repository `vutuantrung/base-aa-backend`, branch `main`; committed baseline and final HEAD `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`.
- **NO production extraction.** Decision: **DEFERRED — EQUIVALENCE NOT PROVEN.** The mandated construction/startup/close/rollback characterization found resource acquisition ownership and failure timing too interleaved to move safely with the available fault injection. This is an intentional successful R7.9.B outcome under scoped RC-D02=A.
- Source files, tests, exports, imports, package scripts, manifest, profiles and runtime behavior are unchanged. No source/test delta, no new test files, no manifest/profile changes, and no production rollback was needed.
- Pre-existing R7.9.A work is retained: modified `docs/architecture/PROJECT_STATE.md`; untracked R7.9.A discovery report, responsibility inventory, opportunity catalog, decision policy, and discovery prompt. The supplied B prompt remains unmodified. No staged changes at entry; no staging, commit, or push performed.
- Node `v22.23.5`, npm `10.9.9` were selected explicitly from `/home/parker/.nvm/versions/node/v22.23.5/bin`.

## Approved decisions applied

- RC-D01=A: scope limited to narrow internal responsibility only.
- RC-D02=A, scoped: characterize first and extract at most one private seam only with proven acquisition, rollback, exception, cleanup, and timing parity. No candidate passed, so production extraction was deferred.
- RC-D03=A: exact feature gates and defaults retained; no redesign.
- RC-D04=C: logging, diagnostics, health and readiness changes deferred.
- RC-D05=A: legacy exports/utilities and concrete public handles retained.
- RC-D06=A: M12/M13 remain formally TBD; M14/M15 remain APP; no durable ownership movement.
- RC-D07=A: focused and full gates executed. R7.5–R7.8 invariants, accepted R7.8.C lifecycle-to-example compatibility edge, direct-start registration, app-local registry, and callback/registration/listen order remain intact.

Approval was recorded in [R7.9.A decision policy](docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md). No historic discovery report was rewritten.

## Failure boundary result

The full case inventory is [R7.9.B failure-boundary parity matrix](docs/architecture/R7_9_B_M02_FAILURE_BOUNDARY_PARITY_MATRIX.md). Key source evidence:

- `createApplication` validates timeout before acquisition, opens persistence before its construction `try`, and assigns socket/PServer acquisition markers only after each constructor returns. Construction rollback has sync connector close, fire-and-forget socket close, then persistence close; only persistence close errors combine with the primary exception.
- Startup order remains peer runner start → HTTP bind → readiness → peer activation → PServer connect → running. Startup failure drains, waits under a bounded deadline, closes peer gateway, then calls shared cleanup.
- Normal cleanup order remains PServer → peer gateway → sockets → HTTP listener → persistence, attempting each step and aggregating errors. Normal close and startup rollback intentionally have different sequences. Close promises, failed-start timeout propagation, late settle handling and one monotonic deadline are unchanged.
- `onCreated` and demo registration remain outside `startApplication`'s listen-specific try/catch. Their failure cleanup behavior remains a gap, not a behavior change proposal.
- Existing tests cover representative port conflict, startup interruption, lifecycle idempotence, drain, timeout, gates, direct callers, SQLite APIs, and durable process-crash paths. Constructor failures and individual cleanup throws are not injectable/proven throughout. No equivalence was inferred for these gaps.

Candidate and rationale are recorded in [private seam decision](docs/architecture/R7_9_B_M02_PRIVATE_SEAM_DECISION.md). The acquisition/cleanup grouping would relocate mutable closure state and couple distinct cleanup paths; extracted validation/startup/cleanup helpers were rejected as non-ownership moves or behavior-sensitive consolidations. Public `ApplicationInstance`, overloads, helpers, lifecycle APIs, events and source graph did not change.

## Verification

All reported checks used Node `v22.23.5` / npm `10.9.9`.

| Command / gate | Result |
|---|---|
| `npm run check:architecture` | PASS, exit 0; 59 files, 145 edges (65 runtime/80 type-only), 0 runtime file SCC; existing M10↔M12↔M13 module SCC retained |
| `npm run test:manifest` | PASS, exit 0; 55/55 files; Fast 11, Integration 16, Full 55 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0 |
| Focused `node --import tsx tests/application-lifecycle.test.ts` | PASS, exit 0; 7/7, 0 skipped |
| `npm run test:fast` | PASS, exit 0; 88/88 backend tests, 11 selected files, 0 skips |
| `npm run test:integration` | PASS, exit 0; SQLite preflight passed (ABI 127); 11 backend files and 5 playground files selected; playground 32/32, 0 skips |
| First `npm run test:full` | FAIL, exit 1; backend 254/255, 1 failure, 0 skips; profile stopped before playground. Test identity was not captured in the streamed output. |
| `npm test -- --test-concurrency=1` rerun | PASS, exit 0; unchanged command resolved to `node --import tsx --test --test-concurrency=1 tests/*.test.ts --test-concurrency=1`; 255/255, 0 skips |
| Second `npm run test:full` | PASS, exit 0; native SQLite, architecture, typecheck/build passed; backend 255/255 and playground 32/32; 50 backend and 5 playground files selected, 0 skips |
| `git diff --check`; `git diff --cached --check` | Recorded at checkpoint close below |

One initial ad-hoc multi-file `node --test` invocation failed to load three files as suites; it was not used as evidence. The required standalone lifecycle test, serial scripts, and full profile succeeded. The first 254/255 full result remains disclosed as an unexplained intermittent failure; successful reruns do not erase it.

The full run establishes local test contracts only. It does not establish power-loss/deployed filesystem behavior, remote peer delivery, receiver deduplication, or exactly-once effects. No external production services were contacted.

## Files and final audit

Added:

- `docs/architecture/R7_9_B_M02_FAILURE_BOUNDARY_PARITY_MATRIX.md`
- `docs/architecture/R7_9_B_M02_PRIVATE_SEAM_DECISION.md`
- `R7_9_B_M02_RUNTIME_COMPOSITION_BOUNDARY_IMPLEMENTATION_VERIFICATION_REPORT.md`

Updated:

- `docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md` — records owner approval and scoped D02 gate.
- `docs/architecture/PROJECT_STATE.md` — adds current B outcome and links.

`TECHNICAL_DEBT.md` was not changed; no debt was resolved, and TD16 and other open items remain open. Source HEAD remains the expected baseline; changes are documentation only. The final dirty paths and diff checks are recorded after the report in project state and confirmed at checkpoint exit.

## Owner review

**CONDITIONAL GO for architecture-owner review:** the checkpoint completed with trustworthy characterization, full verification, and a documented justified no-extraction decision. The deferred seam is not an implementation defect; equivalence is not proven for the candidate boundaries. **R7.9.C and later checkpoints are not authorized.** Stop here for architecture owner review. No commit or push.
