# R7.7.B — Test Architecture Implementation & Verification

## Mandate and checkpoint

Repository: `vutuantrung/base-aa-backend`  
Branch: `main`  
Expected starting HEAD: `8b31b1af5e38743fa97c364a92a3fcfe8d7434ce` (R7.7.A committed)  
Phase: **R7.7.B — one integrated implementation and verification checkpoint**, with internally sequenced workstreams, not separate micro-task checkpoints.

**Architecture owner approval, authoritative for this task:**

- **D01=A:** explicit, maintained test responsibility manifest; multi-responsibility and `unknown` supported.
- **D02=A+B:** file-local scenario fixtures by default; narrowly shared domain fixtures only where duplication and ownership/lifetime contracts justify extraction. No global/omnibus harness.
- **D03=A:** additive Fast / Integration / Full verification profiles, while preserving `npm test` behavior and its serial backend scope.
- **D04=A+D:** Node **22.23.5** is the baseline verification job; preflight Node/native SQLite compatibility for profiles requiring it. **Do not change** `engines.node >=22`, optional dependency policy or imply Node 24 is universally unsupported.
- **D05=A:** deterministic, bounded event barriers and controlled clocks where possible; real listener, SQLite and process tests remain in integration/full. Report blocked environment separately from failed assertions.
- **D06=A:** responsibility-based advisory source-to-test selection; not a complete dependency or assertion coverage analyzer.
- **D07=A:** incremental breadth-first migration and assertion-preserving verification; no bulk file moves.

Read first, in this order, with targeted source inspection rather than a full-repository reanalysis:

1. `AGENTS.md` if present; actual `git status --short`, branch, HEAD, and existing scripts.
2. `docs/architecture/R7_7_TEST_ARCHITECTURE_POLICY.md` (**approved D01–D07 are as stated above; original document may still say pending**).
3. `R7_7_A_TEST_INVENTORY_RESPONSIBILITY_MAPPING_REPORT.md`.
4. `docs/testing/R7_7_TEST_INVENTORY.json`, `docs/testing/R7_7_RESPONSIBILITY_VERIFICATION_MAP.md`.
5. `docs/architecture/PROJECT_STATE.md`, relevant `MODULE_BOUNDARIES.md` and `TECHNICAL_DEBT.md` entries, plus R7.5/R7.6 policies only where their invariants are affected.

Verify baseline SHA. If HEAD differs, compare the actual diff and report drift; use current code as authority rather than silently assuming this checkpoint is unchanged. Preserve unrelated staged/dirty/untracked work. Do **not** commit or push.

## Primary objectives

Build a human-readable, maintainable test architecture that enables reliable targeted verification by developers and AI agents, without weakening the existing full-test gate or changing application behavior. Deliver one coherent implementation, repeatable commands, and a final evidence-based report.

### B01 — Restore architecture ownership (first mandatory gate)

Current source-derived failure: `src/app/lifecycle-test-seam.ts` exists but is not included in the explicit ownership map in `scripts/check-architecture.ts`; the checker reported 59 source files / 145 resolved edges and failed. The file re-exports internal lifecycle test seams from M02.

- Confirm the current error by running `npm run check:architecture` before editing, **if the error remains**.
- Assign `src/app/lifecycle-test-seam.ts` to **M02** in the existing explicit ownership map, without changing dependency rules, ignoring this file or weakening the checker.
- Run ordinary `npm run check:architecture` against the real index. It must PASS after tracked source is correctly mapped; preserve existing documented *module aggregation SCC warnings* and reject new unexpected runtime file cycles.
- Record baseline and post-fix checker output separately. Do not claim the original architecture checker was green.

### B02 — Maintained responsibility manifest + validation

R7.7.A inventoried **54 test files: 49 backend (250 registered tests) and five playground (32 registered tests)**; these are the baseline to reconcile, not a target to fabricate.

