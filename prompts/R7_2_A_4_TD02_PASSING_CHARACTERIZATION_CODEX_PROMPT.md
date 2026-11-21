# Codex Task — R7.2.A.4: TD02 Passing Characterization & Checkpoint Cleanup

## Goal and authorization

The architecture owner has **selected Option B**: retain the **all-aborts identity-cleanup guarantee** as an unresolved requirement. **Do not implement partial M05 pending reservations, timeout-based cleanup, Socket.IO private hooks, monkey patches, or a weaker admission contract.** TD02 remains **OPEN**. This checkpoint is limited to converting the intentionally failing proof-of-defect test into a **passing characterization test that continues to prove the existing failure mode**. Restore a green default backend regression suite without hiding the finding. Stop after this checkpoint; R7.2.B has a separate prompt and gate.

Repository: `vutuantrung/base-aa-backend`, branch `main`. Expected committed baseline: `ca3e1048808b825544e5b4dabf38ec5090e64aaf` (R7.2.A.2 design and A.1 evidence). A.3 feasibility report may be uncommitted locally; preserve it if present. Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` first. Verify actual branch, HEAD and `git status --short`; inspect only changed relevant files. Do not reset/stash or overwrite user edits. If the branch/HEAD differs, reconcile the minimal delta and state it in the report; stop on incompatible drift.

## Relevant evidence (read narrowly)

- `tests/socket-peer-gateway-handshake.test.ts` (current failing final assertion in the downstream-middleware test).
- `src/infrastructure/socket/socket-peer-gateway.ts`, `src/modules/peer-messaging/peer-directory.ts` (read-only).
- `R7_2_A_1_HANDSHAKE_IDENTITY_REMEDIATION_REPORT.md`, `R7_2_A_2_NAMESPACE_ADMISSION_BOUNDARY_DESIGN_REPORT.md`, `docs/architecture/R7_2_NAMESPACE_ADMISSION_DESIGN.md`.
- `R7_2_A_3_SUPPORTED_ADMISSION_LIFECYCLE_FEASIBILITY_REPORT.md` if present locally; if absent, record it as user-supplied checkpoint evidence, **do not invent a Git file**.
- `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, `docs/architecture/TECHNICAL_DEBT.md` (TD02 only).

## Implementation — tests only

1. Keep the isolated fake middleware-gap sequence test (it proves sequence, **not** real Socket.IO reachability).
2. Keep the actual loopback Socket.IO downstream namespace rejection scenario with sibling `/session` sharing the Engine.IO transport. Preserve assertions that: `/peers` emits `connect_error` with the expected message; `/peers` `connection` is not accepted; `/session` remains connected; Engine.IO remains open; server `disconnect`/`disconnecting` and transport `close` do not fire in this controlled setup.
3. **Replace only the deliberately failing cleanup expectation** `assert.equal(directory.lookup('aaui'), undefined)` with positive characterization assertions describing the current defect: `directory.lookup('aaui')` retains the rejected connection identity and a same-peer registration attempt remains rejected with the existing duplicate error. These checks already exist in the test; remove redundant assertion only when evidence is preserved. Rename the test to describe current observed behavior, not successful cleanup.
4. Preserve deterministic signal-driven setup and teardown; no arbitrary sleeps, no production connections, no changed public APIs, no production implementation changes. Ensure clean closure of test sockets/server even if a check fails. Avoid introducing additional network scenarios unless necessary to stabilize the existing test.
5. **Do not use `test.skip`, `test.todo`, `test.fails`, exclusion from `npm test`, or weaken assertions** to make the suite green. A passing test must continue to fail if production behavior changes in a way that invalidates the recorded characterization; future remediation will update the expectation when explicitly approved.

## Architecture documentation

- Record **Option B chosen**: retain all-aborts guarantee; no proven supported complete namespace preacceptance terminal hook; TD02 remains OPEN and remediation deferred. Clearly separate the reproduced downstream-rejection bug from unverified spontaneous abort in the current single-middleware production composition.
- Update only TD02 rows in `docs/architecture/TECHNICAL_DEBT.md` and `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, the relevant design decision/status in `docs/architecture/R7_2_NAMESPACE_ADMISSION_DESIGN.md`, and current checkpoint in `docs/architecture/PROJECT_STATE.md`. Do not retroactively claim bug fixed or assert a new invariant in production.
- Documentation should say 'passing **current-behavior characterization**', not 'cleanup regression fixed'. Avoid historical copy/paste.

## Verification

Use Node 22.23.5. Run focused `node --import tsx --test tests/socket-peer-gateway-handshake.test.ts`, `npm run check:architecture`, `npm run typecheck`, `npm run build`, `npm test -- --test-concurrency=1`, `npm --prefix testing run test:playground`, and `git diff --check`. Last committed baseline: 160 backend PASS / 1 deliberate FAIL; 32/32 playground PASS. Expect a **green backend suite** after transforming the single failing test, but record observed counts rather than assuming 161/161. If sandbox emits `listen EPERM`, request narrowly scoped loopback permission; don't change tests to bypass it. If an unrelated failure occurs, report it accurately.

## Deliverables and stop gate

Create `R7_2_A_4_TD02_PASSING_CHARACTERIZATION_REPORT.md` (about 50–100 lines or less) summarizing exact changed paths, tested HEAD+dirty state, current bug evidence, Option B policy, PASS/FAIL counts, and why TD02 remains OPEN. No commit/push. **STOP after A.4** and request review; do not begin R7.2.B without separate go-ahead. Reuse existing context; don't re-audit R7.1 or unrelated TDs.
