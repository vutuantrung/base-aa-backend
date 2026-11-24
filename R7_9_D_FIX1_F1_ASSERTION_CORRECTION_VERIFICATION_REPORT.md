# R7.9.D-FIX1 — F1 Assertion Correction & Verification

## Outcome

**GO for Architecture Owner review of the narrow R7.9.D F1 assertion correction.** The route failure assertion remains exact; the file-backed SQLite reopen/query check now asserts the value actually projected by SQL. Focused, Full, and serial backend verification pass. F2 is unchanged; asynchronous socket cleanup completion remains **NOT PROVEN**. No production source or behavior changed. Stop here for review; no commit/push, R7.9.E, or R7.10.

## Baseline and preservation

- Repository `vutuantrung/base-aa-backend`, branch `main`; expected and actual committed HEAD `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`.
- Initial D/FIX1 environment reported Node `v24.21.0`, npm `11.19.0`; authoritative execution used Node `v22.23.5`, npm `10.9.9` from `/home/parker/.nvm/versions/node/v22.23.5/bin`.
- Pre-existing worktree paths from R7.9.A/B/C/D and the supplied FIX1 prompt were retained. The D test file was already modified and D documentation untracked; no staged changes were present. No files were reset, unstaged, committed, or pushed.
- FIX1 deliverable added: this report. Current status note updated in `docs/architecture/PROJECT_STATE.md`. The previous D report, construction matrix, stability record, and approved decision policy were not rewritten.
- D test file contains F1/F2 additions in the existing `tests/application-surface-compatibility.test.ts`; no new test file was added, so the 55-entry manifest and profile semantics are unchanged. F2 body, expected error and cleanup behavior were not changed.
- Target test-file SHA-256 at Full attempt 1: `102e1bb5d8ee9cca93bec1fbb5faccceea5959e2d10f1af8425a499150327683`.

## F1 SQL/result diagnosis and minimal correction

The F1 DB check executes:

```sql
SELECT name FROM sqlite_master WHERE type = ? AND name = ?
```

with `('table', 'Session')`. Therefore the returned row has the shape `{ name: 'Session' }`; `type` is not selected. The `better-sqlite3` `Statement.get()` API returns a result row object (or `undefined`), and each query call yields a distinct object. The old F1 assertion passed the row object and `{ type: 'table', name: 'Session' }` to strict `assert.equal`, which checks reference identity; it also expected a field absent from the projection. Full attempt R7.9.D-02 captured actual `{ name: 'Session' }`, expected `{ type: 'table', name: 'Session' }`, operator `strictEqual`, and the stack at `tests/application-surface-compatibility.test.ts:99:14`.

The minimal correction is to assert `sessionTable?.name === 'Session'`, with the row typed as `{ name: string } | undefined` because the installed declaration leaves an unannotated result as `{}`. It preserves the DB reopen and meaningful catalog query, while asserting only the selected value. The exact duplicate-route `Error` name/message assertion, unique temporary DB path, `finally` close/removal, test title/count, input, and F2 test remain unchanged. Successful reopen/query is evidence that the file remains usable; it does not directly prove the prior native handle's state or every cleanup effect.

## Focused PASS versus prior Full FAIL investigation

- **Demonstrated:** the old assertion is deterministically wrong for its SQL/result and Full attempt R7.9.D-02 failed on that assertion. The current corrected test passes when run focused and in Full.
- **Unresolved historical discrepancy:** the prior D report states the focused host file passed 7/7, but its raw output and source snapshot were not retained. The saved Full log shows the bad assertion. Available evidence cannot establish whether the focused run executed a different transient file version, whether its result was misreported, or another cause. No explanation is selected as fact.
- This discrepancy is separate from historical R7.8.B/R7.9.B 254/255 reports, whose failing test identity remains unknown. No common root cause is inferred.

## F1/F2 contract and status

| Case | Before / current contract | FIX1 evidence |
|---|---|---|
| F1 duplicate route ID | Public duplicate IDs cause `Error('Duplicate route: duplicate')` during route-registry construction. Persistence has already opened; sockets have not yet been acquired. | Focused 7/7 and Full backend 257/257 pass. Test checks exact error, opens the temporary SQLite file independently, queries the `Session` table name, and closes/removes temporary resources. No direct native handle-state guarantee is claimed. |
| F2 blank PServer UDID | Whitespace UDID causes `Error('PServer VM UDID is required')` after Socket.IO attachment. The PServer acquisition marker is assigned only after constructor return; socket close in construction catch is fire-and-forget. | F2 test body and assertion unchanged; focused and Full suites pass. Socket-close completion, transport shutdown, native DB handle state, lock cleanup and durability remain **NOT PROVEN**. |

## Verification

All authoritative commands used Node `v22.23.5` and npm `10.9.9`.

| Command | Result |
|---|---|
| `git diff --check` | PASS, exit 0 at final audit. |
| `git diff --cached --check` | PASS, exit 0; no staged changes. |
| `npm run check:architecture` | PASS, exit 0; 59 files / 145 edges, 0 runtime file SCCs. |
| `npm run test:manifest` | PASS, exit 0; 55/55 manifest entries, Fast 11 / Integration 16 / Full 55. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run build` | PASS, exit 0. |
| `node --import tsx tests/application-surface-compatibility.test.ts` | PASS on authorized host, 7/7, zero skips. Sandbox had previously returned `listen EPERM` for existing loopback tests; host run is authoritative. |
| `npm run test:fast` | PASS, 88/88, zero skips. |
| `npm run test:integration` | PASS; backend 69/69 and playground 32/32, zero skips. SQLite ABI127 preflight passed. |
| Full attempt `R79D-FIX1-FULL-01` | PASS, exit 0; SQLite preflight, architecture, typecheck, build, backend 257/257 and playground 32/32, zero skips. This was the only Full attempt (1 of maximum 3). |
| `npm test -- --test-concurrency=1` | PASS, exit 0; backend 257/257, zero skips. Separate serial compatibility gate, not counted as Full. |

Full attempt metadata: `/tmp/r7_9_d_fix1/full-attempt-01-metadata.txt`; complete unfiltered stdout/stderr: `/tmp/r7_9_d_fix1/full-attempt-01.log`. Serial metadata and complete log: `/tmp/r7_9_d_fix1/serial-metadata.txt`, `/tmp/r7_9_d_fix1/serial-backend.log`. Full ran on the authorized host due prior sandbox child-process/loopback restrictions. No failure occurred in FIX1; one Full invocation was used.

## Scope, invariants, and residual gaps

Only the F1 assertion correction is within FIX1's allowed code scope. F2, `src/**`, public contracts/exports, scripts, CI, package files, manifest/profile semantics, feature flags, runtime behavior, and dependencies remain unchanged. R7.5 P01–P06, R7.6 D01–D06, R7.7 serial/profile/manifest policy, and R7.8 C-D01/02/03=A remain in force. M12/M13 remain TBD; M14/M15 remain APP. No debt item is closed. Tests establish local characterization only; they do not prove power-loss durability, remote peer behavior, receiver-side deduplication, or exactly-once effects.

Unverified construction and individual-close faults remain deferred as in the D construction matrix. No new seam is justified by this correction.

## Rollback and stop

If rollback is needed, revert only the F1 assertion-level correction in `tests/application-surface-compatibility.test.ts`; preserve the F1/F2 characterization tests, all prior A/B/C/D artifacts, and other worktree changes. No rollback was performed. No commit or push was made. **Stop for Architecture Owner review.**
