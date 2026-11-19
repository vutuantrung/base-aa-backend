# R6.0 — Baseline Verification Final Report

**Date:** 2026-11-18  
**Baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`  
**Verification workspace:** detached temporary worktree at `/tmp/base-aa-backend-r6-0`

## Executive Summary

The isolated worktree was created at the requested commit and was clean before verification. Dependencies were installed in that worktree at the versions observed during the initial audit. The native SQLite binding opened an in-memory database successfully.

Typecheck and build both fail on a TypeScript error in `tests/forwarding.test.ts:18`. The build nevertheless emits to `dist/src/` and `dist/tests/`. Consequently, `npm start` fails because it invokes the absent `dist/main.js`; starting the emitted `dist/src/main.js` diagnostically succeeds and serves `/health`.

The serialized root suite reports 44/45 passing, with one PServer-to-AAUI task roundtrip failure. The playground suite reports four of five test files passing; its dashboard state tests fail because CommonJS `require()` does not receive exports from the `.js` file in the playground package's ESM scope. Isolated development and compiled runtime checks passed for health and generic messaging; existing integration tests verified peer/PServer and demo workflows. Electron is unavailable, so visual AAUI verification is blocked.

**R6.1 readiness: BLOCKED.** Resolve the baseline typecheck/build failure, the root task roundtrip failure, and the playground dashboard test failure, then rerun verification. No application source or tests were modified.

## 1. Isolated Workspace Verification

| Check | Result | Evidence |
|---|---|---|
| Worktree location and commit | PASS | `/tmp/base-aa-backend-r6-0`; HEAD `82b6cb68e2016594d42731c2ae022ce43b638557` |
| Initial worktree status | PASS | Detached HEAD, no branch, clean working tree |
| Original workspace preserved | PASS | Original HEAD unchanged; existing `src/main.ts` modification and untracked files remain present |
| Package/lockfile changes in worktree | PASS | No manifest or lockfile changes; dependency install used `--no-save --package-lock=false` |

The original workspace was not switched, stashed, reset, or otherwise altered. All verification database and JSON storage paths were under `/tmp/aab-r6-0/runtime/`.

## 2. Dependency Preparation and Environment

| Item | Observed |
|---|---|
| Node.js / npm | v24.21.0 / 11.19.0 |
| Root declared requirement | Node.js `>=22`; satisfied |
| Install | `npm install --no-save --package-lock=false` with pinned observed versions; PASS, 23 seconds |
| Resolved root versions | express 5.3.0; socket.io 4.8.4; socket.io-client 4.8.4; better-sqlite3 12.11.1; zod 4.6.7; TypeScript 5.9.3; tsx 4.23.15 |
| Playground shared packages | Resolved from worktree root installation at the versions above |
| Native SQLite binding | PASS — `better-sqlite3` opened `:memory:` and `SELECT 1` returned `1` |
| Electron | Unavailable (`require.resolve('electron')` failed); visual AAUI runtime is BLOCKED |
| Desktop indicators | `DISPLAY=:0` and `WAYLAND_DISPLAY=wayland-0` were present in the environment; no Electron executable was available |

The no-lockfile installation warned that install scripts for `better-sqlite3` and `esbuild` were not yet covered by npm's `allowScripts` policy. Despite that warning, the native SQLite open/query check passed and TypeScript tooling ran. No credentials or secret values were inspected or included.

## 3. Build and Typecheck Results

| Command | Result | Duration / exit | Details |
|---|---|---|---|
| `npm run typecheck` | FAIL | ~1.2 seconds / 2 | `tests/forwarding.test.ts:18:66`: `Buffer[]` is not assignable to `readonly Uint8Array<ArrayBufferLike>[]`; nested `ArrayBufferLike` versus `ArrayBuffer` incompatibility. |
| `npm run build` | FAIL | ~1.2 seconds / 2 | Same TypeScript error. TypeScript emitted JavaScript despite the nonzero exit. |
| Clean output layout inspection | PASS | After initially absent `dist/` | Emitted application entry is `dist/src/main.js`; test output is under `dist/tests/`. `dist/main.js` is absent. |
| `npm start` | FAIL | <1 second / 1 | `node dist/main.js` exits with `MODULE_NOT_FOUND`. |
| Diagnostic `node dist/src/main.js` | PASS | Started and stopped successfully | With temporary DB/storage and port 43872, logged startup and returned HTTP 200 from `/health`. Diagnostic entry differs from the configured `npm start` command. |

This confirms BV-OBS01: `rootDir: "."` with `outDir: "dist"` preserves the `src/` prefix, while the package start script expects a root-level `dist/main.js`.

## 4. Automated Test Results

### Root suite

| Command | Result | Tests | Duration / exit | Failure details |
|---|---|---:|---|---|
| `npm test` | FAIL / interrupted | Initial parallel execution did not produce a complete summary | Ran for about 90 seconds; manually interrupted with exit 130 after Node native `InternalCallbackScope::Close()` assertion failures in worker processes | This default-concurrency invocation did not complete naturally. |
| `npm test -- --test-concurrency=1` | FAIL | 45 total; 44 passed, 1 failed; 0 skipped/cancelled | 4.8 seconds / 1 | `tests/pserver-aaui-task-roundtrip.test.ts:71`: expected `response.ok === true`, received `false`; follow-up rejects with “No task result arrived.” |

The failing roundtrip sends `demo.task.request` to `aaui` and expects it to be accepted and returned to PServer. Current peer-gateway task receipt validation is for PServer-to-EServer requests, so the tested AAUI route returns a negative response. This is a confirmed baseline test failure; no behavior was changed.

### Playground suite

| Command | Result | Test files | Duration / exit | Failure details |
|---|---|---:|---|---|
| `npm --prefix testing run test:playground` | FAIL | 5 files: 4 pass, 1 fail | 0.27 seconds / 1 | `aaui/tests/dashboard-state.test.cjs` fails; `testing/aaui/tests/dashboard-state.test.cjs` has 21 failing assertions because `createState` and related functions are unavailable through `require('../dashboard-state.js')`. |

The playground package declares `"type": "module"`; `dashboard-state.js` assigns `root.AAUIState` and conditionally assigns `module.exports`, but under ESM there is no CommonJS `module` binding. Direct test execution confirms the required API is absent. The other four test files passed. There are 32 declared playground test cases by static `test(...)` count; 21 dashboard cases fail and the remaining 11 pass.

The independent scheduler, VM-info, and AAUI-specific scripts overlap files already included in `test:playground`; they were not rerun. Root coverage is 19 `tests/*.test.ts` files (45 cases). Playground coverage is 2 `testing/tests/*.test.mjs` and 3 `testing/aaui/tests/*.test.cjs` files. Root `npm test` does not include playground tests, confirming BV-OBS02.

## 5. Runtime Smoke Verification

| Check | Result | Evidence |
|---|---|---|
| Development startup and shutdown | PASS | `npm run dev` started on port 43871 with temporary DB/task/selection paths; Ctrl-C stopped the process |
| Development `GET /health` | PASS | HTTP 200, `{"status":"ok"}` |
| Generic Messaging HTTP submission | PASS | `POST /api/messages` returned 202 and the worker namespace received the matching envelope |
| Generic Messaging Socket.IO `/session` and `/worker` | PASS | Both namespaces connected; worker inbound `message` returned `{ok:true,data:...}`. Routing and namespace destinations are also exercised by passing `forwarding.test.ts` and `routing.test.ts`. |
| Compiled configured startup | FAIL | `npm start` cannot resolve `dist/main.js` |
| Compiled diagnostic startup and health | PASS | `node dist/src/main.js` served `/health` with HTTP 200 and stopped cleanly |
| Mock PServer session registration | PASS | Existing `pserver-session` and peer-forwarding tests confirmed outbound AAB connection over `/ws`, VM session registration, and session validation |
| EServer/SServer/AAUI peer connections and presence | PASS | Existing peer-connection and EServer-presence tests passed |
| Targeted peer delivery / multiple EServers | PASS | Existing tests confirmed ambiguous destination rejection and successful `toInstanceId` delivery |
| F03 / F04 | PASS | Existing test verified SServer scheduled status and EServer VM info reach AAUI |
| F08 task receipt and forwarding | PASS | Existing task-received routing tests confirmed persistence, received ACK, and asynchronous EServer forwarding; offline case separately reports forwarding failure |
| F09 task result receipt and forwarding | PASS | Existing F09 tests confirmed persistence/receipt and PServer forwarding behavior, including offline PServer case |
| Resource selection | PASS | Existing tests confirmed selection persistence and forwarding to mock PServer |
| PServer-to-AAUI task roundtrip | FAIL | `pserver-aaui-task-roundtrip.test.ts` failure described above |
| AAUI visual runtime | BLOCKED | Electron unavailable. Automated AAUI tests ran and include the dashboard failure above. |
| Production PServer compatibility | NOT RUN | All external service checks used local mock PServers only. |

The focused integration invocation covered 22 tests: 21 passed and the same PServer-to-AAUI task roundtrip test failed. Its results overlap the full root suite and are not added to the root suite totals.

## 6. Corrections and Rechecked Findings

| Finding | Final classification | Corrected result and evidence |
|---|---|---|
| Compiled entry point | CONFIRMED | Clean output is `dist/src/main.js`; configured `npm start` looks for missing `dist/main.js` and fails. The first report's inference is now runtime-confirmed. |
| Inbound work without ACK callback | CORRECTED: no processing when callback is absent | `peer-gateway.ts:400–401` and `pserver-connector.ts:105–111` both use `ack?.(await handleMessage(...))` / `ack?.(await gateway.receiveFromPServer(...))`. Because the `await` is an argument to an optional call, JavaScript skips argument evaluation when `ack` is nullish; the message-processing call does not run without an ACK callback. The first report incorrectly reasoned that the awaited expression always runs. |
| Native SQLite | CONFIRMED FUNCTIONAL | In-memory open and query succeeded using installed `better-sqlite3@12.11.1`. |
| Mutable state scope | CORRECTED / STATIC OBSERVATION | In application source, peer maps and transport state are created inside each `attachPeerGateway` invocation, and app services/stores are constructed inside `createApplication`; this is per-instance closure state, not shared mutable module-level state. The demo PServer has process-level `sessions`, `tasks`, `aabSocket`, and `activeSessionId` in `testing/pserver.mjs`, scoped to that demo process. The first report's broad mutable-global observation was too general. |
| Test command coverage | CONFIRMED | Root script includes only `tests/*.test.ts`; playground tests require their separate command. |
| `.env` auto-loading | CONFIRMED ABSENT (static) | Environment is read from `process.env`; no dotenv dependency/import was found. |

Documentation has current PServer `/ws` and default namespace guidance, but earlier README text and sections of the playground guide still describe superseded or contradictory demo flows. Current generic routing is the explicit `RouteRegistry` with default same-channel rules, not implicit broadcast to an arbitrary channel. Task receipt ACK means AAB acceptance/persistence; EServer/PServer forwarding status is reported separately. These are static documentation/source comparisons; no documentation was changed.

## 7. Cleanup and Final Workspace Verification

| Check | Result |
|---|---|
| App and test processes | PASS — development and diagnostic compiled apps were stopped; test commands exited; no task-started process remains |
| Temporary DB and JSON stores | Created only under `/tmp/aab-r6-0/runtime/`; scheduled for removal with temporary worktree cleanup |
| Worktree source changes | PASS — Git status remained clean; build output and `node_modules` are ignored artifacts |
| Original workspace changes | PASS — original HEAD and pre-existing modified/untracked files preserved |
| Application source/test/manifests | PASS — none modified |

The temporary worktree and `/tmp/aab-r6-0` verification resources are removed after this report is written. Original workspace state remains untouched apart from the requested new final report.

## 8. R6.1 Readiness

**BLOCKED.** The baseline has a confirmed typecheck/build failure, a configured startup entry-point mismatch, one failing root task roundtrip, and a failing dashboard state test file. Runtime checks otherwise demonstrate generic messaging and the principal mock-backed peer/task/resource workflows. Re-run baseline verification after those issues are resolved in a separately authorized phase; do not infer production PServer compatibility from mock verification.
