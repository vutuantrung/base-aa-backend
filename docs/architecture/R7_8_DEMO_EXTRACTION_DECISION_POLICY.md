# R7.8 Demo Extraction — Owner Decision and Implementation Record

**Status: ES-D01–D08 APPROVED for scoped R7.8.B implementation.** This record preserves the discovery rationale and approval scope; it does not authorize moving M12/M13, changing flags, public APIs, packages or runtime behavior.

This package uses current source HEAD `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`, the [boundary inventory](R7_8_DEMO_BOUNDARY_INVENTORY.md), and [runtime composition trace](R7_8_RUNTIME_COMPOSITION_AND_DEPENDENCIES.md). R7.5 P01–P06, R7.6 D01–D06 and R7.7 verification policy remain binding regardless of classification.

## ES-D01 — Classification rule: behavior owner versus file location

**Question:** What evidence makes a capability APP-owned, DEMO-only, SHARED, mixed or TBD?

| Option | Meaning / tradeoff |
|---|---|
| A | Classify by behavior and supported runtime contract. APP means deployed AAB capability/contract; DEMO means simulator, sample UI, or example-only behavior; SHARED only for neutral contracts/helpers with independent consumers. Easy to audit and avoids path/name assumptions, but requires evidence of exposed behavior and lifecycle ownership. |
| B | Classify by current location or `demo.*`/`test*` name. Low effort, but source location and payload labels do not establish business ownership; likely to misclassify M12/M13 and their reliability state. |
| C | Keep broad mixed ownership as the default until extraction makes the distinction. Avoids premature choices, but provides little guidance for future changes and can leave composition coupling unreviewed. |

**Discovery recommendation:** A. Use B only as search evidence and retain TBD where the behavior contract or external caller set is unresolved.

- **Affected paths:** `docs/architecture/MODULE_BOUNDARIES.md`, M01–M18 classification, `src/examples/`, M05 gateway composition, `testing/`.
- **Reversibility / compatibility:** Documentation classification is readily reversible; implementation must remain separately approved. Classification alone must not change exports, runtime gates or data.
- **Required gates:** source/runtime inventory; static graph plus wire-edge review; R7.7 manifest mapping; R7.5/R7.6 invariants preserved.
- **Approval:** **APPROVED A**. Classification follows behavior, supported contracts and state ownership.

## ES-D02 — M12 Task Workflow

**Question:** Is M12 APP, DEMO, or a deliberate split?

| Option | Meaning / tradeoff |
|---|---|
| A | APP: keep F08/F09 validation, captured target/source, durable receipt, ACK and delivery semantics as an app workflow. Best preserves demonstrated reliability contracts; demo-named payload types and gated composition remain coupling. |
| B | DEMO: move the entire workflow and state behind the playground. Removes AAB code only if task APIs/events are intentionally withdrawn; would change current `/peers` behavior and destroy established persistence/API guarantees absent a compatibility plan. |
| C | MIXED-SPLIT: keep reusable task receipt/correlation/reliability behavior APP-owned and move only mock task producers/UI/fixtures and optional sample orchestration to DEMO. Most boundary-specific, but requires an owner-defined application use case and exact contract seam; not automatically a small code move. |

**Discovery recommendation:** C as the boundary hypothesis; keep the formal ownership **TBD** until the owner decides whether F08/F09 are supported app capabilities and defines an app-owned workflow contract. Current source demonstrates durable semantics, not product demand.

- **Affected paths:** `src/modules/task-workflow/*`, `src/infrastructure/socket/peer-gateway.ts`, `src/infrastructure/socket/task-history-snapshot.ts`, M10 contracts/service, `src/examples/`, `testing/{pserver,eserver,aaui,shared/task-flow.cjs}`, task/F08/F09 tests and manifest.
- **Reversibility / compatibility:** Keeping code where it is is reversible; moving M12 or changing peer flow/ACK is not transparently reversible once data or external callers depend on it. Preserve existing keys/files and compatibility facade if any later move is approved.
- **Required gates:** task workflow and F09 receipt tests; task routing and PServer roundtrip; live peer ACK drain; outbox and process-crash suites; task snapshots; playground contract tests; unchanged full R7.7 gate. No rewrite of existing assertions.
- **Approval:** **APPROVED C, SCOPED**. Mixed-split remains a hypothesis; M12 remains formally **TBD**. Do not move/split workflow, store, F08/F09, ACK, outbox or snapshots.

## ES-D03 — M13 Resource Selection

**Question:** Is M13 APP, DEMO, or a deliberate split, independently of M12?

| Option | Meaning / tradeoff |
|---|---|
| A | APP: resource selection receipt and delivery workflow is an application capability. Preserves canonical state and ACK contract, while the option catalog and AAUI form remain demo-owned. |
| B | DEMO: move selection workflow, files and UI together to playground. Closest to current sample UI, but withdraws currently composed `/peers` behavior and changes durable receipt/outbox semantics. |
| C | MIXED-SPLIT: keep normalized selection receipt, original ACK, outbox and delivery projection in APP; keep sample options, form and mock PServer validation in DEMO. This matches current source separation, but requires the owner to affirm the selection contract is meaningful outside the sample UI. |