- Implement a small, explicit, maintained manifest (JSON or TypeScript) in a suitable `docs/testing/` or `testing` governance location, based on the R7.7.A inventory. Keep the source R7.7.A inventory as a historical snapshot; if an updated machine-readable view is needed, make the distinction between maintained manifest and generated verification clear.
- For each discovered test file, record at least: canonical path, runner/suite, one-or-more responsibility IDs (`M01`–`M18`, `SG02`, or explicitly `unknown`), layer, named flow/invariant(s) when applicable, requirement flags (listener, native SQLite, filesystem/process, time-sensitive), and selection-profile membership.
- Support multiple owners per cross-cutting test. Preserve `unknown` and M12–M15 classification TBD where evidence does not justify certainty; no invented complete coverage numbers.
- Implement a validator with clear diagnostics and nonzero exit on: missing files, manifest entry without discovered file, duplicate paths, invalid ID/layer/runner/profile, invalid requirement values, or a required selection/profile whose manifest references an absent test. Discovery must cover the actual backend and playground test conventions (`*.test.ts`, `.test.mjs`, `.test.cjs`; if there are additional supported patterns, justify and cover them).
- Validate manifest and test-file lists against actual repository discovery and scripts, not only the hand-authored inventory. Include focused validator tests for duplicate/missing/invalid and a valid baseline.
- Inventory metadata is a **review aid**, not an assertion that all behavior or transitive dependencies are covered. Keep the schema simple, typed/validated, documented and easy to update with a new test file.

### B03 — Additive execution profiles

- Preserve the **existing `npm test` command**, test discovery, serial execution and expected full-backend behavior. Do not silently repurpose it as a fast subset or change test ordering/concurrency without isolation evidence.
- Implement three clear, additive commands (e.g. `test:fast`, `test:integration`, `test:full`), using a small and understandable selection mechanism driven by the validated manifest. Ensure no brittle hidden glob that silently omits a newly added test. A manifest-driven script is acceptable if minimal and testable.
- **FAST**: selected deterministic unit/contract tests plus architecture/typecheck as approved, without requiring listeners, native SQLite or child-process crash execution. Validate requirements of every selected test; if an item is misclassified, correct the manifest or profile, not its assertions. Do not promise a runtime improvement without measuring it.
- **INTEGRATION**: explicitly selected HTTP/Socket.IO, native SQLite, durable record-store and process-crash evidence, and playground where applicable; state exact inclusions, exclusions and prerequisites. Do not mislabel this a substitute for FULL.
- **FULL**: architecture checker, typecheck, build, **all existing backend tests via unchanged `npm test`**, and all playground tests. Fail visibly if any required stage fails or is blocked; do not return success on skipped mandatory checks. Profile semantics should make clear that normal integration/full require a host environment with loopback bind permission, temp filesystem, subprocesses, and SQLite add-on.
- Keep serial execution for shared-state/child-process/listener suites until isolation is demonstrated. Avoid a new heavyweight test framework or unnecessary dependencies.
- Demonstrate that a newly added test file absent from the manifest fails validation rather than being silently omitted.
- Document exact developer commands and which profile to choose. Do not claim profiles provide precise automatic source-impact coverage.

### B04 — Runtime preflight and Node/native SQLite compatibility

- Baseline: **Node v22.23.5** and npm as recorded in R7.7.A (npm 10.9.9 there; check actual rather than hardcoding the npm patch).
- Add an early, comprehensible runtime preflight for profiles needing native SQLite: report Node version, runtime ABI if relevant, installed `better-sqlite3` availability and ability to open/close an in-memory database; do not log secrets or change application DB state.
- Distinguish *baseline job policy* (Node 22.23.5) from *runtime compatibility* (`engines.node >=22` remains). If the baseline verification job is on a different version, fail explicitly with a helpful message or label it an exploratory job, based on its documented mode. Keep fast tests independent of optional SQLite.
- If adding CI configuration is appropriate given this repository currently has no tracked CI workflows, implement one **small** Node 22.23.5 baseline workflow for the approved full gate, with clearly documented host requirements. Do not expand to a Node-major matrix or imply GitHub Actions environment parity unless actually verified. If the CI runner cannot supply necessary permissions/native dependencies, report as blocker rather than adjusting tests to hide it.
- Do not modify `engines`, optional dependency declarations, SQLite business behavior or migration policies.

