# R7.9.D — Testing-Only Failure Boundary Characterization & Verification

## Outcome

**NO-GO for checkpoint acceptance pending architecture-owner review of the named test assertion defect.** The authorized test-only characterization was implemented, but Full attempt 2 identified a defect in the new F1 assertion. Under FI-D04=A, that correction belongs in a separate explicitly authorized corrective checkpoint. No production defect was observed, no production source changed, and no correction was made here. Stop at this review; do not begin R7.9.E or R7.10.

## Baseline and preserved work

- Repository `vutuantrung/base-aa-backend`, branch `main`; committed HEAD before and after work: `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`.
- Required runtime used for authoritative commands: Node `v22.23.5`, npm `10.9.9`.
- Existing R7.9.A/B/C dirty documentation and supplied D prompt were present at entry and preserved. No staging, commit, or push.
- D-specific tracked modification: `tests/application-surface-compatibility.test.ts`. D-specific untracked deliverables: this report, `docs/architecture/R7_9_D_M02_CONSTRUCTION_FAILURE_CHARACTERIZATION_MATRIX.md`, and `docs/testing/R7_9_D_FULL_TEST_STABILITY_VERIFICATION.md`.
- `docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md` approval record updated only to reflect owner-approved FI-D01–FI-D05=A.
- `docs/architecture/PROJECT_STATE.md` gains a compact D checkpoint entry. Production `src/**`, public contracts, runtime behavior, gates, manifest, profiles, scripts, CI, and unrelated files were not changed.

## Decisions and characterization

Architecture owner approved FI-D01=A, FI-D02=A, FI-D03=A, FI-D04=A, FI-D05=A. R7.5–R7.8 invariants and prior RC decisions remain binding.

- **F1 duplicate route ID:** Public `routes` input deterministically throws `Error('Duplicate route: duplicate')` after persistence acquisition but before socket attachment. The new test checks error name/message and attempts to show the DB file is reopenable/queryable. Full later exposed that its row comparison assertion is defective (see below), so F1's construction error assertion passed in the focused run but the full test is not accepted as green. No direct native handle closure claim is made.
- **F2 blank PServer UDID:** Public PServer configuration deterministically throws `Error('PServer VM UDID is required')` after socket attachment. The test asserts only this error. `acquiredPServer` assignment follows constructor return, so the thrown constructor leaves no PServer cleanup marker. Acquired socket close is fire-and-forget; completion is **NOT PROVEN**. The construction failure path does not expose a deterministic public completion signal, and no seam was added.
- Residual constructor/individual-close faults and F2 asynchronous cleanup completion remain deferred. Full acquisition/cleanup source evidence and the observable/inferred/unverified distinctions are in the [construction matrix](docs/architecture/R7_9_D_M02_CONSTRUCTION_FAILURE_CHARACTERIZATION_MATRIX.md).

## Verification

| Command / gate | Result |
|---|---|
| Focused host `node --import tsx tests/application-surface-compatibility.test.ts` | PASS, 7/7 before Full; includes 2 new tests. Sandbox equivalent hit `listen EPERM` in 3 existing listener tests. |
| `npm run check:architecture` | PASS, 59 files / 145 edges. |
| `npm run test:manifest` | PASS, 55/55 rows; manifest unchanged. |
| `npm run typecheck` | PASS after initial type correction; final committed test source at exit is the assertion version that typechecked before Full. |
| `npm run build` | PASS after initial type correction; Full attempt 2 build also passed. |
| `npm run test:fast` | PASS, 88/88, zero skips. |
| `npm run test:integration` | PASS, backend 69/69 + playground 32/32, zero skips. |
| Full attempt 1 | BLOCKED at architecture by sandbox `spawnSync git EPERM`, exit 1; no tests. |
| Full attempt 2 | FAIL, backend 256/257, one named test assertion failure, zero skips; playground not reached. |
| Full attempts used | 2 of 3 maximum; no third attempt after failure. |
| `git diff --check`; `git diff --cached --check` | PASS, exit 0 at report preparation. |

Exact attempt metadata and complete logs: [Full stability evidence](docs/testing/R7_9_D_FULL_TEST_STABILITY_VERIFICATION.md), `/tmp/r7_9_d_test_stability/full-attempt-01.log`, and `/tmp/r7_9_d_test_stability/full-attempt-02-host.log`.

## Confirmed test defect and required next step

Full attempt 2 failed the new F1 test at `tests/application-surface-compatibility.test.ts:99:14`. `assert.equal` performed reference equality on two separately created objects: actual `{ name: 'Session' }`, expected `{ type: 'table', name: 'Session' }`. The error stack is in the complete attempt 2 log. This is a confirmed test defect; it does not establish a production failure-boundary defect and is not connected to historical R7.8.B/R7.9.B 254/255 reports, whose failing test identity remains unknown.

The failing assertion is preserved unchanged as required by FI-D04=A. A separately authorized corrective checkpoint must repair and verify this assertion, then rerun appropriate gates. No extra Full run was spent, and no unverified Full PASS is claimed.

## Stop

No technical debt is closed. No M02 extraction, injection adapter, production correction, R7.9.E, or R7.10 is authorized. Stop for architecture-owner review of this report and the preserved test reproduction.