**Discovery recommendation:** C as the observed seam; preserve formal **TBD** pending explicit owner choice. Demo options are not evidence that the M13 persistence/ACK policy itself is demo-only.

- **Affected paths:** `src/modules/resource-selection/*`, M05 `peer-gateway.ts` and snapshot adapter, M10 service, `testing/shared/resource-selection.cjs`, `testing/aaui/main.cjs`, selection and outbox tests/manifest.
- **Reversibility / compatibility:** Mock option fixtures are isolated; workflow/outbox relocation is not low-risk due to existing data paths and durable IDs. Any move must retain paths or specify a separately approved migration/rollback.
- **Required gates:** selection workflow/store/persistence, exact original-ACK and duplicate cases, routing, outbox/crash, snapshots and update notifications, playground selection tests, full profile.
- **Approval:** **APPROVED C, SCOPED**. Mixed-split remains a hypothesis; M13 remains formally **TBD**. Do not move/split workflow, store, ACK, outbox or snapshots.

## ES-D04 — M14 Generic Session

**Question:** Is generic session CRUD an app capability, demo store, or undecided?

| Option | Meaning / tradeoff |
|---|---|
| A | APP: retain M14 contracts, SQLite adapter and `/api/sessions`; best matches unconditional app composition when SQLite is enabled and current external HTTP contract. |
| B | DEMO: move/remove it with the sample environment. Simplifies demo package only by changing public route/data behavior and auth/disabled-SQLite matrix. |
| C | Keep TBD until an external API/caller inventory is obtained. Avoids asserting demand, but continues to defer extraction decisions for a route already exposed by M07. |

**Discovery recommendation (historical):** A was the source-evidence candidate. The owner subsequently approved ES-D04=A; M14 is classified **APP**. M14 is not M04’s PServer protocol session. The approval preserves existing routes/contracts and does not assert an external consumer count.

- **Affected paths:** `src/modules/session/*`, M02 `create-app.ts`, M07 API router/middleware, M17 SQLite schema, HTTP docs/tests and R7.7 manifest.
- **Reversibility / compatibility:** A documentation choice is reversible; moving/removing route or SQLite schema/API is compatibility-sensitive and requires caller inventory and rollback plan.
- **Required gates:** repository and HTTP session tests, exact auth-first/disabled-SQLite tests, application surface and API response tests, SQLite preflight, full gate.
- **Approval:** **APPROVED A**. M14 is **APP**; preserve contracts, SQLite and HTTP behavior.

## ES-D05 — M15 Process Usage

**Question:** Is process-usage CRUD an app API, demo telemetry, or undecided?

| Option | Meaning / tradeoff |
|---|---|
| A | APP: retain M15 record/repository and `/api/process-usage` independently of M12/M13 and peer demos. Matches current M02/M07/SQLite composition. |
| B | DEMO/diagnostics: move it to sample telemetry or M18. Could align its name with operational telemetry, but M15 is persisted API data and M18 is lifecycle diagnostics; conflating them changes data and response contracts. |
| C | Keep TBD until direct API consumer inventory and product meaning are verified. |

**Discovery recommendation (historical):** A was the source-evidence candidate. The owner subsequently approved ES-D05=A; M15 is classified **APP**, distinct from M18. Do not infer that the route is a demo feature from the test-peer gate; the approval preserves current API/data semantics without asserting an external consumer count.

- **Affected paths:** `src/modules/process-usage/*`, M02 composition, M07 API/middleware, M17 SQLite schema, HTTP docs/tests and R7.7 manifest.
- **Reversibility / compatibility:** Similar to M14; endpoint and persisted rows are observable. Separate from M14 decision.
- **Required gates:** repository tests (including current direct-vs-HTTP behavior), process-usage HTTP route/auth/disabled matrix, app surface, SQLite preflight, full gate.
- **Approval:** **APPROVED A**. M15 is **APP**, independently of M14 and M18; preserve contracts.

## ES-D06 — `ENABLE_TEST_PEERS` and `enableTestPeers`

**Question:** Preserve, narrow, or replace the current compatibility gate?

| Option | Meaning / tradeoff |
|---|---|
| A | Preserve exact env string `'1'` and optional programmatic boolean. Safest compatibility choice, but the name obscures that it enables `/peers`, M12/M13 persistence/runners, and CLI default PServer config as well as sample behavior. |
| B | Introduce explicit capability flags for named peer gateway and optional example/demo registration; keep old env/API input as a documented compatibility alias mapping to the current bundle for a transition. Clarifies ownership but adds config surface and requires precedence rules for the two existing booleans. |
| C | Remove/rename the old gate in one change. Simplest end-state but highest environment, embedding and startup compatibility risk. |

**Discovery recommendation:** B only as a future, separately approved staged design; until then select A/current behavior. Define whether CLI `ENABLE_TEST_PEERS=1` continues to imply a default PServer config and how programmatic callers retain behavior. Do not repair the current top-level/nested flag duplication in this phase.

