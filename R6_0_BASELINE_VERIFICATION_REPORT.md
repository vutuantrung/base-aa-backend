# R6.0 — Baseline Verification Report

**Date:** 2026-11-18  
**Repository:** `base-aa-backend`  
**Expected baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`

## 1. Executive Summary

The local `main` branch and fetched `origin/main` ref both point at the expected baseline commit. Their ancestry comparison is 0 ahead / 0 behind, with no committed file differences. The checkout is not clean: `src/main.ts` is modified and three untracked files are present. These changes were preserved. Per the verification instructions, implementation-oriented build, typecheck, test, and runtime verification was stopped because the checked-out files do not unambiguously represent the baseline. Pre-existing `data/tasks` and `data/resource-selections` files also make default-path runtime verification unsuitable.

Static inspection shows the target boundaries can be mapped to current responsibilities, but several targets are not yet standalone modules. Build and test results are **BLOCKED**, not successful. The configured output entry point currently exists in `dist/`, but those files are pre-existing artifacts and cannot establish what a clean compilation emits.

**R6.1 recommendation: BLOCKED** until the checkout discrepancy is resolved by its owner and baseline build/test verification can be run from an uncontaminated baseline. No existing local work was changed or removed.

## 2. Git Repository Verification

| Check | Result | Evidence |
|---|---|---|
| Current branch | PASS | `main` |
| Local HEAD | PASS | `82b6cb68e2016594d42731c2ae022ce43b638557` |
| Origin URL | PASS | `https://github.com/vutuantrung/base-aa-backend.git` |
| Remote `main` | PASS | `git fetch origin main` succeeded; `origin/main` resolves to the expected SHA |
| Remote live HEAD | BLOCKED | `git ls-remote` could not resolve `github.com` after fetch; fetched ref is the available remote evidence |
| Ahead / behind | PASS | `git rev-list --left-right --count HEAD...origin/main`: `0 0` |
| Committed changed files | PASS | `git diff HEAD origin/main --name-status`: none |
| Working tree | FAIL | Modified `src/main.ts`; untracked `docs/major-responsibility.svg`, `docs/upcomming-features/AAB_DYNAMIC_EVENT_LIBRARY_HANDOFF.md`, `package-lock.json` |
| Staged files | PASS | None observed (`git diff --cached --stat` empty) |

The `src/main.ts` diff is formatting-only in the inspected hunk: its application configuration object was expanded across lines without changing the shown values. The new untracked files were not treated as baseline files. No branch switch, stash, reset, or discard was performed. The tracked edit and untracked artifacts must be reviewed by their owner before baseline-sensitive execution.

## 3. Architecture Baseline Compatibility

| Candidate boundary | Static mapping / compatibility observation |
|---|---|
| M01 Configuration | Environment reads live in `src/main.ts`; configuration is not a separate module. |
| M02 Application Lifecycle | `src/app/create-app.ts` composes repositories, gateways, routing, connect, and close. |
| M03 PServer Transport | `src/infrastructure/socket/pserver-connector.ts` owns outbound Socket.IO client and transport delivery. |
| M04 PServer Protocol | Session and task dispatch event contract is implemented in the connector; protocol is coupled to transport. |
| M05 Socket Gateway | `src/infrastructure/socket/socket-server.ts`, `peer-gateway.ts`, and adapters. |
| M06 Peer Directory | In-memory maps in `peer-gateway.ts` track EServer instances and single peers. |
| M07 HTTP Gateway | `src/infrastructure/http/http-server.ts` and `aa-catalog-router.ts`. |
| M08 Integration Clients | PServer connector and shared HTTP/Socket clients; boundary is distributed. |
| M09 Generic Messaging | `src/modules/messaging/` plus message bus and HTTP/Socket adapters. |
| M10 Peer Messaging | `src/modules/peer-messaging/` plus peer gateway. |
| M11 Message Transformation | `transformation-registry.ts`; demo rule in `src/examples/pserver-to-aaui.ts`. |
| M12 Task Workflow (TBD) | Partial demo task receipt/result handling in `peer-gateway.ts`; PServer dispatch explicitly has no forwarding. Preserve TBD scope. |
| M13 Resource Selection (TBD) | Demo validation, persistence, and forwarding in peer gateway/store. Preserve TBD scope. |
| M14 Generic Session (TBD) | SQL-backed session repository and HTTP routes; distinct from PServer session. Preserve TBD scope. |
| M15 Process Usage (TBD) | SQL-backed process usage module and HTTP routes. Preserve TBD scope. |
| M16 AA Catalog | Contracts and SQLite repository in `src/modules/aa-catalog/`. |
| M17 Persistence Infrastructure | SQLite setup plus task and resource-selection JSON stores. |
| M18 Observability | Console logging throughout; no dedicated observability module found. |

