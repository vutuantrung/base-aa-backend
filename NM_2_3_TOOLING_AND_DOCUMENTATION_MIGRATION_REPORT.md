# NM.2.3 Tooling & Documentation Migration Report

## 1. Baseline and worktree protection

- Branch `main`, committed HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; Node `v22.23.5`, npm `10.9.9`.
- Entry tree was already dirty with NM.2.1/NM.2.2 migrations. Modified paths included `PROJECT_STATE.md`, architecture checker and test manifest tooling, backend source/tests, standalone demos, shared helpers and test manifests. Deleted paths were the old CDC/SPA/AA component paths replaced in NM.2.1/NM.2.2. Untracked paths included the NM.1/NM.2.1/NM.2.2 reports, R8 planning/checkpoint artifacts, current source paths (`src/modules/cdc/`, `src/examples/cdc-to-aa.ts`, CDC transport files), renamed demos/tests (`testing/cdc.mjs`, `testing/spa.mjs`, `testing/aa/`, CDC/AA tests), and `docs/flows/`/Socket.IO inventory documents.
- The NM.2.1 and NM.2.2 implementation was present. No prior work was reset, stashed, discarded or overwritten. No root index changes were made; checker fixture Git operations occurred only in temporary directories under the OS temp directory.

## 2–4. Architecture Checker review and decision

- Reviewed `scripts/check-architecture.ts:219-222` and `tests/architecture-check.test.ts:133-195`. The earlier collector used only cached/index paths. It omitted unstaged untracked source, could leave a deleted working-tree path in the input, and used the old module path mapping after migration.
- The retained collector uses `git ls-files --cached --others --exclude-standard -- src/**/*.ts`, filters paths that do not exist in the worktree, and sorts the result (`scripts/check-architecture.ts:219-221`). It therefore observes current content for modified tracked files, includes staged additions and non-ignored untracked source, discovers staged or unstaged rename destinations, excludes deleted paths and ignored untracked/generated output, and still includes tracked source even if an ignore rule matches it.
- Temporary-repository characterization covers a clean fixture, modified tracked source, staged addition, unstaged/untracked addition, staged rename, deleted worktree path, ignored generated source, an unmapped newly discovered source, and a discovered M04 type-only import violating the infrastructure boundary. The violation is reported by the unchanged ownership/rule analysis. No actual repository index was altered.
- **Decision: retain the NM.2.1 implementation with a narrow deterministic ordering change** (sort discovered paths) and characterization coverage. The rules for M03/M04, all other ownership mappings, approved exceptions, runtime/type-only classification and SCC detection were not redesigned or relaxed. Before/after graph evidence is identical: 59 files, 145 edges (65 runtime / 80 type-only), zero runtime file SCCs, same M10↔M12↔M13 runtime module SCC and M06↔M10↔M11↔M12↔M13 all-import SCC, with the existing M10↔M11 type-only warning.

## 5. Test tooling consistency

- Current discovery in `scripts/test-manifest.mjs:19-25` covers root backend tests, `testing/tests/*.test.mjs`, and `testing/aa/tests/*.test.cjs`. `docs/testing/R7_7_TEST_MANIFEST.json` contains the migrated AA test paths; the validator found 55 entries and 55 discovered tests (fast 11 entries, integration 16, full 55).
- Root test profiles and `.github/workflows/test.yml` need no further path changes: the profile consumes the maintained manifest, and CI invokes `npm run test:full`. Root and playground package names/scripts remain appropriate; playground commands are `cdc`, `eserver`, `spa`, `aa` and `test:aa`.
- `docs/testing/R7_7_TEST_INVENTORY.json`, `docs/testing/R7_7_RESPONSIBILITY_VERIFICATION_MAP.md`, and the R7.7 inventory reports/prompts are historical verification evidence. They retain their original R7.7 test paths/counts by policy; they are not current discovery inputs. The maintained manifest is the current path map.

## 6–8. Documentation classification, updates and paths

- **ACTIVE, updated:** root README, `AGENTS.md` naming example, `testing/README.md`, current peer transformation and multi-EServer guides, current Socket.IO inventory, DF-07 flow, current operations instructions, and current architecture/system and module boundary descriptions.
- **MIXED, current overlay added:** `ARCHITECTURE.md`, `MODULE_BOUNDARIES.md`, `DEPENDENCY_INVENTORY.md`, `APPLICATION_SURFACE_INVENTORY.md`, `PROJECT_STATE.md`, product baseline checkpoint, R8 planning docs/report, and the Dynamic Event Library handoff. Current names/paths are identified; old checkpoint evidence, accepted decisions, embedded prompts, debt findings and original decision meaning are retained.
- **HISTORICAL, unchanged:** NM.1–NM.2.2 reports, R6/R7 implementation and verification reports, historical prompts, R7.7 inventory/responsibility evidence and historical ADR/decision evidence. No historical report or prompt was rewritten.
- Active path migrations: `docs/DEMO_PSERVER_AAUI.md` → `docs/DEMO_CDC_AA.md`; `docs/PSERVER_SESSION_PROTOCOL.md` → `docs/CDC_SESSION_PROTOCOL.md`; `docs/upcomming-features/AAB_DYNAMIC_EVENT_LIBRARY_HANDOFF.md` → `docs/upcomming-features/AS_DYNAMIC_EVENT_LIBRARY_HANDOFF.md`; `docs/flows/DF-07_PSERVER_TASK_REQUEST_INTEGRATION.md` → `docs/flows/DF-07_CDC_TASK_REQUEST_INTEGRATION.md`. Incoming README/architecture links now target the new paths. The handoff retains its historical discussion and embedded prompt and adds current source equivalents.
- Startup guides state AS `ENABLE_TEST_PEERS=1 npm run dev`; CDC `npm --prefix testing run cdc`; EServer `npm --prefix testing run eserver`; SPA `npm --prefix testing run spa`; AA `npm --prefix testing run aa`. Current config references include `CDC_URL`, `CDC_SOCKET_PATH`, `AS_URL`, `AS_TASK_STORE_DIR`, and `AS_SELECTION_STORE_DIR`. Ports remain 3000–3004.
- Documentation distinguishes NM.2.2 automated integration and Electron unit test evidence from pending actual standalone-process and graphical Electron startup. ARM packages/application IDs are explicitly pending NM.3; no migrated ARM package is claimed.

