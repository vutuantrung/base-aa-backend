# NM.2.2 Demo & Consumer Migration Report

## 1. Baseline and worktree protection

- Branch `main`; committed HEAD remains `72b31e54e266743fbfd18b6169e4a85c843ddeb7` (requested baseline). Node `v22.23.5` was used.
- Entry worktree already contained NM.2.1 source/test/tooling edits, untracked NM.1/NM.2.1 reports and R8.0 planning artifacts, and `PROJECT_STATE.md` edits. No reset, stash, discard, commit, or pre-existing document rewrite was done.
- The previously modified `testing/pserver.mjs` was renamed to `testing/cdc.mjs`. Its task result validation, status transition checks, task retention, ACK behavior, dispatch behavior and existing comments were carried forward. Its pre-existing behavior was inspected before migration; only component identity and service-specific labels/contracts were changed.
- NM.2.1 CDC source is present at `src/modules/cdc/`, `src/infrastructure/socket/cdc-transport.ts`, and `src/infrastructure/socket/cdc-connector.ts`. Existing NM.2.1 changes were retained.

## 2–6. Demo, consumer and utility migration

- CDC: `testing/cdc.mjs` now authenticates AS as `as`, serves as `cdc`, and uses new `from`/`to` identities while retaining port 3001, `/ws`, `/`, session registration/resumption, task dispatch/result handling, and generic Socket.IO events.
- EServer: `testing/eserver.mjs` remains the same application/file and connects through the shared AS consumer; `eserver` logical IDs, multiple-instance behavior, VM reporting, task receipt/result handling, scheduling and port 3002 remain.
- SPA: `testing/spa.mjs` uses peer identity `spa`, AS connection and AA routing; F03 behavior and port 3003 remain.
- AA Electron: `testing/aa/` replaces `testing/aaui/`. Main/preload/renderer/state/tests use peer `aa`, AS peer `as`, `AS_URL`, `asConnected`, `as:welcome`, `aa:*` IPC, `window.aa`, and `AAState`. Context isolation and existing renderer behavior remain.
- Shared utilities: `testing/shared/create-peer-server.mjs` uses `AS_URL`, listens for `as:welcome`, and preserves generic ping/message, scheduling and payload contracts. Mock VM info, scheduled messaging and resource/task flow helpers retain their behavior.
- Path mapping: `testing/pserver.mjs`→`testing/cdc.mjs`; `testing/sserver.mjs`→`testing/spa.mjs`; `testing/aaui/`→`testing/aa/`; the three Electron tests moved under `testing/aa/tests/`. Backend test/mock path renames from NM.2.1 remain in place.
- Startup scripts in `testing/package.json`: `pserver`→`cdc`, `sserver`→`spa`, `aaui`→`aa`; `eserver` unchanged. Commands are `npm --prefix testing run cdc|eserver|spa|aa`; ports remain 3001–3004.

## 7–10. Contracts, tooling and boundaries

- Peer identity and wire mapping: `aab→as`, `pserver→cdc`, `sserver→spa`, `aaui→aa`; `eserver` unchanged. AS produces `as:welcome`; CDC's local demo welcome remains service-specific `cdc:welcome`. Generic `peer:message`, `peer:ping`, task/session events, `/ws`, `/`, routing fields and payload schemas are retained. The shared AS consumers and Electron AA consume `as:welcome`.
- Electron IPC producers and consumers were changed together: `aaui:*`→`aa:*`, preload API `window.aaui`→`window.aa`; renderer and tests use the same new names.
- Manifest/discovery references now point to `testing/aa/tests/` in `scripts/test-manifest.mjs` and `docs/testing/R7_7_TEST_MANIFEST.json`. `test:playground` and `test:aa` use the new paths. Existing coverage was retained.
- NM.2.1 architecture checker source-discovery changes remain intact. No checker redesign, CI change or ARM packaging change was made in this phase.
- Existing module identities and boundaries remain: M03/M04 IDs and responsibility ownership are unchanged; no generic protocol, event, namespace, port, or architecture ID was renamed. ACK, retry, delivery, lifecycle, feature-mode, persistence, F08/F09, and resource-selection behavior were not intentionally changed.

## 11–14. Verification and state safety

- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `npm run check:architecture` — PASS: 59 source files, 145 resolved edges; 0 runtime file SCCs; existing M10↔M12↔M13 module runtime SCC and M10↔M11 type-only warning remain.
- `npm run test:manifest` — PASS: 55 manifest entries / 55 discovered.
- `npm run test:fast` — PASS: 89/89, 0 skipped.
- `npm run test:integration` — PASS: backend 69/69 and playground 32/32, 0 skipped.
- `npm run test:full` — PASS after two migrated diagnostic expectation casing corrections: backend 259/259 and playground 32/32, 0 skipped. Initial failures were only expected error text casing (`Cdc` vs target `CDC`), corrected in `tests/application-surface-compatibility.test.ts` and `tests/cdc-protocol.test.ts`; no assertion was weakened.
- `npm --prefix testing run test:aa` — PASS: 3/3, 0 skipped.
- `git diff --check` — PASS.
- These are automated backend loopback/mock tests and Electron unit tests. No manual five-standalone-process run or graphical Electron launch was performed; graphical startup remains unverified in this execution.
- Runtime data was not opened, deleted, migrated, or replayed. Verification uses existing suite isolation/temporary test state. Fresh ARM deployment and controlled fresh runtime state remain required before release; existing state must not be automatically removed or replayed.

## 15–17. Residual names, dependencies and issues

- Active source, backend test content, demo implementation and required test tooling have no residual old service identities. Case-insensitive matches among current code include generic `HttpServer`, preserved AA domain identifiers/tables (`AaBrowser`, `AaConnection`, etc.), and not old service naming.
- Old names remain in `testing/README.md` as active documentation deferred to NM.2.3; historical reports/prompts and repository name are preserved under NP-01/NP-02. The untracked `docs/flows/DF-07_PSERVER_TASK_REQUEST_INTEGRATION.md` is active documentation and deferred to NM.2.3.
- ARM packaging/configuration and new ARM application IDs are unmodified and deferred to NM.3. External ARM integration dependencies and deployment behavior remain unverified.
- Electron tests ran; graphical startup, actual separately launched five-application interoperability, external deployments, and runtime state inventory remain unverified. No unresolved automated backend regression remains.
- M12/M13 ownership remains TBD; M14/M15 remain APP; M02 extraction remains deferred. No architecture redesign was performed.

## 18. Acceptance recommendation

**PASS for the bounded NM.2.2 demo and consumer migration.** Required automated backend and playground verification passes. Manual/graphical startup and external ARM verification are deployment-gate evidence, not claims of this report. The integrated migrated code is ready for subsequent scoped documentation work; do not deploy an intermediate naming state.