**Assessment (static):** Existing boundaries are broadly compatible as candidate extraction seams. Composition and transport-specific policy are currently concentrated in `create-app.ts` and `peer-gateway.ts`. The presence of partial task/resource behavior does not resolve the architecture's TBD status. No extraction or implementation was performed.

## 4. Local Environment and Dependency Inventory

| Item | Observed value |
|---|---|
| OS / architecture | Linux (Ubuntu kernel), x86_64 |
| Node.js | v24.21.0; satisfies declared `>=22` |
| npm | 11.19.0 |
| Installed TypeScript | 5.9.3 |
| Root dependencies declared | express `^5.1.0`, socket.io `^4.8.1`, socket.io-client `^4.8.1`, better-sqlite3 `^12.2.0`, zod `^4.0.0` |
| Playground dependencies declared | express, socket.io, socket.io-client; Electron `^38.0.0` dev dependency |
| Resolved root versions observed | express 5.3.0, socket.io 4.8.4, socket.io-client 4.8.4, better-sqlite3 12.11.1, zod 4.6.7, tsx 4.23.15 |
| Native SQLite package | `better-sqlite3` resolves; standalone `sqlite3` CLI/package unavailable |
| Electron | Not resolvable in current environment |
| Desktop indicators | `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`; graphical session availability was not exercised |
| Lockfiles | Root `package-lock.json` is untracked pre-existing user content; no testing lockfile found |
| `.env.example` | Declares `PORT`, `DB_PATH`, `SOCKET_CORS_ORIGIN`, optional `API_KEY` |
| `.env` loading | Static inspection found direct `process.env` reads and no dotenv dependency/import; automatic `.env` loading is not configured |

No dependency installation was attempted. No secret values are included in this report.

## 5. Source and Environment Responsibility Inventory

| Current file or directory | Existing responsibility | Target module | Environment |
|---|---|---|---|
| `src/main.ts` | Environment mapping, startup, demo transform registration, signal shutdown | M01, M02 | APP |
| `src/app/create-app.ts` | Composition root and lifecycle | M02 | APP |
| `src/infrastructure/socket/pserver-connector.ts` | Outbound PServer connection and protocol | M03, M04, M08 | APP |
| `src/infrastructure/socket/{socket-server,peer-gateway,socket-outbound-adapter}.ts` | Socket namespaces, peer presence, inbound/outbound delivery | M05, M06, M10 | APP |
| `src/infrastructure/http/{http-server,http-outbound-adapter,aa-catalog-router}.ts` | HTTP routes and outbound adapter | M07, M08 | APP |
| `src/modules/messaging/` | Generic message submission, route registry, routing | M09 | APP |
| `src/modules/peer-messaging/` | Peer contracts, transforms, peer service, task/selection stores | M10, M11, M12, M13, M17 | APP / TBD |
| `src/modules/{session,process-usage,aa-catalog}/` | Session, usage, and AA catalog services/repositories | M14, M15, M16 | APP / TBD |
| `src/infrastructure/database/sqlite.ts` | SQLite initialization | M17 | APP |
| `src/shared/` | Shared message contracts and client/bus abstractions | M09, M10 | SHARED |
| `src/examples/pserver-to-aaui.ts` | Demo transformation rule | M11 | DEMO |
| `tests/` | Node test runner TypeScript tests and mock PServer | Multiple | TEST |
| `testing/{pserver,eserver,sserver}.mjs` | Local demo peer servers | M03–M10, M12–M13 | DEMO |
| `testing/shared/` | Demo scheduling, task, resource selection, VM helpers | M12–M13, M15 | DEMO / SHARED |
| `testing/aaui/` | Electron playground UI and preload | M05, M07, M12–M13 | DEMO |
| `testing/{tests,aaui/tests}/` | Playground and UI automated tests | Multiple | TEST |

Inventory excludes `node_modules`, `dist`, and runtime data. Existing runtime files were observed under `data/tasks/` and `data/resource-selections/`; these were not read or modified.

## 6. Typecheck and Build Results

