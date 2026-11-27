# R6.0 — Regression Baseline Completion Report

**Date:** 2026-11-19  
**Repository:** `base-aa-backend`  
**Branch / implementation baseline:** `main` / `6fde2347a3a78301811f055a9245f05998331ef6`  
**Runtime:** Node.js `v22.23.5`, npm `10.9.9`

## Outcome

The required regression baseline is complete on Node 22. The clean isolated copy installed dependencies with the committed lockfile, passed typecheck and build, independently opened and queried the native SQLite binding, and passed both complete test suites. Existing startup and credential logging fixes were carried into the isolated copy and preserved.

R6.1 readiness: **READY to begin**, with the deferred issues below explicitly remaining out of scope. No application behavior or dependency versions were changed for the Node 24 test-worker assertion. No commit or push was made.

## Isolated runtime verification

Git worktree creation was unavailable because `.git` metadata is read-only. Verification instead used a clean archive of the requested baseline in `/tmp/aab-r6-regression`, with the existing `package.json` startup fix and PServer credential-log fix, plus the two scoped test fixes in this report copied into it. No pre-existing `node_modules` or build output was used.

| Command/check | Result |
|---|---|
| `npm ci` | **PASS** — 139 packages installed from the committed lockfile; no vulnerabilities reported. |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Native SQLite independent smoke check | **PASS** — loaded `better-sqlite3`, opened `:memory:`, ran `SELECT 1`, received `{"value":1}`, and closed the database. |
| `npm test -- --test-concurrency=1` | **PASS** — 45 passed, 0 failed, 0 cancelled, 0 skipped. |
| `npm --prefix testing run test:playground` | **PASS** — 32 passed, 0 failed, 0 cancelled, 0 skipped. |

The sandbox initially denied local TCP listener creation, causing integration tests to fail before reaching their assertions. Both complete suites were rerun outside the sandbox on Node 22; the results above are from those successful runs. Node 24 native `InternalCallbackScope::Close()` assertions are therefore treated as a Node 24 runtime/test-worker incompatibility, not worked around in application code or dependencies.

## Confirmed root causes and corrections

### Legacy task roundtrip contract

The prior test expected a PServer task to be delivered to AAUI as `automation.task.request`, then expected AAUI to return a finished task to PServer. Current F08/F09 implementation and workflow tests specify a different business flow: PServer sends a task through AAB to a selected EServer; AAB persists and ACKs receipt and emits task lifecycle notifications to AAUI. EServer returns the finished task through AAB to PServer; AAB persists and ACKs receipt and emits result lifecycle notifications to AAUI. `tests/task-received-routing.test.ts`, `tests/f09-task-result-receipt.test.ts`, source lifecycle handlers, and the AAUI dashboard/tests confirm this contract.

The legacy test was therefore superseded. It now verifies the current F08/F09 flow, including EServer delivery, AAB persistence, receipt ACKs, PServer result delivery, and AAUI task/result lifecycle events. Its meaningful end-to-end assertions remain in place; application behavior was not changed.

### AAUI dashboard CommonJS/ESM incompatibility

`testing/package.json` declares the playground as ESM, while `dashboard-state.js` is intentionally a browser-compatible UMD/CommonJS helper and the existing `.cjs` test loads it with `require()`. Node consequently interpreted that `.js` file as ESM and did not provide the expected CommonJS API. Added `testing/aaui/package.json` declaring the AAUI subtree as CommonJS. This gives the existing helper and `require()` test matching Node module semantics, without changing browser code or dashboard behavior. All existing dashboard assertions pass unchanged.

## Changed files

- [package.json](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/package.json) — preserved the prior fix to target `dist/src/main.js` from `npm start`.
- [pserver-connector.ts](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/src/infrastructure/socket/pserver-connector.ts) — preserved the prior fix that excludes `apiKey` from configuration logging.
- [pserver-aaui-task-roundtrip.test.ts](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/tests/pserver-aaui-task-roundtrip.test.ts) — revised the obsolete test to assert the current F08/F09 workflow and AAUI lifecycle notifications.
- [testing/aaui/package.json](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/testing/aaui/package.json) — scopes CommonJS interpretation to the AAUI subtree so the dashboard-state test can load the existing helper.
- [R6_0_REGRESSION_BASELINE_REPORT.md](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/R6_0_REGRESSION_BASELINE_REPORT.md) — this report.

`package-lock.json` and SQLite implementation/dependencies were not changed.

## Messaging and peer communication regression

The passing root suite includes generic routing/forwarding, PServer session registration, PServer peer delivery in both directions, peer authentication/presence, multi-EServer delivery, F03/F04, F08/F09 task lifecycle and resource-selection coverage. All passed in the complete 45-test run. The task regression now directly verifies PServer→AAB→EServer and EServer→AAB→PServer while checking AAUI notifications. Production PServer compatibility remains outside these mock-backed tests.

## Deferred issues

- **Automatic `.env` loading:** remains absent; configuration continues to read `process.env`.
- **Optional ACK callback:** when a peer message arrives without an ACK callback, the current optional call skips evaluating its awaited handler argument, so message processing does not occur. Behavior is unchanged.
- **Node 24 worker assertions:** still an environment/runtime issue; this baseline was run successfully on the required Node 22 runtime.
- Production PServer compatibility and Electron visual runtime were not exercised.
- SQLite architecture, production protocol, ARM integration, module boundaries, and other deferred changes were untouched.

## R6.1 readiness

**READY.** Node 22 lockfile installation, typecheck, build, independent native SQLite binding check, root regression suite, and playground suite all pass. Existing architecture, startup behavior, credential handling, messaging contracts, and business behavior are preserved outside the test updates described above.
