# R7.8.B — Demo Extraction Implementation & Verification Report

## Checkpoint recommendation: CONDITIONAL GO for reviewer assessment

The authorized R7.8.B documentation and compatibility characterization work is complete. Demo wiring extraction is **deferred** because no seam can be shown to preserve the existing public `startApplication()` order and direct-call behavior without introducing a new composition contract or changing timing. No production source, runtime behavior, package, CI, public API, or existing test assertion changed. Stop for reviewer assessment; do not begin R7.9.

## Baseline and preserved work

- Repository: `vutuantrung/base-aa-backend`; branch: `main`; tested committed source HEAD: `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`.
- Runtime: Node `v22.23.5`, npm `10.9.9`; native SQLite preflight loaded `better-sqlite3` and passed in-memory open/query/close (ABI 127).
- At checkpoint start, staged/untracked R7.8.A discovery files were present. Their staged state and content were preserved; no reset, stage/unstage, commit or push occurred.
- The complete supplied B prompt was found at `docs/architecture/R7_8_B_DEMO_EXTRACTION_IMPLEMENTATION_VERIFICATION_CODEX_PROMPT.md` (the user-referenced `prompts/` path is not its repository location).

## Owner decisions and ownership

| Decision | Implemented record |
|---|---|
| ES-D01=A | Record classification by behavior, supported contract and state ownership. |
| ES-D02=C scoped | M12 remains **TBD**; task workflow/store/F08/F09/ACK/outbox/snapshots were not moved or split. |
| ES-D03=C scoped | M13 remains **TBD**; selection workflow/store/ACK/outbox/snapshots were not moved or split. |
| ES-D04=A | M14 Generic Session classified **APP**; routes, contracts and SQLite behavior retained. |
| ES-D05=A | M15 Process Usage classified **APP**, separate from M18; routes, contracts and SQLite behavior retained. |
| ES-D06=A | Exact env and programmatic gate behavior, top-level/nested distinction, CLI PServer defaults and SQLite defaults retained. |
| ES-D07=A | `testing/` remains a separate package/process; no APP→playground import. |
| ES-D08=A | Breadth-first compatibility gates and review checkpoints retained. |

The decision record is updated in `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md`; M14/M15 rows are updated in `docs/architecture/MODULE_BOUNDARIES.md`. TD16 remains **OPEN** with the verified coupling and ADR-sized follow-up in `docs/architecture/TECHNICAL_DEBT.md`.

## Composition and compatibility characterization

Current APP import/composition remains:

```text
src/main.ts → resolveConfiguration → startApplication
  → createApplication(application config)
  → onCreated(application)
  → [top-level enableTestPeers] registerPServerToAauiDemo(transformations)
  → listen(port)

createApplication → M05 reads nested application.enableTestPeers
  → optional /peers, M12/M13 stores and runners
  → optional M03/M04 connector only when PServer config is also present
```

`src/app/lifecycle.ts` statically imports `src/examples/pserver-to-aaui.ts`. The rule is `demo-pserver-to-aaui-modified-param`, `pserver`→`aaui`, payload type `demo.modified-param`, priority `10`; it adds `modifiedParam: "AAB modified: <originalParam>"` and errors with `originalParam must be a string` for invalid input. M11 resolves matching rules by priority then ID. `onCreated` is called before registration; registration is complete before `listen`.

| Scenario | Characterized behavior / parity |
|---|---|
| `ENABLE_TEST_PEERS` absent / `'0'` / `'1'` | Absent and `'0'` resolve false; only exact `'1'` resolves true. `'1'` sets both resolved flags and CLI PServer defaults (`127.0.0.1:3001`, `/ws`, default VM). |
| Programmatic top-level true, nested false | `onCreated` sees no rule; `listen` sees the rule. No peer gateway/connector is created. This proves the two flags are not interchangeable. |
| Programmatic nested true, top-level false | `createApplication` retains peer-gateway activation; absent PServer config means no connector. Lifecycle does not gain an example rule from the nested flag. Existing composition checks preserve this split. |
| Rule match/nonmatch/error | Existing loopback asserts exact transformed payload and `processedBy`, nonmatching payload pass-through; new deterministic assertion checks exact invalid-input error. |
| M14/M15 | Independently follow SQLite/API configuration; focused HTTP/repository tests and Full preserve auth-first, disabled-SQLite, response and repository contracts. |
| Startup/close and persistence | Existing startup rollback, peer recovery, store/outbox, SQLite and lifecycle implementations are untouched; required integration and Full gates passed. |

