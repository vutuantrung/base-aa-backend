# R6.0 — Baseline Stabilization Report

**Date:** 2026-11-19  
**Repository:** `base-aa-backend`  
**Branch / implementation baseline:** `main` / `6fde2347a3a78301811f055a9245f05998331ef6`  
**Architecture baseline:** `82b6cb68e2016594d42731c2ae022ce43b638557`

## Summary

The requested implementation baseline matches HEAD and was clean before this task. The committed lockfile installs successfully. Typecheck and build pass. Two narrow defects were corrected: the `start` script pointed at the wrong emitted file, and PServer configuration logging included the API key. SQLite-disabled startup now reaches the server listen point through `npm start`.

R6.1 readiness is **BLOCKED** by the confirmed task roundtrip and AAUI dashboard-state failures, Node 24 native SQLite test-worker assertions, and the remaining unresolved behavior described below. No architectural extraction, ARM changes, semantic behavior changes, commit, or push was made.

## Git and dependency baseline

- `git status --short --branch` initially reported `## main...origin/main`, with no changed or untracked files.
- HEAD was `6fde2347a3a78301811f055a9245f05998331ef6`, matching the requested implementation baseline.
- `npm ci` completed from the committed `package-lock.json` (139 packages added; 0 reported vulnerabilities). It warned that install scripts for `better-sqlite3` and `esbuild` were not approved by npm's script policy; dependency installation itself succeeded.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.

## Fixes

| Issue | Change | Result |
|---|---|---|
| `npm start` expected `dist/main.js`, while TypeScript emits `dist/src/main.js` | Updated `package.json` start target | `ENABLE_SQLITE=0 PORT=43873 DB_PATH=/tmp/r60-baseline-disabled.sqlite timeout 4s npm start` logged `Server listening on http://localhost:43873`. It was stopped by the expected timeout. |
| PServer config log printed the full config, including `apiKey` | `connectToPServer` now logs a copy without `apiKey` | Secret is excluded from that configuration log; authentication still receives the original key. |

Changed implementation files: [package.json](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/package.json) and [pserver-connector.ts](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/src/infrastructure/socket/pserver-connector.ts). The committed lockfile did not need modification. This report is the other new file.

## Test findings

| Verification | Result | Notes |
|---|---|---|
| Root test suite, serial (`npm test -- --test-concurrency=1`) | **FAIL / incomplete** | Node 24 emitted `InternalCallbackScope::Close()` assertions in SQLite-related workers; the command did not complete and was interrupted. This reproduces the existing report's worker failure. |
| PServer-to-AAUI task roundtrip | **FAIL confirmed by prior baseline run; current isolated run blocked** | Existing final verification report records `tests/pserver-aaui-task-roundtrip.test.ts` failing because the AAUI request is rejected and no result arrives. A direct rerun in this checkout did not yield a result before the test process stalled amid native worker assertions. The test and assertions were preserved. |
| Playground suite (`npm --prefix testing run test:playground`) | **FAIL** | 4 of 5 files pass; `testing/aaui/tests/dashboard-state.test.cjs` fails because the ESM package does not expose the dashboard state API as CommonJS. |
| Generic HTTP and Socket.IO messaging | **PASS per existing verification report** | HTTP message submission and Socket.IO session/worker routing passed in the prior detailed R6.0 run. |
| PServer registration and peer messaging | **PASS per existing verification report** | Mock PServer registration, reverse-direction delivery, peer presence, and targeted instance delivery passed. Production PServer compatibility was not exercised. |
| PServer task/result and resource workflows | **PASS per existing verification report, with roundtrip exception above** | F03/F04/F08/F09 and resource-selection checks passed against local mocks; the specified PServer-to-AAUI roundtrip failed. |

## SQLite modes

- **Disabled mode:** `npm start` with `ENABLE_SQLITE=0` started and logged its listener using the corrected compiled entry. The earlier isolated disabled-install verification report records `/health` returning 200, SQLite-backed routes returning 503 with `SQLITE_DISABLED`, and no database file created.
- **Enabled mode:** Existing SQLite implementation report records successful in-memory database open/schema/close and startup failure with the intended unavailable-dependency error when SQLite is enabled in an install omitting optional dependencies. The current `npm ci` run warned that native install scripts were not approved, so this run did not independently revalidate the native binding.
- **Test limitation:** Full SQLite test-suite confirmation remains blocked by the Node 24 worker assertion; this is not evidence that the SQLite mode itself is broken.

## Confirmed remaining issues and behavior notes

- `testing/aaui/tests/dashboard-state.test.cjs` assumes CommonJS exports from `dashboard-state.js`, but `testing/package.json` sets `type: module`. Fixing module semantics is a separate change and was not included.
- The PServer-to-AAUI task roundtrip's expected flow is rejected by current task receipt/forwarding behavior. Changing that flow would change semantics and needs approval; no behavior was altered here.
- When a peer message arrives without an ACK callback, `ack?.(await gateway.receiveFromPServer(value))` does not evaluate the awaited argument. Message processing therefore does not occur in that case. This optional-ACK behavior is reported for review and was not changed.
- No automatic `.env` loading is configured: settings are read from `process.env`, and no dotenv import/dependency was found. This was not changed.
- The Node.js native assertion prevents a complete root suite result and remains an environment/runtime blocker.
- Electron was unavailable in the prior verification, so AAUI visual runtime remains unverified.

## R6.1 readiness

**BLOCKED.** The startup path, credential logging, clean lockfile install, typecheck, build, and SQLite-disabled launch are verified. Before R6.1, resolve or explicitly accept the task roundtrip and dashboard test failures, and obtain a complete root suite run without the Node 24 native worker assertion. Production PServer compatibility and visual AAUI runtime also remain unverified. Preserve architecture boundaries and obtain approval before any semantic changes to task handling or optional ACK behavior.
