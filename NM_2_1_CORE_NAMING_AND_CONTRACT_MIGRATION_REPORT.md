# NM.2.1 Core Naming & Contract Migration Report

## 1. Baseline and worktree protection

- Repository `vutuantrung/base-aa-backend`; branch `main`; committed HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7` (requested baseline unchanged).
- Entry status had modified `docs/architecture/PROJECT_STATE.md` and `testing/pserver.mjs`; untracked NM.1/R8 planning reports, docs, prompt, feature template and flow doc. All were preserved. The existing `testing/pserver.mjs` diff includes a task-result handler/formatting change; it was not edited in NM.2.1.
- Entry default Node was v24.21.0/npm 11.19.0. All implementation verification used Node v22.23.5/npm 10.9.9 at the established installation path.
- Git index is read-only in this environment (`git mv` failed creating `.git/index.lock`). Renames were performed in the worktree and remain unstaged; no commit was made.

## 2. Implementation summary

- Renamed the CDC protocol module, connector, transport, example, backend mock, and related backend test paths. Updated imports, exports, app configuration, workflows and test manifest paths.
- Migrated backend peer IDs `aab→as`, `pserver→cdc`, `sserver→spa`, `aaui→aa`; EServer is unchanged. Updated peer schema/directory/auth, routing, presence, source authentication, `as:welcome`, ping identity, test fixtures and logs.
- Renamed CDC API symbols and config property `application.pserver→application.cdc`, app handle `pserverConnector→cdcConnector`, env variables `PSERVER_URL→CDC_URL`, `PSERVER_SOCKET_PATH→CDC_SOCKET_PATH`, `AAB_TASK_STORE_DIR→AS_TASK_STORE_DIR`, `AAB_SELECTION_STORE_DIR→AS_SELECTION_STORE_DIR`, and default VM identity `aab-demo-vm→as-demo-vm`. Explicit VM_UDID values and defaults for ports/path/feature modes remain unchanged.
- Updated M12/M13 identity-dependent logic, including `M13:aaui:`→`M13:aa:` and authenticated sender/fingerprint inputs. Hashing algorithms, task keys, reliable record formats, outbox behavior, ACK/retry semantics and persistence paths are unchanged.
- Renamed service labels/comments/errors to CDC/AS/SPA/AA where in backend source/tests. Preserved generic protocol keys, message fields, paths, events, architecture IDs and AA domain/SQLite naming.

## 3. Renamed paths

| Old | New |
|---|---|
| `src/modules/pserver/` | `src/modules/cdc/` |
| `src/modules/cdc/pserver-protocol.ts` | `src/modules/cdc/cdc-protocol.ts` |
| `src/infrastructure/socket/pserver-connector.ts` | `src/infrastructure/socket/cdc-connector.ts` |
| `src/infrastructure/socket/pserver-transport.ts` | `src/infrastructure/socket/cdc-transport.ts` |
| `src/examples/pserver-to-aaui.ts` | `src/examples/cdc-to-aa.ts` |
| `tests/support/mock-pserver.ts` | `tests/support/mock-cdc.ts` |
| `tests/pserver-protocol.test.ts` | `tests/cdc-protocol.test.ts` |
| `tests/pserver-session.test.ts` | `tests/cdc-session.test.ts` |
| `tests/pserver-aaui-task-roundtrip.test.ts` | `tests/cdc-aa-task-roundtrip.test.ts` |
| `tests/demo-pserver-aaui.test.ts` | `tests/demo-cdc-aa.test.ts` |
| `tests/aaui-resource-selection-routing.test.ts` | `tests/aa-resource-selection-routing.test.ts` |
| `tests/f03-sserver-routing.test.ts` | `tests/f03-spa-routing.test.ts` |

Other modified backend source/tests update the identifiers/contracts in place. `scripts/check-architecture.ts` now maps CDC connector/transport to M03, CDC contracts/protocol to M04, and the renamed example to Example. The M03/M04 IDs and ownership categories are unchanged.

### Changed files

- Checkpoint/tooling: `docs/architecture/PROJECT_STATE.md`, `docs/testing/R7_7_TEST_MANIFEST.json`, `scripts/check-architecture.ts`.
- App/config/example: `src/app/create-app.ts`, `src/app/lifecycle.ts`, `src/config/configuration.ts`, renamed `src/examples/cdc-to-aa.ts`.
- Socket infrastructure: `src/infrastructure/socket/peer-gateway.ts`, `resource-selection-snapshot.ts`, `socket-peer-gateway.ts`, `task-history-snapshot.ts`, plus renamed `cdc-connector.ts` and `cdc-transport.ts`.
- Modules: `src/modules/peer-messaging/{contracts,peer-destination-policy,peer-directory,peer-message-service}.ts`; `src/modules/resource-selection/{resource-selection-store,resource-selection-workflow}.ts`; `src/modules/task-workflow/{task-file-store,task-workflow}.ts`; renamed `src/modules/cdc/{contracts,cdc-protocol}.ts`.
- Persistence labels: `src/shared/persistence/{atomic-json-record-store,reliable-outbox-runner}.ts`.
- Tests modified in place: `tests/aa-catalog-boundary.test.ts`, `application-lifecycle.test.ts`, `application-peer-ack-drain.test.ts`, `application-surface-compatibility.test.ts`, `architecture-check.test.ts`, `configuration.test.ts`, `eserver-presence.test.ts`, `eserver-vm-info-forwarding.test.ts`, `f09-task-result-receipt.test.ts`, `multiple-eservers.test.ts`, `peer-connections.test.ts`, `peer-destination-policy.test.ts`, `peer-directory.test.ts`, `peer-forwarding.test.ts`, `peer-message-handler.test.ts`, `peer-message-service.test.ts`, `process-usage-repository.test.ts`, `reliable-crash-process.test.ts`, `reliable-outbox.test.ts`, `resource-selection-persistence.test.ts`, `resource-selection-snapshot-adapter.test.ts`, `resource-selection-workflow.test.ts`, `session-repository.test.ts`, `socket-peer-gateway-handshake.test.ts`, `socket-peer-message-delivery.test.ts`, `task-history-snapshot-adapter.test.ts`, `task-history-snapshot.test.ts`, `task-received-routing.test.ts`, `task-workflow.test.ts`, and `transformation-executor.test.ts`.
- Renamed tests/support: `tests/aa-resource-selection-routing.test.ts`, `cdc-aa-task-roundtrip.test.ts`, `cdc-protocol.test.ts`, `cdc-session.test.ts`, `demo-cdc-aa.test.ts`, `f03-spa-routing.test.ts`, `tests/support/mock-cdc.ts`.
- The pre-existing `testing/pserver.mjs` remains modified exactly as at entry and is not an NM.2.1 change.

## 4. Architecture and persistent state safety

- Architecture checker passes with 59 source files and 145 import/export edges (65 runtime, 80 type-only); zero runtime file SCCs. Existing module runtime SCC M10↔M12↔M13 and all-import SCC remain. M10↔M11 warning remains type-only. No responsibility/boundary rule was relaxed.
- The checker now examines cached plus unstaged/untracked current source paths and excludes cached paths removed from the working tree. This was necessary because the Git index is read-only and the checker previously tried to read the old renamed example path.
- No runtime DB or JSON records were opened, deleted, rewritten, migrated or replayed. Task/resource stores still use the same directory defaults and `.r7.5-outbox`; only env keys and identity-dependent M13 key/fingerprint inputs changed. Verification stores use existing test-created temporary directories. A controlled fresh-state operator choice is still required before deployment.
- SQLite table names and AA domain types (`AaConnection`, `AaBrowser`, `AaExtension`, `AaActivity`, `AaTask`, etc.) were preserved. M12/M13 ownership remains TBD; M14/M15 APP; M02 extraction deferred.

## 5. Verification

| Command | Result |
|---|---|
| `npm run typecheck` | PASS, Node 22.23.5 |
| `npm run build` | PASS, Node 22.23.5 |
| `npm run check:architecture` | PASS, 59 files / 145 edges; zero runtime file SCCs |
| `npm run test:manifest` | PASS, 55 manifest entries / 55 discovered tests; profiles fast 11, integration 16, full 55 |
| `npm run test:fast` | PASS, 89/89 tests, 11 backend files, zero skips |
| Focused affected backend loopback tests (10 files) | PASS, 21/21 tests, zero skips after authorized execution outside sandbox |
| `git diff --check` | Reports two trailing whitespace lines in pre-existing `testing/pserver.mjs` changes at lines 62 and 81; those lines were present at task entry and were preserved. No new report/source whitespace finding was reported by targeted checks. |

The focused loopback command selected `cdc-session`, `cdc-aa-task-roundtrip`, `demo-cdc-aa`, `aa-resource-selection-routing`, `peer-connections`, `peer-forwarding`, `task-received-routing`, `socket-peer-gateway-handshake`, `resource-selection-persistence`, and `application-peer-ack-drain` test files with Node's serial test runner. The first attempt failed because the sandbox returned listener `EPERM`; the exact set was rerun with approved execution and all passed. No full backend or playground suite was run. No unresolved backend regression was observed in executed verification.

## 6. Residual old-name inventory

Targeted case-sensitive scan covered `src/`, `tests/`, architecture checker and maintained manifest for `PServer|pserver|AAB|aab|SServer|sserver|AAUI|aaui` plus old env prefixes. No old component identity/name remains in migrated backend source or backend test content. Remaining matches are:

- `scripts/test-manifest.mjs:24` and `docs/testing/R7_7_TEST_MANIFEST.json:6,31,52` — discovery rule/paths under `testing/aaui/tests/`; standalone Electron suite is deferred to NM.2.2 and the directory remains unmoved.
- Existing modified `testing/pserver.mjs` — standalone CDC demo consumer, including its pre-existing worktree changes; deferred to NM.2.2 and preserved unchanged.
- `testing/aaui/`, `testing/package.json`, `testing/shared/create-peer-server.mjs`, `testing/sserver.mjs`, active demo docs, `scripts/package-for-arm.sh`, historical reports/prompts, and untracked planning docs are outside this batch (NM.2.2/NM.2.3/NM.3 or NP-02).
- `base-aa-backend`, `Aa*` domain/table names, generic message names and `HttpServer` identifiers are preserved by policy, not residual migration misses.

Standalone app paths in the manifest remain because changing them would cross into NM.2.2; the four renamed backend test paths are updated in the same manifest.

## 7. Deferred dependencies and worktree preservation

- **NM.2.2:** migrate CDC/SPA/EServer standalone demos as scoped, AA Electron peer/auth/event/IPC/preload API, demo commands, and their tests. `testing/pserver.mjs` must retain its pre-existing task-result work while being migrated.
- **NM.2.3:** migrate active docs, flow/inventory filenames and current terminology; historical reports/prompts remain unchanged under NP-02.
- **NM.3:** update ARM package names/application IDs and perform fresh deployment/deployment-gate coordination. No package was generated, deployment config changed, or external provider contacted here; D03 defers external verification.
- `docs/architecture/PROJECT_STATE.md` retains the pre-existing NM.1/R8 sections and has only a new NM.2.1 checkpoint inserted at the top. The original untracked reports/docs were not modified. `testing/pserver.mjs` remains byte-for-byte at its entry delta.
- Final HEAD remains `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; all task changes are unstaged/working-tree changes. No commit/push.

## 8. Acceptance recommendation

**PASS for the bounded NM.2.1 backend core scope.** Required typecheck, build, architecture, manifest, fast and affected backend integration checks pass. The intermediate migration state is not deployable: standalone consumers and deployment packages remain on old identities by design and must be migrated before an atomic release. Proceed only to the separately scoped NM.2.2 checkpoint when authorized; this task stops here.
