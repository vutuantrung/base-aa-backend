# R7.8 — Final Closure & Verification Report

## Recommendation: CONDITIONAL GO for final architecture owner review

The approved R7.8 scope is documented and verified. C-D01/A, C-D02/A and C-D03/A are accepted in the ADR. The existing lifecycle-to-example dependency is intentionally retained as a bounded compatibility exception; no extraction occurred. **R7.8 is closed within owner-approved scope only upon final reviewer acceptance.** R7.9 is NOT STARTED / NOT AUTHORIZED.

## Baseline and worktree preservation

- Repository `vutuantrung/base-aa-backend`; branch `main`; expected and actual committed HEAD `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`.
- Verification runtime: Node `v22.23.5`, npm `10.9.9`, Linux host. Full profile’s native SQLite preflight loaded `better-sqlite3` (ABI 127) and passed in-memory open/query/close.
- Initial status included staged R7.8.A additions/modifications, unstaged R7.8.B/C documentation/test changes, and untracked R7.8.B/C reports, matrix, ADRs and prompts. All were preserved; no reset, stage/unstage, commit or push occurred. Existing B characterization edits in `tests/` were not changed during final closure.
- A separate pre-existing R7.2 prompt pair was present: tracked root prompt marked deleted and replacement prompt untracked under `prompts/`. Both states were preserved untouched.
- Final status contains only the same pre-existing R7.8 source/test/documentation artifacts, the R7.8 governance-document updates listed below, and this report. No `src/`, `testing/`, `scripts/`, package, lockfile, or CI changes were made in this checkpoint. `npm run build` wrote only ignored build output.
- Exact initial staged paths: `R7_8_A_DEMO_EXTRACTION_ARCHITECTURE_DISCOVERY_REPORT.md`; `docs/architecture/PROJECT_STATE.md`; `docs/architecture/R7_8_DEMO_BOUNDARY_INVENTORY.md`; `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md`; `docs/architecture/R7_8_RUNTIME_COMPOSITION_AND_DEPENDENCIES.md`; `docs/architecture/TECHNICAL_DEBT.md`; `prompts/R7_8_A_DEMO_EXTRACTION_ARCHITECTURE_DISCOVERY_CODEX_PROMPT.md`.
- Exact initial unstaged tracked paths: `docs/architecture/MODULE_BOUNDARIES.md`, `docs/architecture/PROJECT_STATE.md`, `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md`, `docs/architecture/TECHNICAL_DEBT.md`, and `tests/{application-surface-compatibility,configuration,demo-pserver-aaui}.test.ts`; the staged R7.8.A documents above also had pre-existing worktree deltas where status showed `MM`/`AM`.
- Exact initial untracked R7.8 paths: root B and C reports; `docs/architecture/R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md`; `docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md`; B/C prompt files and the supplied final prompt under `prompts/`. The R7.2 deleted-root/untracked-replacement prompt pair remained unrelated and untouched. The final dirty path set adds only this report and the current documentation edits listed below; no stage operation changed any index entry.

## Owner-approved decisions and dispositions

| Decision | Accepted disposition |
|---|---|
| ES-D01=A | Classify by behavior, supported runtime contract and state ownership. |
| ES-D02=C scoped | M12 mixed-split remains a hypothesis; M12 formal ownership remains **TBD**. No workflow/store/F08/F09/ACK/outbox movement. |
| ES-D03=C scoped | M13 mixed-split remains a hypothesis; M13 formal ownership remains **TBD**. No workflow/store/ACK/outbox movement. |
| ES-D04=A | M14 Generic Session is **APP**; retain `/api/sessions`, SQLite and API semantics. |
| ES-D05=A | M15 Process Usage is **APP**, distinct from M18; retain `/api/process-usage`, SQLite and API semantics. |
| ES-D06=A | Preserve exact `ENABLE_TEST_PEERS === '1'`, programmatic top-level/nested distinction, CLI PServer default and SQLite defaults. |
| ES-D07=A | Keep separate `testing/` package/processes; no APP→`testing/` import or workspace. |
| ES-D08=A | Incremental, compatibility-first checkpoints, assertion preservation and rollback. |
| C-D01=A | Retain and document the bounded `src/app/lifecycle.ts` → `src/examples/pserver-to-aaui.ts` compatibility exception. |
| C-D02=A | Preserve implicit demo registration for direct `startApplication()` callers. |
| C-D03=A | Preserve the app-local `TransformationRegistry`; no global/ambient registration. |

The accepted record is [R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md](docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md). The decision closes ownership of this registration seam, not the broader TD16 concerns or the M12/M13 classification questions.

## Final boundary and compatibility audit

- `src/app/lifecycle.ts` remains the sole application static importer of `src/examples/pserver-to-aaui.ts`. The example is not imported into `createApplication()`. No static APP→`testing/` import was found. The emitted `dist/src/app/lifecycle.js` retains the example import; the separate `testing/` package scripts/dependencies and process boundary are unchanged.
- Observable order remains `createApplication(configuration.application)` → `onCreated(application)` → register iff top-level `configuration.enableTestPeers` → `application.listen(configuration.port)`. `onCreated` sees the same live app before registration; direct `startApplication()` retains implicit registration. Direct `createApplication()` does not register the example. Public signatures and `ApplicationInstance` remain unchanged.
- The top-level flag controls example registration; nested `application.enableTestPeers` independently controls `/peers` and M12/M13 construction. A PServer connector additionally requires PServer config. CLI exact `'1'` sets both flags and supplies the default URL/path/VM; direct callers may supply mismatched flags or omit PServer. CLI SQLite defaults disabled unless `'1'`; direct factory SQLite defaults enabled unless disabled.
- The app-local demo rule remains `demo-pserver-to-aaui-modified-param`, priority 10, `pserver`→`aaui`, payload type `demo.modified-param`. It adds `modifiedParam: "AAB modified: <originalParam>"`; invalid `originalParam` preserves its exact failure. Existing wire coverage confirms successful ACK/message ID identity and `processedBy`; nonmatching messages pass through.
- M12/M13 workflow, store, outbox, named-peer and durable-path ownership is unchanged (`AAB_TASK_STORE_DIR` / `AAB_SELECTION_STORE_DIR`, with existing defaults). M14/M15 HTTP/SQLite behavior remains independent of the peer gate. No API, wire, auth/status, feature-gate, data or build/package policy changed.
- The known callback boundary remains: `onCreated` and registration are outside the lifecycle’s `listen()` try/catch. Callback throw and duplicate-rule cleanup are not fully tested. This is documented; error handling was not changed.