| Command | Status | Exit / duration | Findings |
|---|---|---|---|
| `npm run typecheck` | BLOCKED | Not run | Baseline execution stopped due to unexpected working-tree changes. |
| `npm run build` | BLOCKED | Not run | Same reason; no clean isolated build was created. |
| Compiled output inspection | BLOCKED for clean-output conclusion | Existing `dist/src/main.js`, `dist/src/app/create-app.js`, and `dist/tests/integration.test.js` observed | Artifacts may be stale; no claim that these are the output of the current baseline build. |
| `npm start` entry configuration | STATIC OBSERVATION | N/A | `package.json` uses `node dist/main.js`; `tsconfig.json` uses `rootDir: "."`, `outDir: "dist"`, includes `src/**/*.ts` and `tests/**/*.ts`. Under this layout, `src/main.ts` is expected at `dist/src/main.js`. The existing `dist/src/main.js` supports this path inference; clean compilation was not run to confirm it. |

No compile errors were evaluated. No files were cleaned to avoid deleting user or pre-existing artifacts.

## 7. Automated Test Results

| Command | Status | Discovered / passed / failed / skipped | Duration / exit | Failure or coverage note |
|---|---|---|---|---|
| `npm test` | BLOCKED | Not executed / not counted | N/A | Root script targets `tests/*.test.ts`; execution stopped due to working-tree discrepancy. |
| `npm --prefix testing run test:playground` | BLOCKED | Not executed / not counted | N/A | Script targets `testing/tests/*.test.mjs` and `testing/aaui/tests/*.test.cjs`; execution stopped. |
| `npm --prefix testing run test:scheduler` | NOT RUN | N/A | N/A | Overlaps playground suite. |
| `npm --prefix testing run test:vm-info` | NOT RUN | N/A | N/A | Overlaps playground suite. |
| `npm --prefix testing run test:aaui` | NOT RUN | N/A | N/A | Overlaps playground suite. |

Static inventory found 19 root `tests/*.test.ts` files and 5 playground test files (2 under `testing/tests/`, 3 under `testing/aaui/tests/`). The root glob does not include playground tests; the playground suite explicitly includes both playground locations. Test case counts and pass/fail totals are not asserted because no suite was run.

Provisional categories: unit — routing, contract/service/store/state focused tests; integration — app, HTTP, Socket.IO, PServer mock, peer forwarding and persistence tests; contract — protocol and envelope validation tests; end-to-end — multi-peer/task roundtrip workflows; demo/playground — scheduler, VM info, and AAUI flows. These categories are inferred from filenames and inspected test contents, not from executed suite reports. Test files under both suites are covered by their respective declared globs. No additional automated test locations were found outside these roots.

## 8. Runtime Smoke Verification

All process-based runtime checks were **BLOCKED** by the non-baseline working tree and the presence of existing runtime data. No process was started and no temporary database/storage was created.

| Verification | Status | Result |
|---|---|---|
| BV07-A Development app, HTTP listener, `/health`, clean stop | BLOCKED | Not run. |
| BV07-B Compiled `npm start` | BLOCKED | Not run; entry point has the static layout concern documented above. |
| BV07-C Generic HTTP/Socket messaging | BLOCKED | Not run. |
| BV07-D Mock PServer, peer registration/presence/delivery/ACK | BLOCKED | Not run. Existing tests and mock-server source provide static evidence only; production compatibility is not established. |
| BV07-E F03/F04/multiple EServers/F08/F09/resource selection | BLOCKED | Not run. |
| BV07-F AAUI | BLOCKED | Visual runtime not run; Electron is unavailable as a resolvable dependency. Existing AAUI automated tests also were not run. |
| Cleanup / leftover verification processes | PASS | No process was started by this task. |

## 9. Existing Issues and Technical Debt

Statuses below separate static findings from runtime confirmation. Severity describes potential effect, not an executed failure.

