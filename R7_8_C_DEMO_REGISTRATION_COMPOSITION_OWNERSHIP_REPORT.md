# R7.8.C — Demo Registration Composition Ownership Report

## Status: CONDITIONAL GO to architecture owner approval

The architecture decision package is prepared and remains **PROPOSED / PENDING OWNER APPROVAL**. No C-D01, C-D02 or C-D03 choice was made on the owner’s behalf. No source, tests, package, runtime configuration, or behavior were changed for R7.8.C. Stop here; do not begin R7.9.

## Baseline and worktree

- Repository `vutuantrung/base-aa-backend`, branch `main`; expected and actual committed HEAD `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`.
- Node `v22.23.5`, npm `10.9.9`.
- Starting worktree already contained staged R7.8.A report/inventory/composition/policy/prompt files, plus unstaged R7.8.B changes in docs/tests and untracked R7.8.B report/prompt. These were preserved. No stage/unstage, reset, commit or push.
- Actual C prompt location: `prompts/R7_8_C_DEMO_REGISTRATION_COMPOSITION_OWNERSHIP_ADR_CODEX_PROMPT.md`.
- The R7.8.A/B source and compatibility evidence was reused; current source was checked at relevant call sites and tests. The source baseline has not drifted.

## Decision analysis

- **C-D01 — composition owner:** compared A retain documented compatibility exception, B outer executable composition, C typed internal provider/adapter, D versioned startup contract. Proposed A: the direct edge is real and bounded; B silently drops direct callers unless a facade remains; C can move rather than remove the coupling; D is intentionally breaking and out of scope.
- **C-D02 — direct `startApplication()` compatibility:** compared A preserve implicit registration, B legacy facade plus explicit opt-in API, C later versioned break after caller inventory. Proposed A pending approval; `startApplication` is exported and direct callers exist in tests, while external callers are unknown.
- **C-D03 — state/lifetime:** compared A app-local registry, B separately composed demo runtime/plugin, C global/ambient state. Proposed A pending approval; current registry is per application and avoids cross-instance state.
- Full alternatives, caller/order/config/build/rollback impacts, recommendation and owner checklist are in the [proposed ADR](docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md). The scenario-by-scenario verified/observed/inferred/unverified matrix and minimal future proof plan are in the [compatibility evidence matrix](docs/architecture/R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md).

## Central compatibility finding

`startApplication` creates the app, calls `onCreated`, registers the example when the top-level flag is true, then listens. The callback sees the live app before registration and may inspect or mutate its registry. The top-level flag controls demo registration; nested `application.enableTestPeers` independently controls `/peers` and M12/M13 construction. CLI resolves both flags together and adds a default PServer config for exact `'1'`; direct callers may mismatch flags or omit PServer. Direct `createApplication()` has no demo registration, while direct `startApplication()` can.

Both `onCreated` and registration are currently outside `startApplication`’s listen-error `try/catch`. Therefore callback/registration exceptions bypass that wrapper’s diagnostics/rethrow path and do not invoke wrapper rollback; `application.listen()` owns its own startup rollback. No test presently characterizes callback-throw/duplicate-rule cleanup behavior. This is a visible compatibility question if a future seam changes code order or exception boundaries.

The rule contract remains ID `demo-pserver-to-aaui-modified-param`, priority 10, `pserver`→`aaui`, payload type `demo.modified-param`, exact `modifiedParam` output, and exact invalid-input error. Existing wire test asserts ACK success, matching message ID and `processedBy`; the B characterization covers direct transform error. There is no proof of external caller count, live production CLI topology, deployed filesystem behavior, power-loss guarantees, or external-peer semantics.

## Changed paths and verification

- Added `docs/architecture/R7_8_C_DEMO_REGISTRATION_COMPOSITION_ADR.md` (proposed, pending).
- Added `docs/architecture/R7_8_C_COMPATIBILITY_EVIDENCE_MATRIX.md`.
- Added this root review report.
- Added a current R7.8.C progress note to `docs/architecture/PROJECT_STATE.md`; historical R7.8.A/B reports and snapshots remain intact.
- `docs/architecture/TECHNICAL_DEBT.md` / TD16 was not changed: source review confirmed rather than changed its existing characterization; it remains OPEN.
- No test file or test registration was modified in this checkpoint.

| Verification | Result |
|---|---|
| `node --version`; `npm --version` | `v22.23.5`; `10.9.9` |
| `npm run check:architecture` | PASS; 59 files / 145 edges; 0 runtime file SCCs; existing M10↔M12↔M13 module runtime SCC and type-only warning retained. |
| `npm run test:manifest` | PASS; 55/55 manifest entries, Fast 11 / Integration 16 / Full 55. |
| `npm run typecheck` | PASS. |
| `npm run build` | PASS; emitted lifecycle retains reachable example import in `dist`; `testing/` remains separate. |
| `npm run test:full` | PASS; SQLite preflight, architecture, typecheck, build, 255/255 backend and 32/32 playground, no skips. |
| `git diff --check` | PASS. |

Listener/process/native SQLite checks ran with authorized host execution. These local results do not establish power-loss durability, receiver dedupe, exactly-once processing or an external peer guarantee. The full profile’s exact aggregate counts were verified live and are not carried forward solely from R7.8.B.

## Review request and stop

**CONDITIONAL GO** for owner review of the proposed combined direction C-D01=A, C-D02=A, C-D03=A. This is a proposal, not an approved decision or implementation authorization. Owner approval should answer the three decisions independently and confirm whether the direct `startApplication()` contract must remain implicit. Any API/seam implementation requires a separate scope and rollback authorization. No R7.9 work, commit or push was started.