### B05 — Determinism, fixture isolation and cleanup

Address grounded hotspots only; prefer **small safe extraction** over large reorganizations:

- Prioritize `tests/support/mock-pserver.ts`, which is used by seven tests and exposes a potentially unbounded `arrival` promise, and other directly evidenced unbounded Socket.IO waits. Add a narrow, descriptive bounded-await capability without changing the externally observed sequence or breaking existing fixture consumers.
- Preserve existing PServer register/resume, ACK-gated ingress, authentication, event payloads and receipt identity. Do not synthesize ACKs or change timeout semantics of the production protocol.
- Ensure listener/Socket.IO fixture ownership and cleanup are explicit; use unique temporary roots and restore exact previous `process.env` values in `finally` or hooks. Test helpers should not hide lifecycle errors or leak handles.
- Investigate `application-surface-compatibility.test.ts` random SQLite flag (`Math.random`), and replace nondeterministic branch selection with deterministic coverage **only if it preserves/improves the assertions**; capture the before/after behavior.
- Preserve real process-level R7.5 crash tests and R7.6 live peer-ACK, late-settlement and startup-rollback tests; they must **not** be replaced by mocks to make a profile fast.
- Do not extract every repeated fixture simply for deduplication. New helpers need narrow ownership, lifecycle and cleanup contracts and should not create a cross-suite shared mutable state.
- Any verification change needs semantic review of removed/modified assertions, not just registered test counts.

### B06 — Agent-friendly selection guidance

- Publish a concise, maintained mapping (manifest and/or Markdown) from changed source responsibility or business flow to **primary focused tests**, **companion cross-boundary tests**, and **mandatory full verification before merge**.
- Preserve examples: M02 lifecycle changes → coordinator/lifecycle/startup/peer-ACK tests; M07 HTTP changes → exact auth-first/SQLite-disabled route matrix; M12 F08/F09 changes → workflow/receipt/routing tests; M17 record-store changes → outbox/crash tests; M09 fan-out changes → routing and active sibling settlement.
- Differentiate test location/import from assertion ownership. Selection is advisory; full regression is still necessary for a merge or release absent a separately authorized exception.
- Define a simple workflow for Codex/Copilot: examine the diff → identify responsibilities/invariants → choose focused tests → run relevant integration → run full gate → record evidence and limitations.
- Do not implement a speculative full transitive impact analyzer, automated code modification agent, or generic plugin framework.

### B07 — Preserve invariants and verify incrementally

Maintain these **non-negotiable** contracts from prior phases:

- R7.3 ACK-gated ingress and exact HTTP auth-first, disabled-SQLite, route status/body behavior; R7.4 explicit dispatcher.
- R7.5 P01–P06: atomic receipt+intent, exact original duplicate ACK, stable target/source, bounded proven-unsent retry only, uncertain-no-replay, quarantine/conflict block, no stale-lock auto-break, no dedupe expiry/GC, fixed capacity quotas (5,000 records / 128 MiB per M12/M13 directory; global 10,000/256 MiB), process-wide limit 4, terminal state and projection semantics. C03 transformer side effects remain a documented residual, not silently fixed here.
- R7.6 D01–D06: one-shot lifecycle, unchanged public listen/close, 15s default monotonic shutdown deadline, auth/admission ordering, tracked active/child work, bounded drain, dependency-safe cleanup, writer ownership through late mutation, signal semantics and no unsafe transport invocation after drain cutoff.
- M09 Promise.all fail-fast with active sibling settlement; M16 catalog and M14/M15 behavior unchanged. M12–M15 module classification remains TBD.
- Do not modify production behavior, wire formats, database schema, application dependency contracts, retry policy, release management, or demo architecture. Do not start R7.8.

Implementation sequence: take a test/architecture baseline; fix B01; add B02 validator; add B03/B04 profiles and preflight; make the **smallest proven** B05 fixture/test changes; add B06 guidance; run and record verification. This is a **single checkpoint** with internal commits/rollback units only if instructed (default: **no commit/push**).