**B03 extraction deferred:** removing this static import while preserving automatic behavior for public `startApplication()` callers requires another owner for registration. A callback supplied by `main.ts` would omit direct callers; registering before `startApplication()` would change the public call contract; moving registration into `createApplication()` would conflate top-level and nested flags; dynamic loading or hidden global hooks introduce unapproved dependency mechanisms. The focused test now locks the observable callback/registration/listen order and mismatched-flag case. Recommendation for a future ADR: explicitly decide whether the demo transform is part of `startApplication()` compatibility or whether an opt-in composition seam may change that contract. Until then, preserve the APP→example import transparently.

## Changes and rollback boundary

- `tests/application-surface-compatibility.test.ts`: add focused rule visibility/order and mismatched top-level/nested flag coverage; assert nested peer activation without PServer connector/rule.
- `tests/configuration.test.ts`: add `'0'` exact-value gate assertion; existing absent and `'1'` assertions remain.
- `tests/demo-pserver-aaui.test.ts`: add exact invalid `originalParam` error characterization; all prior wire assertions remain.
- `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md`, `MODULE_BOUNDARIES.md`, `TECHNICAL_DEBT.md`, `PROJECT_STATE.md`: record approvals, classifications, deferred B03 and current checkpoint status.
- No new test file was added, so no manifest/profile/selection-map entry was needed. Manifest remains 55/55 entries; test registrations increased only by two (backend baseline 253→255). Playground remains 32.
- Reviewer rollback can revert only the three B-specific test edits and four B-specific architecture-doc edits, while retaining the staged R7.8.A artifacts. No source/API/data migration rollback is required.

## Verification evidence

All final gates used Node `v22.23.5` / npm `10.9.9`; listener and process suites ran with authorized host execution. Exit code was 0 for each listed final command.

| Command | Result |
|---|---|
| `node --version`; `npm --version` | `v22.23.5`; `10.9.9` |
| `git diff --check` | Pass |
| `npm run check:architecture` | Pass: 59 source files, 145 edges (65 runtime / 80 type-only), 0 runtime file SCCs. Existing M10↔M12↔M13 module runtime SCC and type-only M10↔M11 warning remain unchanged. |
| `npm run test:manifest` | Pass: 55 manifest entries / 55 discovered tests; profiles Fast 11, Integration 16, Full 55. |
| `npm run typecheck`; `npm run build` | Pass |
| `npm run test:fast` | Pass: 88/88 backend tests; no skips. |
| `npm run test:integration` | Pass: 69/69 backend and 32/32 playground tests; no skips. Includes M14/M15 HTTP and SQLite gates, lifecycle startup/rollback, peer ACK drain, R7.5 outbox/crash and task routing. |
| `npm run test:full` | Pass: full 255/255 backend suite and 32/32 playground suite; native SQLite preflight passed; no skips. |
| `npm test -- --test-concurrency=1` | Pass: 255/255 backend tests; no skips; original serial command remains compatible. |
| Focused seam/demo/config tests | Pass: 14/14 across lifecycle surface, config and demo loopback, including exact invalid-input error. |
| Focused APP/reliability regressions | Pass: 90/90 across M14/M15 HTTP/repositories, R7.5 outbox/crash, R7.6 coordinator/lifecycle/startup/ACK drain and related selection persistence. |

Two intermediate Full attempts during the final rerun sequence reported 254/255 without an actionable failure excerpt. The unchanged serial suite passed 255/255 after each, and the subsequent Full rerun passed (255 backend / 32 playground); the final serial `npm test` also passed 255/255 under the required Node/npm baseline. These transient results are retained here rather than omitted.

R7.5 P01–P06, R7.6 D01–D06 and R7.7 manifest, validator, additive profiles, native SQLite preflight, serial `npm test`, playground coverage and architecture gates remain intact. Evidence remains local Linux behavior: process-kill tests do not prove power-loss/filesystem guarantees, and no external peer guarantee or exactly-once claim is made. No production service or external peer was contacted.

## Final status

Architecture enforcement and all required verification gates pass. B03 extraction is deferred pending the composition-ownership ADR described above; this is an intentional compatibility stop, not a claim of extraction completion. **Recommendation: CONDITIONAL GO for architecture owner/reviewer assessment of the documented scope and deferred seam.** No commit or push; stop here and do not begin R7.9.
