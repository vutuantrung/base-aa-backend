# R7.8.C — Demo Registration Composition Ownership ADR

## Codex checkpoint: architecture decision only

Repository: `vutuantrung/base-aa-backend`  
Branch: `main`  
Expected committed HEAD: `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`  
Authoritative test runtime: Node.js `v22.23.5`  
Scope: **one ADR/discovery checkpoint**, no implementation, commits or pushes; no R7.9.

### 0. Baseline and worktree safety

Read `AGENTS.md` if present, `docs/architecture/{PROJECT_STATE,MODULE_BOUNDARIES,TECHNICAL_DEBT,R7_8_DEMO_EXTRACTION_DECISION_POLICY}.md`, the R7.8.A and R7.8.B reports, and R7.5–R7.7 approved policies. Confirm `git branch --show-current`, `git rev-parse HEAD`, `git status --short` and Node version. The R7.8.A/B documents and tests may currently be staged or untracked. **Preserve all pre-existing work; do not reset, stage, unstage or overwrite unrelated files.** Note actual prompt paths rather than assuming every prompt is in `prompts/`. Reconcile any HEAD discrepancy against actual source before proceeding.

### 1. Exact architectural question

R7.8.B intentionally deferred removal of the direct import `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts`. Determine **who must own demo rule registration** and whether every direct `startApplication()` caller must retain the existing implicit registration behavior. Do not conflate removal of a static import with removal of runtime coupling. A documented compatibility exception is an acceptable architectural decision.

Inspect `src/main.ts`, `src/app/lifecycle.ts`, `src/app/create-app.ts`, `src/config/configuration.ts`, `src/examples/pserver-to-aaui.ts`, transformation registry, gateway composition and focused tests. Characterize the actual order:

```
startApplication(config, diagnostics, onCreated)
  -> createApplication(config.application)
  -> onCreated(application)
  -> if (config.enableTestPeers) registerPServerToAauiDemo(application.transformations)
  -> application.listen(config.port)
```

Verify source evidence for each of these **distinct** contracts:
- `onCreated` observes the application before the demo rule is registered; `listen` observes it afterward.
- Top-level `ResolvedConfiguration.enableTestPeers` determines demo registration; nested `application.enableTestPeers` controls named-peer gateway and M12/M13 initialization. Direct callers may pass mismatched flags.
- CLI `ENABLE_TEST_PEERS === '1'` sets both flags and a default PServer configuration, while direct programmatic callers can omit PServer. CLI SQLite and programmatic SQLite defaults differ.
- Direct `createApplication()` does not register the demo rule; direct `startApplication()` can.
- Demo rule ID, priority, from/to/type, exact transform output and malformed-input error; rule ordering, ACK and processedBy behavior.
- Public signature/exports, startup/rollback/shutdown and build output.

Treat these as hypotheses to confirm against the current checkout, not instructions to rewrite source if discrepancies emerge. Record exact source/test paths and evidence.

### 2. ADR C-D01: composition owner — compare alternatives

Evaluate at least these mutually distinguishable models, documenting exact import graph, caller behavior, ordering, configuration semantics, packaging, rollback, maintenance burden and migration cost:

**A. Retain documented compatibility exception.** Keep application lifecycle's static import and automatic registration. Make coupling/ownership explicit and bound the exception.

**B. Outer executable composition.** Move demo registration to `main.ts`/executable wiring. Explain whether direct `startApplication()` calls silently lose the rule (which is **not** compatible) and whether a legacy wrapper or revised API would be needed.

**C. Narrow internal compatibility provider/adapter.** Preserve direct public `startApplication()` behavior with a type-safe seam; prove it genuinely improves dependency direction rather than hiding the same APP→demo runtime reference. No global hooks, service locator, implicit mutable registry or broad DI framework.

**D. Versioned startup contract change.** Explicit new contract, external caller inventory, migration and rollback. Such a breaking change is **not approved** for the present phase.

A proposed option is **ineligible for behavior-preserving extraction** if it changes direct `startApplication()`, `onCreated` order, top-level/nested gate behavior or example rule semantics. Do not claim equivalence without a concrete proof/testing plan. Recommend one option, state trade-offs and whether extraction is necessary at all.

