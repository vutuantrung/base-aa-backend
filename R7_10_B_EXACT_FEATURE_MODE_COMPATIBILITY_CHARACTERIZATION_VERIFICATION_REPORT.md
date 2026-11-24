# R7.10.B — Exact Feature-Mode Compatibility Characterization & Verification

**Disposition: GO FOR ARCHITECTURE OWNER REVIEW.** Characterization and authorized targeted tests are complete. This is not approval to change feature modes, APIs, ownership, or implementation. Stop here; do not begin R7.10.C or R7.11.

## Baseline and preservation

- Repository `vutuantrung/base-aa-backend`; branch `main`; actual committed HEAD `ea08e70f7855c96e8ce7ab18c83c224aada1f545`, matching expected baseline.
- Initial pre-existing worktree content from R7.10.A was preserved: modified `docs/architecture/PROJECT_STATE.md`; untracked A report, matrix, candidate prioritization and decision policy; supplied R7.10.A prompt. The B prompt supplied for this checkpoint remains unmodified in `prompts/`.
- No production source, public contracts/types, configuration defaults, manifest, scripts, package files, CI, schemas, test infrastructure, index, branch or commits changed. Two targeted assertions were added to existing tests only.
- R7.10.A reports/matrix/prioritization were not rewritten. Its decision policy received a new approval record at the bottom; its earlier recommendation snapshot remains intact.

## Approved decisions

The owner approved AS-D01=A, AS-D02=B, AS-D03=A, AS-D04=A, AS-D05=A (scoped), AS-D06=A. The accurate approval record is appended to [the A decision policy](docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md); its earlier proposal text, including its original AS-D02 recommendation, is retained as historical proposal text. The authorization covers this exact feature-mode characterization only. It does not authorize feature normalization, refactoring, ownership changes, R7.10.C, or R7.11.

## Characterization result

The [feature-mode matrix](docs/architecture/R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_MATRIX.md) records each result as source-confirmed, test-observed, not tested, or dependent on external peers/operators.

- CLI peer and SQLite flags enable only on exact string `'1'`. For peer mode, exact `'1'` sets top-level and nested flags and injects default PServer config; SQLite remains independently opt-in. Other representative strings (`undefined`, `'0'`, `'true'`, `' 1'`, `'1 '`, `'TRUE'`) remain disabled.
- Raw direct `createApplication` defaults SQLite to enabled; `resolveConfiguration({})` sets it false, so a direct `startApplication` using resolved defaults follows the disabled mode.
- Nested `application.enableTestPeers` controls peer gateway, `/peers`, M12/M13 workflow composition and eligibility for connector creation. Top-level `enableTestPeers` controls example registration after `onCreated` and before `listen`.
- Both mismatched programmatic combinations remain supported and distinct. Existing coverage proves top=true/nested=false registers the rule without a connector. The new reverse case proves top=false/nested=true starts a local `/peers` namespace, with no example rule and no PServer connector when PServer config is absent.
- A configured PServer connector is constructed only when nested peer mode and PServer config are both present. Construction is not connection: `connected` is false at factory return; M02 calls `connect()` during startup after gateway start, HTTP listen and gateway activation. Production PServer behavior remains external/unverified.
- `createApplication` creates an app-local empty transformation registry and does not implicitly register the example. Direct `startApplication` preserves the accepted R7.8 callback/registration/listen order. Main’s signal ownership and CLI path are source-inspected; the executable itself was not launched.
- SQLite-disabled repositories are absent, while HTTP routing, `/health`, authentication ordering and disabled-path responses retain existing contracts.

No behavior was normalized. M12/M13 remain TBD; M14/M15 remain APP; TD16 remains OPEN. M02 extraction stays DEFERRED—EQUIVALENCE NOT PROVEN. R7.5–R7.9 reliability, lifecycle, health, ACK, persistence and compatibility invariants remain unchanged.

## Targeted tests and verification

Existing configuration, application-surface, lifecycle, demo, HTTP and catalog tests already covered most mode behavior. Material gaps were (1) strict whitespace/case spellings across both CLI gates and (2) observable direct-start behavior for the reverse top/nested mismatch. The only test changes are:

- `tests/configuration.test.ts`: added one representative exact-string table for the two env gates and PServer default presence.
- `tests/application-surface-compatibility.test.ts`: added one loopback direct-start test for top-level false/nested true, using unique temporary workflow directories and no external PServer.

No test file, manifest row, profile, runner, or test script was added/changed. The new mismatch test proves local namespace availability only; it does not prove production PServer connection, hidden workflow object state, or deployment behavior.

Authoritative runtime: Node `v22.23.5`, npm `10.9.9`. Host execution was used for native SQLite and loopback checks.