The full evidence labels and per-combination cases are in [R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md](docs/architecture/R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md). M12/M13 remain **TBD**, M14/M15 remain **APP**. TD16 remains **OPEN**: approval accepts the import exception but does not resolve the broad gate, flag split, M12/M13 ownership or unknown external consumer inventory.

## Governance/documentation delta

Changed during this checkpoint (documentation plus this report only):

- `docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md` — status ACCEPTED, exact approvals, bounded exception, future reconsideration trigger and exception-boundary gap.
- `docs/architecture/R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md` — accepted decision status; retain-model parity clarified.
- `docs/architecture/PROJECT_STATE.md` — current closure section and verification status; former B/C pending sections labeled historical; R7.9 remains unauthorized.
- `docs/architecture/MODULE_BOUNDARIES.md` — records accepted M02 exception; M12/M13 remain TBD and M14/M15 APP.
- `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md` — resolves stale M14/M15 TBD language and records accepted C decisions.
- `docs/architecture/R7_8_RUNTIME_COMPOSITION_AND_DEPENDENCIES.md` — describes the accepted exception as retained, not an open extraction blocker.
- `docs/architecture/R7_8_DEMO_BOUNDARY_INVENTORY.md` — identifies candidate labels as the historical discovery snapshot and links current approved classifications.
- `docs/architecture/TECHNICAL_DEBT.md` — updates TD16 to record accepted exception and remaining open questions; TD16 stays OPEN.
- `R7_8_FINAL_CLOSURE_VERIFICATION_REPORT.md` — this report.

The earlier R7.8.A discovery report, R7.8.B verification report and R7.8.C pre-approval report were not rewritten. Their historical results and transient outcomes remain intact. The staged index was not modified; edits to staged-added documentation are additional worktree changes, not staging operations.

## Verification

All final test gates used Node `v22.23.5` / npm `10.9.9`. Commands that required Git subprocesses, listeners, child processes or SQLite ran with authorized host execution. Exit codes and counts:

| Command | Result |
|---|---|
| `node --version`; `npm --version` | `v22.23.5`; `10.9.9`. |
| `git diff --check` | PASS, exit 0 (unstaged/worktree diff). |
| `git diff --cached --check` | **FAIL, exit 2**, only because the preserved staged R7.8.A prompt has trailing whitespace at lines 5–8. It was not edited because the staged discovery artifact must be preserved. |
| `npm run check:architecture` | PASS, exit 0: 59 source files, 145 edges (65 runtime / 80 type-only), 0 runtime file SCCs. Existing M10↔M12↔M13 module runtime SCC and M10↔M11 type-only warning remain. |
| `npm run test:manifest` | PASS, exit 0: 55/55 entries; Fast 11, Integration 16, Full 55. |
| `npm run typecheck`; `npm run build` | PASS, exit 0. |
| `npm run test:fast` | PASS, exit 0: 88/88, 0 skipped. |
| `npm run test:integration` | PASS, exit 0: 69/69 backend + 32/32 playground, 0 skipped; native SQLite preflight passed. |
| `npm run test:full` | PASS, exit 0: 255/255 backend + 32/32 playground, 0 skipped; SQLite, architecture, typecheck and build stages passed. |
| `npm test -- --test-concurrency=1` | PASS, exit 0: 255/255 backend, 0 skipped; original serial command preserved. |

The final Full and serial runs had no transient failure. R7.8.B’s two intermediate 254/255 Full outcomes remain unexplained/unconfirmed; the historical report records subsequent passing reruns. R7.7 governance residuals remain: five playground responsibility rows and the validator row are `unknown`; counts do not establish assertion-level coverage.

## Risks and evidence limits

- TD16 stays OPEN; external caller inventory is incomplete and the accepted exception is not debt elimination.
- Callback/registration exceptions before the listen catch are not fully characterized for cleanup.
- M12/M13 formal ownership remains TBD; no split or product ownership claim is made.
- R7.5 process-kill evidence is local Linux/filesystem evidence, not power-loss/deployment filesystem proof. No receiver-side guarantee or exactly-once claim is made.
- Existing R7.2, R7.5–R7.7 deferred debts and R7.7 responsibility-unknown rows remain as previously recorded.
- The cached whitespace check is the only final verification failure; it is in a pre-existing staged prompt and was preserved by instruction.

## Rollback and stop point

To reverse only this closure checkpoint, restore the eight existing documentation files listed above to their pre-closure worktree contents and remove only this final report; preserve their pre-existing index versions and all R7.8.A/B/C reports, tests, prompts and untracked artifacts. Do not reset or unstage. No source/runtime rollback is needed.

**Final recommendation: CONDITIONAL GO** for final architecture owner acceptance of R7.8 within the approved scope, with the staged whitespace issue visible for disposition. No extraction is claimed. Do not commit/push or begin R7.9; R7.9 remains NOT STARTED / NOT AUTHORIZED pending a separate owner decision after R7.8 final acceptance.
