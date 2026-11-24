# R7.9.C — Full test stability evidence

**Source HEAD:** `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9` (`main`)
**Runtime:** Node `v22.23.5`, npm `10.9.9`
**Conclusion:** **NOT REPRODUCED; ROOT CAUSE UNKNOWN.** This bounded run does not establish suite stability.

## Profile mechanics checked before reruns

`package.json` defines `npm test` as `node --import tsx --test --test-concurrency=1 tests/*.test.ts`. `scripts/run-test-profile.mjs` Full invokes preflight, architecture, typecheck, build, then `npm test -- --test-concurrency=1`, then all playground tests. Thus the Full backend test-file runner is serial; “parallel test files” is not an evidenced explanation. Individual tests can still run concurrent operations, timers, listeners, filesystem work, or child processes.

Manifest: 55 entries total; Full selects 50 backend files and 5 playground files. Marked time-sensitive examples include `application-peer-ack-drain.test.ts`, `demo-pserver-aaui.test.ts`, `eserver-presence.test.ts`, `f09-task-result-receipt.test.ts`, `peer-forwarding.test.ts`, `pserver-aaui-task-roundtrip.test.ts`, `pserver-session.test.ts`, `reliable-crash-process.test.ts`, `reliable-outbox.test.ts`, `task-history-snapshot.test.ts`, and `task-received-routing.test.ts`; two playground suites are also time-sensitive. Several use dynamic loopback ports, process.env store paths restored in `finally`/hooks, temp directories, native SQLite, timers, or child processes. These are candidate diagnostic dimensions only; manifest metadata and code patterns do not prove interference or a failure cause. Backend test concurrency is explicitly 1. No test row was relabeled.

## Attempt ledger

| ID | UTC start | Execution | Stage/result | Full test totals | Log |
|---|---|---|---|---|---|
| R79C-FULL-01 | 2026-11-23 18:01:22 | Sandbox; exact `PATH=... npm run test:full` | **BLOCKED at architecture**: `scripts/check-architecture.ts` child `spawnSync git` / `git ls-files` returned `EPERM`. SQLite preflight had passed (Node 22.23.5, ABI 127). Backend and playground were not run. | Not run | `/tmp/r7_9_c_test_stability/full-attempt-01.log` |
| R79C-FULL-02-HOST | 2026-11-23 18:03:15 | Authorized host rerun; exact Full profile | **PASS**, exit 0. Preflight, architecture (59 files/145 edges), typecheck/build, serial backend and playground all passed. | Backend 255/255; playground 32/32; 0 skips | `/tmp/r7_9_c_test_stability/full-attempt-02-host.log` |
| R79C-FULL-03-HOST | 2026-11-23 18:05:09 | Authorized host rerun; exact Full profile | **PASS**, exit 0. Same stages all passed. | Backend 255/255; playground 32/32; 0 skips | `/tmp/r7_9_c_test_stability/full-attempt-03-host.log` |

The two host attempts capture complete stdout/stderr, timestamp, Node/npm, SHA, command and final exit code. Raw logs contain local test output; they are kept outside the repository. The sandbox-blocked log includes the full EPERM stack and preflight output. No output was redirected from another checkpoint or treated as current evidence.

## Historical evidence and hypotheses

R7.8.B recorded two intermediate 254/255 Full outcomes before passing reruns. R7.9.B recorded an initial 254/255 Full outcome with no captured failing test identity, a passing serial `npm test` 255/255, and passing later Full 255/255 + 32/32. These establish intermittent outcomes, not a common test or source defect. The C attempts did not reproduce the test failure; the only failure was a permission block before tests.

| Hypothesis | Supporting observation | Disconfirming / missing evidence | Status |
|---|---|---|---|
| Test timing or async cleanup race | Manifest has time-sensitive suites; several tests use listeners/timers/async work; history is intermittent. | No named test, assertion, stack, missed event, timeout, or reproducing condition from historical failures. Current backend files run serially. | Possible dimension only; unproven. |
| Environment/filesystem/child-process variation | Full includes native SQLite, local listener, temp filesystem and child SIGKILL requirements. Sandbox architecture stage demonstrably hits process `EPERM`. | Host attempts passed; historical 254/255 was reported as a test result, not an environment block, but raw logs are unavailable. No evidence links it to host capability. | Possible dimension only; no causal link. |
| M02 lifecycle/composition defect | M02 has acquisition/cleanup gaps identified in R7.9.B; lifecycle tests include listeners, deadlines, and runner paths. | Historical failing test unknown; current Full host runs passed; no defect signature connects failure to M02. | Not supported as root cause; do not attribute. |
| Test-file concurrency | None. | `npm test` and Full backend invocation pass `--test-concurrency=1`. In-test concurrency is possible but distinct. | Not an explanation for cross-file parallelism. |

## Next safe diagnostic step

If a future authorized Full run fails, preserve the complete raw output immediately and capture the failing subtest name, assertion/stack, preceding/following lines, failed profile stage, command, versions, SHA and OS/runtime permissions. Re-run only the named test under its ordinary profile invocation if that is safe and useful; compare with the full serial run. If no historical raw log exists, treat old failures as unresolved rather than reconstructing a test identity. Any confirmed source/test defect should receive a separately scoped corrective checkpoint. Do not add sleeps, alter ordering, broaden timeouts, bypass cleanup, or introduce hooks as a stability workaround.