- **Affected paths:** `src/config/configuration.ts`, `src/app/{create-app,lifecycle}.ts`, `src/infrastructure/socket/{socket-gateway,peer-gateway}.ts`, `ApplicationConfig`/`ResolvedConfiguration`, docs and config/surface/lifecycle tests.
- **Reversibility / compatibility:** A remains reversible through documentation. Splitting flags is additive if old alias is preserved; removing/renaming is not compatible without migration period and caller inventory.
- **Required gates:** exact config parsing, both programmatic flag combinations, peer gateway/PServer presence matrix, example transform registration, temp-store creation, startup/drain, API/health and full suite.
- **Approval:** **APPROVED A**. Preserve exact env, programmatic, top-level/nested and CLI default behavior; no new flags.

## ES-D07 — Extracted playground package and process direction

**Question:** Where should playground code live and what may it import?

| Option | Meaning / tradeoff |
|---|---|
| A | Preserve separate `testing/` package/processes; keep all mocks, Electron and mock-only shared helpers there. They depend on AAB only through documented wire contracts; AAB must not import the playground package. Smallest and consistent with current source. |
| B | Create a dedicated demo package/workspace with its own package metadata, moving only after package/build/test migration approval. Cleaner ownership label but introduces lockfile/workspace/build/install changes. |
| C | Move mock peers and UI into root app package or statically import them from AAB. Convenient locally but merges deployment dependencies/lifecycle and reverses dependency direction. |

**Discovery recommendation:** A for first breadth-first step; consider B only if `testing/` needs independent release/versioning. Reject C as boundary policy. Do not share `testing/shared/*` with app modules; extract only neutral, versioned contract fixtures if repeated consumer evidence supports it.

- **Affected paths:** `testing/**`, root/testing package manifests, `tsconfig.json`, root build/start scripts, CI and any future package lockfiles.
- **Reversibility / compatibility:** Documentation/package boundaries are reversible; moving files changes import paths and developer commands. Keep current `npm --prefix testing` scripts until any approved migration passes parity.
- **Required gates:** playground full suite; launch smoke for mock peer process wiring; root build excludes demo outputs as intended; package clean install; AAB wire contract tests; full profile.
- **Approval:** **APPROVED A**. Keep the separate `testing/` package/process direction and no APP→playground imports.

## ES-D08 — Compatibility ownership, sequence and R7.9 handoff

**Question:** What approval/gates divide discovery, extraction, and runtime cleanup?

| Option | Meaning / tradeoff |
|---|---|
| A | Breadth-first extraction: approve classifications and a small file batch first; extract demo fixture/mock process pieces before app-facing workflow seams; compare contract tests and rollback each batch. Reviewable and preserves app contracts but takes multiple checkpoints. |
| B | Bulk move all demo-named modules and tests in one checkpoint. Faster end-state but obscures contract changes, test loss and data ownership; not recommended. |
| C | Make no moves until all external contracts and all M12–M15 consumers are known. Lowest immediate compatibility risk but may defer indefinitely where external use cannot be fully enumerated. |

**Discovery recommendation:** A, with explicit stop at each newly exposed app/API/data seam. Test evidence follows behavior and invariant ownership, not file placement. `npm test` and R7.7 profiles remain stable; full is required before merge/release. R7.9 may be proposed only after the owner accepts R7.8 extraction outcomes and current app/demo ownership plus unresolved TBD behavior are recorded; this package does not authorize R7.9.

- **Affected paths:** whichever approved ES-D02–D07 decisions select; `docs/testing/R7_7_TEST_MANIFEST.json`, responsibility map, profile scripts, CI and `PROJECT_STATE.md`.
- **Reversibility / compatibility:** Small batches with unchanged old entrypoints/adapters are more reversible; bulk moves and persisted data changes are not. Retain compatibility facades where external import evidence is incomplete.
- **Required gates:** per-batch before/after source SHA and dirty paths, test registration/assertion review, focused unit/contract tests, applicable loopback/native/process suites, architecture checker, typecheck, build, unchanged serial `npm test`, playground and `test:full`; compare manifest paths and profile coverage.
- **Approval:** **APPROVED A**. Proceed breadth-first under explicit compatibility gates and reviewer checkpoints.

## Approval record

The architecture owner approved ES-D01=A, ES-D02=C scoped, ES-D03=C scoped, ES-D04=A, ES-D05=A, ES-D06=A, ES-D07=A and ES-D08=A for R7.8. M12 and M13 remain formally **TBD**; M14 and M15 are **APP**. The owner subsequently approved C-D01=A, C-D02=A and C-D03=A: retain the lifecycle-to-example dependency as a bounded compatibility exception, preserve direct `startApplication()` registration, and keep registry state app-local. R7.8.B characterized why extraction was deferred; R7.8 final closure accepts retaining that edge without claiming a code move. See the [R7.8.B verification report](../../R7_8_B_DEMO_EXTRACTION_IMPLEMENTATION_VERIFICATION_REPORT.md), [accepted ADR](R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md), and [final closure report](../../R7_8_FINAL_CLOSURE_VERIFICATION_REPORT.md).