## Mandatory validation and evidence

At minimum, execute and record the **exact command, Node version, exit code, case count where available and whether listener/native permissions were granted**:

1. `node --version`, `npm --version`, `git status --short` and HEAD.
2. Before B01: `npm run check:architecture` (record pre-existing failure, if reproducible). After B01 and at end: ordinary `npm run check:architecture` PASS, with checker warnings accurately documented.
3. Manifest validator and its negative-path tests; prove test additions missing from manifest fail closed.
4. `npm run test:fast` and profile selection assertions; validate fast selection has no prohibited listeners/native DB/child requirements.
5. `npm run test:integration` with actual listener/native/child prerequisites, plus manifest selection details.
6. `npm run test:full` (and, as relevant, unchanged `npm test -- --test-concurrency=1` directly to prove backward compatibility).
7. `npm run typecheck`, `npm run build`, `npm test -- --test-concurrency=1`, `npm --prefix testing run test:playground` where not already individually evidenced in full.
8. Dedicated `tests/reliable-outbox.test.ts`, `tests/reliable-crash-process.test.ts`, `tests/application-peer-ack-drain.test.ts`, `tests/application-startup-rollback.test.ts` as applicable to changed fixtures/selection.
9. `git diff --check`; inspect `git diff --stat` and test registration/assertion changes.

Use Node **22.23.5** for authoritative verification. If it is unavailable, **do not switch to Node 24 and describe the result as passing baseline**. Record the blocker. Native SQLite requiring a compiled add-on may differ across Node versions; its failure on one developer Node 24 environment is not proof of universal incompatibility.

If the sandbox refuses local listeners (e.g., `EPERM`), distinguish environmental failure from assertion failure. Seek an authorized local execution path if available. Do not count incomplete/hung tests as PASS or silently remove required tests. Record any 249/250-like failures with failing test name, raw error, environment, retry outcomes; avoid declaring a known flake without reproducibility.

Use measured runtimes, not invented expected speedups. A profile may be slower than intended; show the evidence rather than optimizing by removing coverage.

## Deliverables

1. Validated maintained test manifest and schema/validator, including validator tests and usage instructions.
2. Additive Fast / Integration / Full execution profiles plus documented environment/native SQLite preflight.
3. Bounded and well-owned narrow fixture changes only where evidenced; semantic assertion preservation notes.
4. Maintained responsibility-to-test selection guide for maintainers/AI agents.
5. Updated `docs/architecture/PROJECT_STATE.md`, relevant architecture/test-governance documents, `TECHNICAL_DEBT.md` only where supported by observed results. R7.7 D01–D07 must be marked **approved** in the policy; do not rewrite historical Stage A report as if it were created after approval.
6. Root report **`R7_7_B_TEST_ARCHITECTURE_IMPLEMENTATION_VERIFICATION_REPORT.md`** containing:
   - Actual initial/ending HEAD and dirty-path summary; explicit note that nothing was committed/pushed.
   - D01–D07 approval-to-code/test trace, changed paths, and architectural boundaries.
   - Full manifest counts, unknown/TBD classifications, validated profile memberships and inclusion/exclusion rationale.
   - B01 checker failure and correction evidence, no rule weakening.
   - Baseline/after tests, version and environment preflight, exact failures/blockers and measured durations.
   - Fixtures changed; explicit comparison of assertions, registrations, cleanup, resource ownership, and protocol/ACK semantics.
   - Remaining risks (native SQLite/Node 24 compatibility, listener permissions, local process-crash evidence, stale lock, uncertain no-replay, R7.7-F01 if applicable), with no invented closure.
   - Evidence-based **GO / CONDITIONALLY GO / NO-GO** recommendation for closing R7.7 and progressing to R7.8.

**STOP for reviewer assessment.** Do not commit, push, begin R7.8 or undertake production refactors. If an approved test-architecture objective cannot be met without changing production behavior, document the blocker/decision rather than changing the application without authorization.