## 9–10. Socket.IO, flow and source naming audit

- Current socket inventory records AS as the outbound client and CDC as server at Engine.IO path `/ws`, namespace `/`; AS `/peers` consumers authenticate as `eserver`, `spa`, or `aa`. Current identities, `as:welcome` producer/consumers, CDC `cdc:welcome`, generic events, producer/consumer roles and current message examples are documented. `/session`, `/worker`, `peer:message`, `peer:ping`, `from`, `to`, `channel`, and `event` remain unchanged.
- Current DF-07 and CDC session/demo guides use the migrated paths, identities and environment names and preserve receipt/delivery ACK meanings, F08/F09 persistence/retry descriptions, session registration/resume and feature-gate behavior. The CDC topology is explicitly root namespace `/` with Engine.IO `/ws`; no `/as` or `/aab` namespace is documented as current.
- Case-insensitive source/path scan found no unexpected old component names in active `src/`, `tests/`, `testing/`, maintained test-discovery tooling, CI or current guides. The only active tool implementation retaining the prior package/component identifiers is the explicitly deferred ARM packager below.
- Remaining relevant matches are classified as follows:
  - **DEFERRED_NM3_DEPLOYMENT:** `scripts/package-for-arm.sh` retains old package/artifact identifiers for AAB/PServer/SServer. It was not changed; fresh ARM package names and application IDs remain NM.3.
  - **PRESERVE_HISTORICAL:** old names in the historical body of `docs/architecture/ARCHITECTURE.md`; the R7.1 checkpoint bodies of `DEPENDENCY_INVENTORY.md` and `APPLICATION_SURFACE_INVENTORY.md`; earlier checkpoints in `PROJECT_STATE.md`; R6/R7-linked decision evidence in `MODULE_BOUNDARIES.md`; R8 debt/source evidence and the original product-baseline checkpoint; the historical Dynamic Event Library handoff discussion/embedded prompt; R7.7 inventory/responsibility artifacts; and historical root reports/prompts. Current overlays identify these as historical rather than current API/path guidance.
  - **PRESERVE_REPOSITORY_NAME:** `base-aa-backend` and package root name.
  - **PRESERVE_DOMAIN:** AA Catalog and SQLite domain/table naming.
  - **PRESERVE_GENERIC:** generic fields/events/routes/module IDs; e.g. `HttpServer` is a Node type, not an old service name.
  - No **UNEXPECTED_RESIDUAL** or unresolved **REVIEW_REQUIRED** occurrence was found in active source/tooling/current docs.

## 11–16. Historical protection, verification and remaining boundary

- The old-path files in the path-migration list are absent from the working tree and their new targets exist. Historical report and prompt files were not changed. The R7.7 maintained manifest maps the current test paths while the R7.7 inventory and responsibility map remain historical.
- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `npm run check:architecture` — PASS, 59 files / 145 edges; SCC/warning results match NM.2.2.
- `npm run test:manifest` — PASS, 55/55 discovered.
- `npm run test:fast` — PASS, 90/90 tests, zero skips (one new checker characterization case compared with NM.2.2's 89).
- `npm run test:full` — PASS on the captured repeat: backend 260/260 and playground 32/32, zero skips. The backend count is NM.2.2's 259 plus the new checker characterization case. The captured log was `/tmp/nm23-full.log`.
- `node --import tsx --test tests/architecture-check.test.ts` — PASS, 11/11; this includes the new source-discovery characterization.
- `git diff --check` — PASS after removing two trailing blank lines introduced with the current overlays. Relative-link check passed for 11 updated active documents.
- One earlier standalone serial backend capture reported 259/260 with one failure, but its failure name was not retained in that tail-only capture. The next serial backend run passed 260/260, and the captured Full profile also passed 260/260 plus 32/32. This one-off failure is **not reproduced; exact failure identity/root cause is unknown** and remains a verification caveat, not a confirmed migration regression.
- **NM.3 remains:** ARM package/artifact/application-ID migration, fresh ARM deployment and external verification. No ARM packaging/deployment or runtime-state migration/deletion/replay occurred.
- **NM.4 remains:** actual local standalone-process interoperability and graphical Electron startup verification. Automated mock/loopback suites and Electron unit tests are not represented as manual process or GUI verification.
- M12/M13 ownership remains TBD; M14/M15 remain APP; M02 extraction remains deferred. No business behavior, ACK/retry/delivery/persistence semantics or architecture responsibility changed.

## 17. Acceptance recommendation

**PARTIAL.** Active source-level names, tooling mappings and documentation paths are migrated, and the captured Full profile passes. The unexplained one-off serial backend failure was not reproducible but lacks a retained test identity/root cause; resolve or obtain a clean additional captured serial run before treating verification as fully unqualified PASS. NM.3 deployment and NM.4 standalone/graphical verification remain deferred boundaries.
