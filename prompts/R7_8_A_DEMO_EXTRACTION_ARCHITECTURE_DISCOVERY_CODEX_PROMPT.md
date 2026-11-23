# Codex Prompt — R7.8.A Demo Extraction: Architecture Discovery & Decision Baseline

## 0. Authority, checkpoint, execution rules

Repository: `vutuantrung/base-aa-backend`
Branch: `main`
Expected committed HEAD: `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`
Runtime verification baseline: Node.js `22.23.5`, npm `10.9.9`.
Phase: **R7.8.A — Discovery only; not extraction implementation**.

The architecture owner has authorized R7.8 Demo Extraction **Architecture Discovery**, but has **not** authorized moving code, disabling workflows, changing runtime configuration or resolving TBD ownership. This prompt is one complete discovery checkpoint with internal workstreams A01–A07. Perform the work now; stop for owner review of proposed decisions.

Before work:
1. Read `AGENTS.md` if present; inspect `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, current `package.json`, and R7.7 test scripts. If HEAD differs, report the actual state and changes; do not silently reset, overwrite or rebase. Preserve unrelated work.
2. Read `docs/architecture/{PROJECT_STATE,MODULE_BOUNDARIES,ARCHITECTURE,ARCHITECTURE_DECISIONS,TECHNICAL_DEBT}.md`, R7.7 responsibility map / policy / manifest, R7.5 reliability policy, R7.6 lifecycle policy and relevant R6 module reports on demand. Do not read all historical reports exhaustively unless needed to establish a fact.
3. Current committed `PROJECT_STATE.md` is a historical snapshot whose status/HEAD text may lag the commit. Distinguish factual state from historical report provenance; do not rewrite historical reports.
4. Use intent-revealing method names and evidence-based analysis. No unnecessary code generation or opportunistic refactor. **Do not commit/push**; do not begin R7.8.B or R7.9.

## 1. Objective and non-goals

Establish a defensible **APP / DEMO / SHARED / TBD boundary** for the current AAB modular monolith and playground. Identify the minimum, behavior-preserving extraction options and owner decisions needed before any implementation.

This is **not** permission to:
- Move/delete/rename source modules or test files; change import paths, public APIs, Socket.IO/HTTP event semantics, database schemas, package dependencies, environment-variable behavior, build outputs, or app startup/shutdown behavior.
- Reclassify M12–M15 merely because they originated in demo flows or are guarded by `ENABLE_TEST_PEERS`.
- Alter R7.5 P01–P06 durable receipt/outbox semantics, exact ACK replay, quarantine, uncertain-no-replay, process-wide concurrency cap, quota/retention, writer-lock lifetime, or R7.6 D01–D06 one-shot lifecycle, admission, bounded drain and total default 15-second monotonic deadline.
- Change test manifest/profile selection, `npm test` compatibility, Node baseline or R7.7 test architecture.
- Resolve unrelated technical debts TD02/TD12/TD13/TD15 or broader R7.9 runtime cleanup.

## 2. Grounded starting observations (re-verify against HEAD)

Treat these as search leads, not immutable conclusions:
- `testing/` has separately launched mock PServer, EServer, SServer, AAUI and shared helpers; `testing/package.json` contains playground scripts. Root `package.json` includes `test:fast`, `test:integration`, `test:full` and preserved serial `npm test`.
- `src/app/create-app.ts` exposes additive `enableTestPeers?` and composes the socket server, optional peer gateway and optional PServer connector. `src/infrastructure/socket/socket-server.ts` passes the flag into `socket-gateway.ts`.
- M05 peer gateway composes M12 TaskWorkflow, M13 ResourceSelectionWorkflow, their JSON stores, persistence runner and live notifications. This does not by itself make M12/M13 demo-only.
- The architecture documents classify M01–M11 and M16–M18 as APP, but M12–M15 as **TBD**; TD16 flags APP/demo coupling via `ENABLE_TEST_PEERS`.
- `testing/eserver.mjs` emits simulated VM information; `testing/sserver.mjs` simulates scheduled status; `testing/pserver.mjs` implements a mock session/ACK endpoint and task/resource-selection demos. Distinguish these simulators from production protocol contracts.
- R7.7 at baseline has 55 discovered test files, 253 backend and 32 playground test registrations, with manifest validation and additive profiles. Do not assume these counts remain stable after discovering current HEAD.

## 3. Workstreams

### A01 — Complete boundary/runtime inventory

Inventory all relevant files in `src/`, `testing/`, `tests/`, `scripts/`, root configs, docs and CI. At minimum inspect:
- `src/main.ts`, `src/config/configuration.ts`, `src/app/{create-app,lifecycle,application-coordinator}.ts`
- `src/infrastructure/socket/{socket-gateway,socket-server,peer-gateway,socket-peer-gateway,pserver-connector}.ts`
- `src/modules/{task-workflow,resource-selection,session,process-usage,aa-catalog,peer-messaging}` and persistence adapters
- `testing/{pserver,eserver,sserver}.mjs`, `testing/aaui/`, `testing/shared/`, `testing/package.json`
- Tests and manifest entries exercising named peers, task/selection workflows, SQLite repository contracts, compatibility behavior and reliability/lifecycle.

Create a per-file **boundary inventory** with fields: path, current responsible module, location, APP/DEMO/SHARED/TBD candidate classification, direct runtime importers, initialization owner, state/lifecycle ownership, data/API/transport contract exposure, test evidence and confidence. `SHARED` must mean a specifically justified neutral contract/utility, **not** automatically reusable production logic. List unknown consumers and runtime dynamic connections explicitly.

### A02 — Runtime composition and feature-gate trace

Trace `ENABLE_TEST_PEERS` and programmatic `enableTestPeers` from environment parsing through app creation to socket namespaces/gateway, PServer registration and workflow/store/runner startup. Draw at least these **observed** composition variants:
1. CLI/default runtime with feature flag disabled and optional SQLite behavior;
2. named-peer runtime with feature flag enabled but without configured PServer;
3. named-peer runtime with configured PServer;
4. `testing/` playground runtime as independently launched simulated peers;
5. test construction scenarios, if they differ materially.

For each variant explain actual listener/namespace presence, M12/M13 creation and durability side-effects, M14/M15 availability, PServer session/ACK behavior, CLI-vs-programmatic default differences, shutdown/writer lock ownership and env variables. Distinguish code-verified facts from hypotheses. Include file paths and function names for every significant assertion.

### A03 — Responsibility classification, especially M12–M15

Assess **M12 Task Workflow**, **M13 Resource Selection**, **M14 Generic Session**, **M15 Process Usage** independently; do not conflate them. For each answer:
- Which semantics are intrinsically business/application behavior, which are demo fixture behavior, and which are uncertain?
- Who creates/uses it in production composition vs mock/playground? Are public API/ACK/DTO records or persistence contracts observable externally?
- Which tests establish compatibility, persistence, replay, auth-first/disabled-SQLite, failure and shutdown semantics?
- What would break if the module were moved to `testing/` or only loaded when a demo flag is set?
- Is the best classification APP, DEMO, SHARED, MIXED-SPLIT or TBD, and which decision must the architecture owner explicitly make?

Avoid classifying by filename, demo-prefixed payload type or current flag alone. Preserve meaning of F03, F04, F08/F09 and M13 as documented and tested; note current vs historical flow descriptions.

### A04 — Import graph, dependency direction, package/runtime boundary

Record import/ownership edges between APP and playground, APP and demo fixtures, modules with TBD classification, and any runtime-only dynamic contracts across process boundaries (Socket.IO namespaces, Engine.IO path, HTTP requests). Distinguish **static imports** from **wire/runtime dependencies**. Do not invent cross-process code imports because two processes exchange messages.

Use `scripts/check-architecture.ts` and its explicit M01–M18 owners to compare the actual graph to docs. Note existing module SCC warnings but do not change checker rules. Identify top extraction blockers, transitional adapters/ports and test seam constraints. Include `tsconfig`/build/runtime packaging/optional SQLite considerations for possible future extraction; do not change them.

### A05 — Behavior, compatibility and safety invariants

Build a **Before → Proposed boundary → Risk → Required characterization/contract test** matrix for at least:
- `/health`, local readiness vs health, HTTP authentication and disabled-SQLite status/response matrix;
- named peer namespace/authentication, no-ACK processing skip, exact ACK/error precedence, logical EServer identity;
- PServer physical transport vs protocol session readiness;
- F03/F04 and F08/F09 inbound/outbound routing and target capture;
- M13 receipt/original ACK/canonical delivered-vs-uncertain status;
- R7.5 outbox files, writer lease, crash recovery/quarantine/no unsafe replay, process-wide attempt limit and retention;
- R7.6 startup/rollback, active fan-out/peer ACK drain, timeout and cleanup;
- generic M09 routes/fail-fast sibling semantics;
- M14–M16 SQLite data shape and HTTP route compatibility;
- R7.7 manifest and `npm test`/profiles/CI continuity.

Treat successful local tests as scoped evidence, not deployed-filesystem, power-loss or exactly-once guarantees.

### A06 — Alternatives and owner decision package

Propose a **small numbered decision set** (e.g. ES-D01 through ES-D07, adjust as evidence requires), each with Option A/B/C, tradeoffs, preferred option, affected paths, reversibility, compatibility impact, test gates and **explicit pending approval**. At least cover:
1. What constitutes demo-only vs app-owned capabilities (policy, not path naming);
2. disposition of M12/M13;
3. disposition of M14/M15 independently from M12/M13;
4. meaning and future fate of `ENABLE_TEST_PEERS` / `enableTestPeers`, including CLI/API compatibility;
5. structure and package/process dependency direction for extracted playground;
6. compatibility test and contract fixture ownership during staged extraction;
7. migration sequence, feature parity gates, rollback and the point where R7.9 may begin.

Recommend **breadth-first incremental extraction** with a distinct approval boundary before moving source. If one choice has insufficient evidence, mark it TBD and describe the exact missing measurement or characterization test instead of forcing a decision. Do not treat a recommendation as approved.

### A07 — Documentation, baseline verification, exit report

Create these outputs:
1. `docs/architecture/R7_8_DEMO_BOUNDARY_INVENTORY.md` — per-file/entrypoint inventory and confidence tags (may use linked machine-readable tables if appropriate).
2. `docs/architecture/R7_8_RUNTIME_COMPOSITION_AND_DEPENDENCIES.md` — composition variant diagrams, feature-gate trace, static/wire edges and lifecycle/state ownership.
3. `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md` — numbered decision options and pending owner approval record.
4. `R7_8_A_DEMO_EXTRACTION_ARCHITECTURE_DISCOVERY_REPORT.md` — compact checkpoint, evidence, uncertainties, critical migration risks, decisions required, recommended R7.8.B scope and GO/NO-GO.
5. Add a **small, accurate R7.8.A progress section** to `docs/architecture/PROJECT_STATE.md`, without rewriting historical reports/verification evidence. Update TD16 only if new grounded findings clarify the debt; do not prematurely close it.

Run verification with **Node 22.23.5**. Minimum:
- `git status --short`, `git diff --check`;
- `npm run check:architecture`;
- `npm run test:manifest`;
- `npm run typecheck`, `npm run build`;
- `npm run test:full` (includes unchanged `npm test` + playground) if host environment permits; if blocked by permissions/native module, report exact commands and blocker, do **not** claim PASS. Document any observed prior baseline differences and do not equate blocked environment with failing assertions.

Because Stage A is documentation-only, avoid unneeded test code or production edits. Capture run results and counts without falsely claiming direct execution if not done. If a check is prohibitively blocked, complete supported inventory/decisions and state the limitation.

## 4. Deliverable quality and acceptance rubric

The discovery is acceptable only when:
- Every M01–M18 responsibility is represented, with explicit APP/DEMO/SHARED/TBD/mixed rationale; **M12–M15 have separate evidence-backed assessments**.
- `ENABLE_TEST_PEERS` is traced through both environment and programmatic composition, including stateful side effects and shutdown.
- All observed APP↔DEMO coupling and cross-process wire dependencies have a concrete source or test location.
- R7.5/R7.6 invariants and R7.7 test gates appear in an explicit no-regression matrix.
- Owner decision alternatives contain real tradeoffs and do **not** authorize moves themselves.
- No source, tests, scripts, CI configuration, public contracts or runtime behavior is changed in Stage A.
- The final report states actual HEAD/working tree, checks run, findings, unknowns, and recommended next decision; **NO extraction implementation, NO commit/push, NO R7.9**.

Stop after producing the docs and report. The architecture owner will review the decision package before any R7.8.B implementation prompt is prepared.
