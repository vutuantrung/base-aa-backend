# Codex Prompt — R7.9.A Application Runtime Cleanup: Architecture Discovery

## 0. Authority and execution boundary

- Repository: `vutuantrung/base-aa-backend`
- Branch: `main`
- Expected committed HEAD at authorization: `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9` (`checkpoint R7.8`)
- Verification baseline: Node.js `v22.23.5`, npm `10.9.9` (use actual versions and record differences)
- Phase: **R7.9.A — Architecture Discovery ONLY**
- Prompt path in repository: `prompts/R7_9_A_APPLICATION_RUNTIME_CLEANUP_ARCHITECTURE_DISCOVERY_CODEX_PROMPT.md`

The architecture owner authorizes discovery of application runtime cleanup opportunities, **not production refactoring**. Do not modify source, tests, package manifests, scripts, CI, public exports, HTTP/Socket.IO contracts, runtime configuration, database schemas, persisted data, or behavioral semantics. Do not commit/push. Do not start R7.9.B implementation without a new owner decision. Do not reopen R7.8 decisions on your own.

Read `AGENTS.md` if present. Follow established coding/documentation standards: clear responsibilities, intent-revealing names, and evidence-driven boundaries; no hypothetical architectural abstractions presented as proven improvements.

First, record `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, Node/npm versions. Protect existing staged, unstaged and untracked files. If actual HEAD differs from the expected SHA, inspect the actual source and record the drift; do not reset the branch or assume historical docs are latest.

## 1. Mandatory source of truth

Read and reconcile current versions of:

- `docs/architecture/ARCHITECTURE.md` (R7.9 roadmap: application runtime cleanup, preserve TBD behavior)
- `docs/architecture/PROJECT_STATE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/architecture/TECHNICAL_DEBT.md`
- `docs/architecture/ARCHITECTURE_DECISIONS.md`
- `docs/architecture/APPLICATION_SURFACE_INVENTORY.md`
- `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md`
- `docs/architecture/R7_8_RUNTIME_COMPOSITION_AND_DEPENDENCIES.md`
- `docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md` (status ACCEPTED)
- `R7_8_FINAL_CLOSURE_VERIFICATION_REPORT.md`
- R7.5 reliability policies/reports, R7.6 lifecycle policies/reports, R7.7 test manifest and responsibility verification map.

Historical reports are evidence for their own checkpoint only. Inspect current source/tests for any assertion of current behavior, dependencies or ownership. Do not rewrite history. If `PROJECT_STATE.md` still contains historical pre-commit wording, identify that explicitly and append a clearly scoped current R7.9.A note; do not silently reframe older snapshots.

## 2. Approved invariants — not candidates for silent cleanup

**R7.8 ownership and compatibility**
- ES-D01=A: classify by behavior/contract/ownership, not path or demo label.
- ES-D02=C scoped: **M12 Task Workflow remains formally TBD**; M12 stores, receipts, F08/F09, outbox and ACK behavior must not be moved or reclassified by inference.
- ES-D03=C scoped: **M13 Resource Selection remains formally TBD**, including selection receipt, original ACK and durable delivery.
- ES-D04=A, ES-D05=A: **M14 Generic Session and M15 Process Usage are APP** and their HTTP/SQLite contracts are retained.
- ES-D06=A: keep exact `ENABLE_TEST_PEERS === '1'` and existing programmatic top-level/nested semantics, default CLI PServer, default SQLite differences.
- ES-D07=A: `testing/` is an independent package/process boundary; no app-to-playground static imports or workspace migration by assumption.
- ES-D08=A: incremental compatibility-first work, test ownership, rollback and explicit approvals.
- R7.8.C **C-D01=A** retain bounded `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` runtime import as documented exception; **C-D02=A** preserve implicit registration for direct `startApplication()` callers, including `onCreated` before registration and registration before `listen`; **C-D03=A** preserve app-local `TransformationRegistry`. Do not propose replacing this accepted edge as an unapproved prerequisite to cleanup. Record only a justified future trigger if strong new evidence exists.

**R7.5 P01–P06 and R7.6 D01–D06**
- Preserve receipt-vs-delivery distinction, exact ACK semantics, conservative uncertain state/no unsafe replay, persistence keys/paths/limits, writer lock and lease lifetime, retry/admission bounds, shutdown deadline, startup rollback, tracked work and late settlement. Never infer exactly-once, deployed power-loss durability or external receiver guarantees from local tests.
- Do not alter public `ApplicationInstance`, direct `createApplication()` or `startApplication()` behavior, `onCreated` exception boundary, `/health`, readiness, or process-signal ownership without separately approved contract policy.

**R7.7**
- Preserve manifest/validator, additive Fast/Integration/Full selection, original serial `npm test`, native SQLite preflight, Node 22.23.5 CI baseline, test assertions and independent playground. Existing `unknown` responsibility map rows are retained until separately reviewed.

## 3. Architecture discovery — breadth first, no code changes

Build a **level-one responsibility inventory across all application-runtime areas**, not a deep design of only M02. Then map the following at the same level of detail before choosing candidates:

**RA01 — Runtime entrypoints and modes**: executable `main.ts`, direct `createApplication`/`startApplication` callers, build artifacts, CLI vs programmatic defaults, startup invocation modes, relevant package exports and unknown external consumers.

**RA02 — Composition root and dependencies (M02)**: factories, registry/router, HTTP/socket servers, connector, SQLite/repos, task/selection stores/runners, late-bound sender, admission and shutdown-signal wiring. Identify resource constructors/owners and cleanup order; distinguish application lifetime from process lifetime.

**RA03 — Configuration and feature gates (M01/M02/M05)**: source-to-sink trace for `ENABLE_TEST_PEERS`, both enableTestPeers booleans, PServer config presence, SQLite defaults, shutdown timeout, store paths and exact env parsing. Categorize current compatibility as confirmed, tested, inferred or unknown.

**RA04 — Peer/protocol/messaging runtime (M03–M11)**: named-peer and PServer composition, M09/M10/M11 routing/transformation, event handlers, static runtime vs type-only edges, existing M10↔M12↔M13 module-level aggregation SCC, no file-level runtime SCC. Map any real responsibilities duplicated or placed at wrong owner without assuming they are removable.

**RA05 — Durable workflows and data resources (M12/M13/M17)**: workflow/store/outbox writers, scheduling, process crash/restart, capacity and lease semantics, shutdown/drain participation, data path lifetime. Their **formal ownership remains TBD**; do not equate `demo.*` names with DEMO ownership.

**RA06 — HTTP repositories and shared SQLite (M07/M14–M17)**: app-owned API surface, auth-first/disabled-SQLite behavior, initialization/close order, exported repository handles, dependency lifetimes, data migrations that would be required by proposed cleanup.

**RA07 — Observability/readiness and operational behavior (M18 / TD15)**: `Diagnostics` use, direct console emissions, admission/readiness vs `/health`, failure/cleanup logs, externally visible status. Separate low-risk diagnostic consistency from API/operational contract changes.

**RA08 — Legacy and compatibility debt (TD01/TD17)**: unused MessageBus, utilities/imports, compatibility re-exports, M08 legacy shared barrel and facade types. Confirm with static/usage graphs and consumer inventory; lack of internal callers does not prove safe public deletion.

**RA09 — Test/runtime/build ownership**: R7.7 manifest/responsibility map, static checker, launch/package graphs, test setup and native SQLite/process requirements. Record existing evidence gaps and any regression coverage required before future implementation.

For every area, capture: concrete paths, actual behavior owner, resource owner, caller/dependency direction, public/wire/persistence surface, runtime enablement, tests, observable risks, evidence confidence, and possible cleanup opportunities. Use evidence-based source references in docs. Avoid speculative module creation, mass renaming or generic DI/service locator recommendations.

## 4. Candidate inventory and classification

Create an **opportunity catalog** with IDs `RC-01...`, and fields:

- area and current concrete source location;
- precise problem/evidence, not style-only preference;
- proposal at **responsibility/contract level only** (no class design);
- expected benefit and measurable acceptance criteria;
- change surface and compatibility class (purely internal / additive / requires contract migration / uncertain);
- R7.5/R7.6/R7.7/R7.8 impacted invariant and tests;
- dependencies/prerequisites and explicit stop conditions;
- estimated review size/rollback complexity (qualitative; do not invent timings);
- classification: **SAFE DISCOVERY**, **CANDIDATE FOR LATER OWNER APPROVAL**, **DEFERRED/TBD**, **PROHIBITED UNDER CURRENT APPROVAL**.

Examine TD15, TD16, TD17 and runtime architecture as candidates. **Do not automatically select a TD number for implementation**, close debt, normalize feature flags, relocate M12/M13, remove exports, or change error cleanup semantics. Explicitly record any cleanup idea that conflicts with accepted R7.8.C as NOT authorized.

Prefer breadth-first and smaller future batches with contract-centric review over large dependency inversion refactors. Identify at most 2–3 realistic top candidates for R7.9.B decision review; choosing a candidate does **not** approve implementation.

## 5. Owner decision package (no decisions silently made)

Prepare options, trade-offs, explicit recommendation, affected paths, hard compatibility gates and rollback for at least:

- **RC-D01 — Runtime cleanup objective and boundary**: narrow internal responsibility cleanup vs feature/config redesign vs broad rewrite.
- **RC-D02 — M02 lifecycle/composition refactor sequencing**: bounded, owner-by-owner extraction vs batch restructuring vs preserve unchanged pending external caller evidence.
- **RC-D03 — Feature gate policy**: preserve existing gate and record debt vs additive capability facade with compatibility plan vs breaking replacement. No change to ES-D06 without an explicit later superseding owner approval.
- **RC-D04 — Observability/diagnostics scope**: narrow internal M18 consistency vs externally visible readiness/health semantics vs defer.
- **RC-D05 — Legacy exports/unused utility cleanup**: retain until caller inventory vs opt-in deprecation mapping vs delete (needs owner approval).
- **RC-D06 — M12/M13 and persistence ownership constraint**: preserve TBD/no move vs separately scoped product-ownership investigation vs premature reclassification.
- **RC-D07 — Safety gates and checkpoint partitioning**: minimal production behavior parity matrix, fast/integration/full gates, real-process/crash/rollback checks, and stop criteria.

These are **proposed decision questions**, not owner-approved choices. Recommend defaults only with explicit source-backed rationale and mark all decisions `PENDING OWNER APPROVAL`. Do not create a new generic R7.9 implementation plan if evidence does not support a change.

## 6. Verification evidence — discovery phase

Run under Node v22.23.5 where available and record exact commands, exit codes, counts, environment limitations:

1. `git status --short`; `git diff --check`; `git diff --cached --check` (distinguish preexisting defects from new ones).
2. `npm run check:architecture`.
3. `npm run test:manifest`.
4. `npm run typecheck`.
5. `npm run build` (ensure no tracked artifacts changed).
6. `npm run test:full` (record backend/playground separately; prior R7.8 report listed 255/32; rerun, do not merely copy counts).
7. Optional read-only source/static dependency inspection and focused tests where needed to substantiate a risky candidate.

Do not claim success if an environment/tool is blocked. No production change means runtime parity is inherited from baseline, not newly proven against a refactor. A reviewer must be able to reproduce every claimed test. Never run external PServer or deployment peers without explicit user instruction.

## 7. Deliverables and repository placement

All **Codex prompts** must be placed in `prompts/` only; never `docs/architecture/` or the repository root.

Create the following **docs-only artifacts**:

1. `docs/architecture/R7_9_A_RUNTIME_RESPONSIBILITY_INVENTORY.md` — RA01–RA09 breadth-first current runtime map, dependency/resource ownership, contracts and grounded gaps.
2. `docs/architecture/R7_9_A_RUNTIME_CLEANUP_OPPORTUNITY_CATALOG.md` — RC candidate inventory and bounded recommended priorities.
3. `docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md` — RC-D01–RC-D07 option matrices with explicit PENDING approval, recommendations and invariant gates.
4. `R7_9_A_APPLICATION_RUNTIME_CLEANUP_ARCHITECTURE_DISCOVERY_REPORT.md` — starting/final git state, actual HEAD, file delta, source references, verification command outputs, risk/limitations, reviewer recommendation (`GO for owner decision review` / `CONDITIONAL GO` / `NO-GO`), no implementation authorization.
5. A short, clearly labeled current R7.9.A discovery note in `docs/architecture/PROJECT_STATE.md`. Preserve historic R7.8 reports, accepted ADR and decision records. Update TD registry **only if new verified evidence warrants**, and keep existing debts OPEN otherwise.

Do not change current `MODULE_BOUNDARIES.md` classifications during discovery. If source evidence conflicts with a classification, document the conflict for the owner, do not unilaterally amend ownership.

## 8. Stop and handoff

Stop after writing documentation and executing verification. Explicitly request owner approval for RC-D01–RC-D07 (or only those that evidence supports) before any implementation. Do not implement candidates, begin R7.9.B, change public contracts, re-open the accepted R7.8 exception, commit/push, or modify unrelated work.

The outcome may legitimately be **NO-GO for some runtime cleanup options** if safe compatibility evidence is absent. Report that limitation plainly.