| Finding | Classification | Evidence and location | Severity / architecture impact | Suggested future step |
|---|---|---|---|---|
| BV-OBS01 compiled entry | STATIC OBSERVATION | `package.json` start script; `tsconfig.json` root/out dirs; current `dist/src/main.js` artifact | Medium; startup packaging/lifecycle concern | Verify clean output in a clean baseline workspace during R6.0 rerun; address only in a later authorized change. |
| BV-OBS02 test coverage | CONFIRMED (configuration) | Root script in `package.json` only matches `tests/*.test.ts`; playground command in `testing/package.json` separately includes playground test locations | Medium; playground checks are omitted by root `npm test` | Record explicit suite ownership/coverage in later verification or test strategy work. |
| BV-OBS03 documentation consistency | STATIC OBSERVATION | README lines 115–135 give current topology/path and also a superseded “no business forwarding” statement before describing routing; testing guide contains staged/historical demo instructions. Source uses PServer path `/ws`, default namespace, outbound AAB client (`pserver-connector.ts:30–50`). Generic routes are registry based (`route-registry.ts:42–43`), not implicit channel-name routing. | Medium; readers may follow stale flows | Documentation reconciliation after baseline verification. |
| BV-OBS04 `ENABLE_TEST_PEERS` coupling | CONFIRMED (static configuration) | `src/main.ts:19–26`: flag gates `/peers`, PServer connector configuration, and demo transform registration | Medium; test/demo integration behavior is toggled as a bundle | Consider separate configuration boundaries during architecture work while preserving demo behavior. |
| BV-OBS05 `.env` loading | CONFIRMED (static) | `src/main.ts` reads `process.env`; no dotenv package/import found; `.env.example` is template only | Low/medium; shell/service must supply environment | Document deployment environment injection; no change made. |
| Inbound ACK callback absent | STATIC OBSERVATION | `pserver-connector.ts:105–112` uses optional callback, but awaits `gateway.receiveFromPServer` before optional invocation | Low; work is still performed without caller acknowledgement | Add a focused behavior check in a future test pass if semantics matter. |
| PServer session resume rejection | STATIC OBSERVATION | Connector retains `sessionId` and on reconnect sends only `{session_id}` (`pserver-connector.ts:43, 65–78`); a negative ack logs and leaves `sessionReady=false`, with no fresh-session fallback | Medium; reconnect can remain unusable if stored session expires | Define and test resume rejection/re-registration policy later. |
| Pending async forwarding at shutdown | STATIC OBSERVATION | Task/result/resource forwarding uses `setImmediate` callbacks in `peer-gateway.ts:134, 204, 257`; lifecycle closes sockets and DB in `create-app.ts:53–58` without draining those jobs | Medium; in-flight forwarding/persistence may be interrupted | Track/drain background work in a later lifecycle design step. |
| Mutable global/module state | STATIC OBSERVATION | Peer maps and PServer transport are mutable closure state in `peer-gateway.ts`; demo PServer stores are process-local in `testing/pserver.mjs` | Low/medium; state lifetime is process-scoped and complicates isolation | Keep ownership explicit during module-boundary design. |
| Demo/test dependencies in app | CONFIRMED (static) | `main.ts` imports/registers example transform and flag gates PServer plus peer gateway; peer gateway contains demo task/resource flows | Medium; APP and DEMO responsibilities are coupled | Preserve existing TBD and demo behavior while planning later separation. |
| Existing default-path runtime data | CONFIRMED | Files exist in `data/tasks/` and `data/resource-selections/`; store constructors default to these paths | High for accidental data contamination; runtime was not attempted | Use explicit temporary env paths for any future authorized smoke verification. |

## 10. Final Working Tree Verification

| Check | Result |
|---|---|
| HEAD unchanged | PASS — remains `82b6cb68e2016594d42731c2ae022ce43b638557` |
| Application source changed by this task | PASS — no writes to application source; pre-existing `src/main.ts` edit preserved |
| Existing tests changed by this task | PASS — none |
| Manifests/lockfiles changed by this task | PASS — none; pre-existing untracked `package-lock.json` preserved |
| Existing user changes lost | PASS — none intentionally altered or removed |
| Verification processes started / left running | PASS — none |
| Allowed deliverable | Created: `R6_0_BASELINE_VERIFICATION_REPORT.md` |

The before/after working-tree entries remain the same apart from this report. Git fetch updated repository metadata only; it did not alter the working-tree files.

## 11. Architecture Baseline Impact

There are no new committed differences between local HEAD and fetched `origin/main`, so the commit baseline is intact. The uncommitted `src/main.ts` formatting change appears behavior-neutral in the inspected diff, but the untracked documentation, SVG, and lockfile were not validated as part of the architecture baseline. No architecture impact from those files is claimed. The implementation remains statically mappable to the 18 candidate boundaries, with notable concentration in the composition root and peer gateway. TBD areas remain unresolved and were not implemented.

## 12. R6.1 Readiness Recommendation

**BLOCKED.** Do not begin R6.1 from this checkout state. First have the owner identify and disposition the pre-existing source edit and untracked files, while preserving them. Then repeat typecheck, clean build/output inspection, both automated suites, and isolated smoke verification against the confirmed baseline with explicit temporary database and storage paths. This report does not establish that the application builds, passes tests, or starts successfully.
