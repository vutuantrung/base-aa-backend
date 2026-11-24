# R7.9.D — Full Test Stability Verification

**Source HEAD:** `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`, branch `main`
**Authoritative runtime:** Node `v22.23.5`, npm `10.9.9`
**Attempts used:** 2 of maximum 3. No further Full attempt was run after attempt 2 exposed a test assertion defect.

| Attempt | UTC start | Environment / command | Result and stage | Complete log |
|---|---|---|---|---|
| 01 | 2026-11-24 (exact time not captured in shell metadata) | Sandbox; `PATH=/home/parker/.nvm/versions/node/v22.23.5/bin:$PATH npm run test:full` | **BLOCKED**, exit 1 at architecture after SQLite ABI127 preflight; `scripts/check-architecture.ts` failed `spawnSync git EPERM` in `git ls-files`. No backend or playground tests ran. | `/tmp/r7_9_d_test_stability/full-attempt-01.log` |
| 02 | 2026-11-24 (exact time not captured in shell metadata) | Authorized host; same exact Full command | Preflight, architecture (59 files/145 edges), typecheck and build passed. Backend runner reached 257 tests: **256 passed, 1 failed**, 0 skipped. Playground did not run because the backend stage exited 1. Overall exit 1. | `/tmp/r7_9_d_test_stability/full-attempt-02-host.log` |

## Failure identity and disposition

Attempt 2 failed the newly added F1 test, `duplicate route IDs fail construction and the acquired SQLite database can be reopened`, at `tests/application-surface-compatibility.test.ts:99:14`. The assertion used strict `assert.equal` on two separately allocated row objects; actual was `{ name: 'Session' }`, expected `{ type: 'table', name: 'Session' }`. This is a test assertion defect, not evidence of a production failure-boundary defect. The complete assertion diff and stack are in the raw log around lines 379–405.

Per approved FI-D04=A, the minimal reproduction is preserved and no correction is made in R7.9.D. The assertion remains unchanged for architecture-owner review and a separately authorized corrective checkpoint. No third Full attempt was run. The earlier R7.9.B/C historical 254/255 outcomes have no known test identity and remain **NOT REPRODUCED / ROOT CAUSE UNKNOWN**; this D failure is the named failure of this newly changed test and is not attributed to those historical outcomes.

## Other focused/profile evidence

- Focused host command `PATH=.../v22.23.5/bin:$PATH node --import tsx tests/application-surface-compatibility.test.ts`: 7/7 passed before the Full attempt. A sandbox execution of the same file failed three existing listener tests with `listen EPERM`; that environment failure is not an application assertion result.
- `npm run test:fast`: 88/88 passed.
- `npm run test:integration`: backend 69/69 and playground 32/32 passed.
- No separate `npm test -- --test-concurrency=1` run was made.

The raw logs are unfiltered stdout/stderr captures from `tee`, retained outside git. Attempt 1 records the full child-process permission stack; attempt 2 records the named failing assertion and stack. No claim of suite stability is made.
