# R7.9.C — Runtime Failure Injection & Test Stability Discovery

## Outcome

**GO for architecture-owner review.** C01–C03 discovery and evidence collection are complete. No historical 254/255 failure was reproduced in the bounded authorized runs; **root cause remains unknown**. C identifies realistic existing-input characterization opportunities and material constructor/cleanup paths that cannot be deterministically injected without an additional seam. No implementation seam is approved here.

## Baseline and preservation

- Repository `vutuantrung/base-aa-backend`, branch `main`; expected and actual committed source HEAD `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`.
- Node `v22.23.5`, npm `10.9.9` used explicitly for authoritative commands and Full attempts.
- Initial status was docs-only R7.9.A/B work: modified `docs/architecture/PROJECT_STATE.md`; untracked R7.9.A discovery report, inventory, opportunity catalog, decision policy, A prompt; untracked R7.9.B report, parity matrix, seam decision, B prompt; supplied C prompt. These are preserved. No source/test/script/manifest/CI or runtime behavior changes. No staging, commit, or push.
- Binding decisions remain RC-D01=A, D02=A scoped equivalence-first, D03=A, D04=C, D05=A, D06=A, D07=A. R7.8 C-D01/02/03=A and R7.5–R7.8 invariants remain in force. M12/M13 remain TBD; M14/M15 APP; no debt item was closed.

## Findings

### C01 — M02 injection opportunities

The [failure-injection opportunity matrix](docs/architecture/R7_9_C_M02_FAILURE_INJECTION_OPPORTUNITY_MATRIX.md) provides 16 site-specific cases. Current source gives useful fault triggers without hooks: invalid configuration before acquisition; duplicate routes after persistence acquisition; invalid PServer UDID after Socket.IO attachment; occupied-port listen failure; same-directory writer collision; fake activation failure through the existing lifecycle test seam; callback throw and duplicate demo registration. These prove only their named paths.

Other boundaries remain inaccessible or partial without new seams: arbitrary repository/HTTP/Socket.IO constructors, partial `attachSocketServer`, transport/protocol constructor after transport acquisition, individual normal-close failures, cleanup aggregation, and full factory wiring through activation/rollback. The root cause of each R7.9.B parity gap is not assumed to be a defect. A narrow adapter could improve testability, but would be a production source-shape change requiring explicit approval and ownership; a general DI framework is not recommended.

Observed asymmetries remain: timeout validation precedes resources; `openPersistence` is outside the main M02 try; acquisition markers assign after constructor returns; construction close mixes sync and fire-and-forget semantics; startup and normal cleanup orders differ; callback/registration remain outside the listen catch; one-shot promises, deadline, and late-settlement ownership are hard invariants.

### C02 — Full test stability

The Full profile invokes serial backend `npm test -- --test-concurrency=1` (package script itself also selects `--test-concurrency=1`) and then all playground tests. Cross-file parallelism is therefore not evidenced. In-test async work, listeners, temp files, environment overrides, SQLite, timers and child processes are present; these are diagnostic dimensions, not a demonstrated cause. The maintained manifest has 55 rows; Full selects 50 backend files and 5 playground files. Existing `timeSensitive` metadata remains unchanged.

Bounded capture used at most three attempts:

| Attempt | Result | Detail |
|---|---|---|
| 01, sandbox | **BLOCKED**, exit 1 | SQLite preflight passed, then architecture checker child `spawnSync git` / `git ls-files` returned `EPERM`; no tests ran. |
| 02, authorized host | **PASS**, exit 0 | Backend 255/255, playground 32/32, 0 skips; Full profile passed. |
| 03, authorized host | **PASS**, exit 0 | Backend 255/255, playground 32/32, 0 skips; Full profile passed. |

Complete logs are outside the repository at `/tmp/r7_9_c_test_stability/full-attempt-01.log`, `full-attempt-02-host.log`, and `full-attempt-03-host.log`. Attempts 02/03 include attempt IDs, UTC timestamp, versions, SHA, exact command, full output, totals, and exit code. Prior R7.8.B and R7.9.B 254/255 outcomes remain historical, with no failing test identity or raw log available. Current C status is **NOT REPRODUCED; ROOT CAUSE UNKNOWN**, not “suite stable.” No inference of M02 defect or concurrency cause is warranted.

### C03 — Owner decisions

FI-D01–FI-D05 are presented with A/B/C options, trade-offs, recommendations, and all left **PENDING OWNER APPROVAL** in the [decision policy](docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md). Recommendations: use existing triggers first; start with route/PServer input faults; limit each stability investigation to three fully captured attempts; handle any confirmed defect in a separate corrective checkpoint; sequence any future work as testing-only characterization before reassessing M02. These recommendations do not authorize tests, seams, production changes, or a later checkpoint.

## Verification

Node `v22.23.5`, npm `10.9.9`:

| Command | Result |
|---|---|
| `npm run check:architecture` | PASS, exit 0; 59 files, 145 edges, 0 runtime file SCC; existing module SCC noted |
| `npm run test:manifest` | PASS, exit 0; 55/55 entries; Fast 11, Integration 16, Full 55 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0 |
| Full attempt 01 | BLOCKED at architecture due sandbox `spawnSync git EPERM`; preflight passed; no test stage run |
| Full attempt 02 | PASS, authorized host; backend 255/255, playground 32/32, 0 skips |
| Full attempt 03 | PASS, authorized host; backend 255/255, playground 32/32, 0 skips |
| `git diff --check`; `git diff --cached --check` | PASS, exit 0 at final audit |

Host execution for attempts 02 and 03 was authorized because the first sandbox run failed at a child-process permission boundary before tests. No external production peers/services were contacted. Existing local/process-kill tests do not prove receiver dedupe, exactly-once effects, power-loss, or deployed filesystem semantics.

## Deliverables and stop

- [Failure injection opportunity matrix](docs/architecture/R7_9_C_M02_FAILURE_INJECTION_OPPORTUNITY_MATRIX.md)
- [Full stability evidence](docs/testing/R7_9_C_FULL_TEST_STABILITY_EVIDENCE.md)
- [FI-D01–FI-D05 decision policy](docs/architecture/R7_9_C_FAILURE_INJECTION_TEST_STABILITY_DECISION_POLICY.md)
- [Project state](docs/architecture/PROJECT_STATE.md) updated with this checkpoint and links.

No production, test, script, manifest, public contract, or runtime changes were made. `TECHNICAL_DEBT.md` and historical R7.8/R7.9.A/B reports remain unchanged; TD15–TD17 and all other open debts remain open. **Stop for architecture-owner review of FI-D01–FI-D05. R7.9.D and R7.10 are not authorized.**