| Gate / command | Result |
|---|---|
| Focused configuration: `node --import tsx tests/configuration.test.ts` | PASS 7/7, zero skipped. Complete log: `/tmp/r7_10_b_feature_modes/focused-configuration.log`. |
| Focused application surface on host: `node --import tsx tests/application-surface-compatibility.test.ts` | PASS 8/8, zero skipped. Complete log: `/tmp/r7_10_b_feature_modes/focused-application-surface-host.log`. |
| Sandboxed focused surface | Environment blocked. A captured run had 4/8 pass and 4 listener-dependent failures with exact `listen EPERM: operation not permitted 0.0.0.0`. Host run, maintained serial suite and Full pass. Log: `/tmp/r7_10_b_feature_modes/focused-application-surface-direct.log`. |
| `npm run check:architecture` | PASS on authorized host and in Fast/Full: 59 source files, 145 edges (65 runtime, 80 type-only), 0 runtime file SCCs, existing M10↔M12↔M13 module runtime SCC. Sandbox attempt failed `spawnSync git EPERM`; not counted as code failure. |
| `npm run test:manifest` | PASS, 55 entries match 55 discovered tests; profiles Fast 11, Integration 16, Full 55. No manifest changes. Complete log: `/tmp/r7_10_b_feature_modes/manifest.log`. |
| `npm run typecheck`; `npm run build` | PASS, exit 0. Logs: `/tmp/r7_10_b_feature_modes/typecheck.log`, `build.log`. |
| `npm run test:fast` | PASS 89/89, zero skipped, Node 22.23.5. A prior escalated run resolved Node 24 and was discarded; authoritative Node 22 complete log: `/tmp/r7_10_b_feature_modes/fast-node22.log`. |
| `npm run test:integration` | PASS backend 69/69 plus playground 32/32, zero skips; SQLite ABI127 preflight passed. Complete log: `/tmp/r7_10_b_feature_modes/integration-node22.log`. |
| `npm test -- --test-concurrency=1` | PASS 259/259, zero skipped. Complete log: `/tmp/r7_10_b_feature_modes/serial-node22.log`. |
| `npm run test:full`, attempts 1 and 2 of at most 3 | Both PASS backend 259/259 plus playground 32/32, zero skipped; SQLite preflight, architecture, typecheck and build pass. Logs: `/tmp/r7_10_b_feature_modes/full-attempt-01.log`, `full-attempt-02.log`. Attempt 1 metadata: `full-attempt-01-metadata.txt` (filesystem log creation/write timestamps; invocation timestamp not explicitly emitted). Attempt 2 complete UTC/environment metadata: `full-attempt-02-metadata.txt`. No third attempt. |
| `git diff --check`; `git diff --cached --check` | PASS, exit 0; staged/index state unchanged. New Markdown files were also scanned for trailing whitespace. |

An isolated single-file `node --test` sandbox invocation emitted only a generic file-worker failure; the direct captured run exposed the underlying loopback `EPERM`. This is not an application assertion failure: the same test passed on the host and passed again within the authoritative 259/259 serial and Full suites. An initial non-authoritative Fast host run used Node 24; it was discarded and repeated under Node 22.23.5.

Full attempts were deliberately limited to two. Attempt 1’s exact tool invocation start was not emitted before execution; its log creation and final write timestamps are recorded rather than invented. Attempt 2 has exact start/end metadata.

## Changed paths

- `tests/configuration.test.ts`
- `tests/application-surface-compatibility.test.ts`
- `docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md` (append approved AS record; preserve A proposal text)
- `docs/architecture/R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_MATRIX.md`
- `docs/testing/R7_10_B_FEATURE_MODE_CHARACTERIZATION_COVERAGE.md`
- `docs/architecture/R7_10_B_FEATURE_MODE_COMPATIBILITY_DISPOSITION.md`
- `R7_10_B_EXACT_FEATURE_MODE_COMPATIBILITY_CHARACTERIZATION_VERIFICATION_REPORT.md`
- `docs/architecture/PROJECT_STATE.md` (prepend current B status; retain A/R7.9 history)

The existing R7.10.A files and prompts remain present and intact. The supplied B prompt is preserved. No source, test infrastructure, package, manifest, CI, or public-contract changes occurred.

## Residual questions, disposition and rollback

**DONE:** representative CLI resolver values, SQLite factory/resolved defaults, both programmatic top/nested mismatch directions, demo registration order, peer namespace local availability, connector construction versus connection, and required maintained gates.

**DEFERRED:** launched CLI/main-process behavior and real PServer connection/session combinations; these require external peer/operator inputs. Internal runner state is not exposed through the public app API and was not given a new seam.

**UNKNOWN:** external callers and production feature-mode usage, deployed env values, target DB/store filesystems, remote protocol behavior. F1 original native DB handle closure and F2 asynchronous socket-close completion remain unproven. TD16, TD15/TD17 and other open debt remain open; this checkpoint closes none.

If rollback is required, revert only the two R7.10.B targeted test additions and B-only documentation/status/approval changes. Preserve all R7.10.A artifacts, R7.9 reports/policies/tests, accepted owner decisions and the supplied prompts. No commit or push was made.

**GO for Architecture Owner review only. Stop here. R7.10.C and R7.11 have not started and are not authorized.**