### 3. ADR C-D02 and C-D03: independent owner choices

**C-D02 — Direct `startApplication()` compatibility**
- A: preserve implicit registration for all existing direct callers;
- B: retain a legacy facade and introduce explicit opt-in startup API; requires separate authorization and evidence;
- C: authorize later versioned breaking change only after caller inventory.

**C-D03 — Rule state and lifetime**
- A: app-local transformation registry; exact existing registration timing and isolation;
- B: separate explicitly composed demo runtime/plugin only with justified independent consumers, without APP→demo dependency;
- C: global/ambient registration (normally reject).

Do not preselect D02/D03 just to force a prettier dependency graph. Provide option IDs and an owner-decision checklist.

### 4. Compatibility evidence matrix and tests

Build a source- and test-grounded matrix of **observed, verified, inferred and unverified** cases:
- CLI `ENABLE_TEST_PEERS` absent, `'0'`, `'1'` and other values.
- Programmatic top-level/nested combinations false/false, false/true, true/false, true/true.
- Nested gateway with/without supplied PServer config; CLI default config.
- Direct `createApplication()` versus direct `startApplication()` versus CLI startup.
- `onCreated` visibility, pre-listen registration and failure/rollback ordering.
- Rule match/nonmatch, invalid originalParam, priority, ID, wire ACK identity.
- Built artifact/import reachability, AAB→`testing/` dependency prohibition.
- Preservation of M12/M13 persistent stores and workflows and M14/M15 SQLite/HTTP composition.

Separate tests already present in R7.8.B from gaps. Propose *minimal* regression/proof tests needed to implement an approved model; **do not edit or add tests in this ADR checkpoint**. Include a before/after comparison and rollback plan for every eligible option.

### 5. Hard boundaries

Owner-approved R7.8 ES-D01=A; ES-D02=C scoped **M12 remains TBD**; ES-D03=C scoped **M13 remains TBD**; ES-D04=A (**M14 APP**); ES-D05=A (**M15 APP**); ES-D06=A preserve exact feature gate; ES-D07=A independent `testing/` package; ES-D08=A incremental checkpoints.

Preserve R7.5 P01–P06 receipt/ACK/uncertain-no-replay/writer lock/quarantine/quotas; R7.6 D01–D06 lifecycle cutoff, default 15-second bounded deadline, startup rollback, late settlement/leases; R7.7 manifest, additive profiles and serial `npm test`. No API, runtime, source, data, feature-gate, module-movement or package changes. No speculative fixes to open unrelated technical debts. Never claim power-loss or external-peer guarantees from local tests.

### 6. Deliverables (docs only)

1. `docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md`: PROPOSED / PENDING OWNER APPROVAL; clear C-D01 A–D, C-D02 A–C, C-D03 A–C options, concrete recommendation, dependency/timing matrix, compatibility and migration/rollback constraints.
2. `docs/architecture/R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md`: source and existing-test evidence for all scenarios above; observed vs hypothetical distinctions; proposed before/after tests and acceptance gates.
3. `R7_8_C_DEMO_REGISTRATION_COMPOSITION_OWNERSHIP_REPORT.md`: actual HEAD/worktree, evaluated candidates, unresolved consumer questions, exact changed paths, verification and explicit GO/CONDITIONAL GO/NO-GO recommendation for a **separately approved** implementation.
4. Add a concise current progress note in `docs/architecture/PROJECT_STATE.md`, preserving historical snapshots.
5. Update TD16 only if new concrete evidence changes its characterization; keep OPEN unless demonstrated otherwise. Do not reverse approved M14/M15 APP or M12/M13 TBD classifications.

### 7. Verification and stop

Run using Node 22.23.5 where possible: `npm run check:architecture`, `npm run test:manifest`, `npm run typecheck`, `npm run build`, `npm run test:full`, `git diff --check`; note exact counts, exit codes, host/sandbox restrictions, baseline and dirty worktree. Prior R7.8.B report showed 255 backend + 32 playground tests: treat these as historical evidence, not assumed live results. Differentiate BLOCKED from PASS. No filtered full-test run may be called complete.

**Stop after publishing ADR and evidence package. Do not choose C-D01–D03 on behalf of the owner, refactor production, commit/push, or begin R7.9.**
