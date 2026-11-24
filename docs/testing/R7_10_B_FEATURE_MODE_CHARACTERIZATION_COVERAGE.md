# R7.10.B — Feature-Mode Characterization Coverage

**Status:** targeted characterization tests added to two existing files; no new test file or manifest/profile/runner changes. Baseline committed source remains `ea08e70f7855c96e8ce7ab18c83c224aada1f545`. R7.10.A dirty documentation was preserved.

## Existing coverage and material gaps

| Existing source/assertion | Prior evidence | Gap identified | Minimal addition |
|---|---|---|---|
| `tests/configuration.test.ts`: resolver defaults, custom env, `'0'`, `'true'`, exact `'1'`, PServer values | Resolver-level tests, no actual `main.ts` launch | Strict comparison was not asserted for whitespace, case and trailing-space spellings across both peer/SQLite gates. | Added one table over absent, `'0'`, `'true'`, `' 1'`, `'1 '`, `'TRUE'`, and `'1'`, checking both flags and PServer default presence. |
| `tests/application-surface-compatibility.test.ts`: direct `createApplication` SQLite overloads, connector conditions, F1/F2, top=true/nested=false direct start ordering | Existing surface contract tests | Reverse mismatch top=false/nested=true through `startApplication` was inferred from composition; lacked observable proof that `/peers` works while demo registration and PServer are absent. | Added a single isolated loopback test with temporary workflow directories, no PServer config, checking empty registry in callback/after startup, undefined connector, and local AAUI `/peers` connection. |
| `tests/demo-pserver-aaui.test.ts` | Local mock PServer session, explicit example registration, transform output/ACK | Does not establish executable CLI launch or production PServer behavior. | No test added; source/config tests cover resolver, and external mode remains explicitly unverified. |
| HTTP/SQLite tests | Exact auth-first disabled response, health and repository availability | No feature mode gap requiring a test. | No change. |

The tests use existing public configuration and interfaces. The loopback assertion verifies only local namespace availability; it does not prove remote peer readiness, app-internal workflow objects through public API, PServer connection, or deployment behavior. No sleeps, guessed async cleanup, test-only production seam, assertion weakening, manifest edits or profile changes.

## Verification evidence

Authoritative environment: Node `v22.23.5`, npm `10.9.9`. Host runs were used for listener/native SQLite/process support. Complete logs are under `/tmp/r7_10_b_feature_modes/`; the raw directory may not persist across handoff, so principal outcomes and the observed sandbox failure are recorded here.

| Command / gate | Observed result |
|---|---|
| `node --import tsx tests/configuration.test.ts` | PASS 7/7, zero skipped. Log: `/tmp/r7_10_b_feature_modes/focused-configuration.log`. |
| `node --import tsx tests/application-surface-compatibility.test.ts` (host) | PASS 8/8, zero skipped. New reverse-mismatch test passed. Log: `/tmp/r7_10_b_feature_modes/focused-application-surface-host.log`. |
| Same surface file in sandbox | Environment-blocked: captured direct attempt 4/8; four listener-dependent cases reported `listen EPERM: operation not permitted 0.0.0.0`. Host focused rerun and maintained serial/Full gates passed. Log: `/tmp/r7_10_b_feature_modes/focused-application-surface-direct.log`. |
| `npm run check:architecture` | Sandbox invocation failed `spawnSync git EPERM`; authorized host rerun and Fast/Full architecture stages passed: 59 files, 145 edges (65 runtime / 80 type-only), zero runtime file SCC, existing module runtime SCC M10↔M12↔M13. |
| `npm run test:manifest` | PASS, 55 entries/55 discovered; profiles Fast 11, Integration 16, Full 55. No new row was needed because only existing test files changed. Log: `/tmp/r7_10_b_feature_modes/manifest.log`. |
| `npm run typecheck`; `npm run build` | PASS, exit 0. Logs: `typecheck.log`, `build.log` in same directory. |
| `npm run test:fast` under Node 22.23.5 | PASS 89/89, zero skipped (11 selected files). One initial escalated run resolved Node 24 and was discarded as non-authoritative; Node 22 rerun is `fast-node22.log`. |
| `npm run test:integration` under Node 22.23.5 | PASS backend 69/69 + playground 32/32, zero skipped; SQLite ABI127 preflight passed. Log: `integration-node22.log`. |
| `npm test -- --test-concurrency=1` under Node 22.23.5 | PASS 259/259, zero skipped. Log: `serial-node22.log`. |
| `npm run test:full` attempts 1 and 2 under Node 22.23.5 | Both PASS backend 259/259 + playground 32/32, zero skipped; preflight, architecture, typecheck/build passed. Logs: `full-attempt-01.log`, `full-attempt-02.log`; attempt 2 complete metadata: `full-attempt-02-metadata.txt`. Two of the three allowed attempts used. |

Attempt 1 log creation/write timestamps are available from filesystem metadata but were not written into a dedicated pre-run metadata file. Attempt 2 captured exact UTC start/end, branch, HEAD, dirty paths, Node/npm, test SHA-256, command and exit. No failing test identity occurred in authoritative host tests. Sandbox `EPERM` is an environment limitation, not counted as application assertion failure.

## Evidence classification

- **DONE:** resolver equality classes; direct factory SQLite default and disabled handles; connector condition and constructed/not-connected distinction; both top/nested mismatch directions; demo callback/registration/listen order for the tested representative; local `/peers` availability in nested-only mode; maintained verification gates.
- **DEFERRED:** live CLI executable launch and real PServer session under all combinations; would require external service/operator inputs and is not necessary to confirm source boundary.
- **UNKNOWN:** external API consumers, production feature-mode usage, remote peer compatibility, deployment filesystem/runtime targets, and F2 asynchronous Socket.IO cleanup completion. Existing F1/F2 limits and TD16 ownership/caller questions remain.

No R7.5–R7.9 invariant, public contract, feature gate, default, or module owner changed. The test additions do not close TD16 or authorize any follow-on checkpoint.
