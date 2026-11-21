# Codex Task — R7.2.A: Handshake Identity Lifecycle Characterization (TD02)

## Starting point

Repository: `vutuantrung/base-aa-backend`, branch `main`. Expected committed base HEAD: `1976b522d31868c63213ba3deaebd06bee99e537`.

Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` once. Read only the TD02 row of `docs/architecture/TECHNICAL_DEBT.md` and the TD02-A/B rows and relevant test-first sequence in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`. Check branch, HEAD and `git status --short` before modifying files. If HEAD has progressed, inspect the relevant delta; preserve unrelated changes. Do not depend on prior Codex conversation history.

## Objective

**Test-first characterization only** of identity registration before namespace connection and disconnect cleanup (TD02). Determine what is demonstrably observable with controlled unit fakes versus an actual local Socket.IO handshake. **Do not change production behavior, contracts, identity rules, or recovery policy.** Never report a mock-only sequence as a verified real-Socket.IO race.

## Focused evidence

Inspect as needed:
- `src/infrastructure/socket/socket-peer-gateway.ts` (namespace auth middleware, registration, connection callback, cleanup hook).
- `src/infrastructure/socket/peer-gateway.ts` (wrapConnection and disconnect handling).
- `src/modules/peer-messaging/peer-directory.ts` (registration, duplicate rejection and connection-ID-safe removal).
- `tests/peer-directory.test.ts`, `tests/peer-connections.test.ts`, `tests/multiple-eservers.test.ts`, and helper code used to instantiate local Socket.IO server/client.

Search/inspect narrowly. Reuse the R7.2.0 inventory; no full-repository rescan or unrelated historical reports.

## Required characterization

1. **Controlled middleware-gap scenario:** if technically feasible with a small fake namespace/socket, demonstrate `register` succeeds before connection callback and show directory state if a connection callback never occurs. Label results **isolated state-sequence simulation**, not proof that Socket.IO can produce it. Avoid altering implementation to insert test hooks.
2. **Real local Socket.IO reachability:** test or investigate a handshake abort between successful middleware registration and the namespace connection callback using deterministic local controls where feasible. Do not depend on sleep races, production endpoints, arbitrary timeouts, or flaky timing. If the phase cannot be controlled through supported public hooks, document precisely why and mark **not reproduced** rather than forcing a false-positive test. Do not introduce invasive production hooks for this characterization.
3. **Existing invariants:** cover duplicate registration rejection and stale disconnect not deleting a newer connection with a different connection ID; reuse existing tests or add a narrowly scoped deterministic test only if it contributes new evidence. Preserve logical identity semantics and EServer instance handling.
4. Record current behavior separately from desired policy. Do not implement auto-cleanup, takeover, retries, replacement, or altered ACK behavior in this step.

Choose the smallest focused test file(s) appropriate. Do not weaken, skip or delete tests, or change production code just to make a scenario testable. If a test demonstrates a defect, preserve the failing evidence, report it explicitly, and stop for policy review; do not silently fix it.

## Exit verification

Use Node 22.23.5. Run new/affected focused tests and, at checkpoint exit, `npm run check:architecture`, `npm run typecheck`, `npm run build`, `npm test -- --test-concurrency=1`, `npm --prefix testing run test:playground`, and `git diff --check`. For socket listeners run only on loopback using temporary ports. If sandbox produces `listen EPERM`, request narrowly scoped authorized execution; never alter tests or suppress the failure. Distinguish newly executed verification from inherited checkpoints. No production network/data.

## Deliverables

- Root `R7_2_A_HANDSHAKE_IDENTITY_CHARACTERIZATION_REPORT.md`, concise evidence: base SHA, changed files, deterministic scenarios and their reachability, exact observed states, test counts, limitations, and **recommended policy questions**.
- Update `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` TD02 rows and `docs/architecture/TECHNICAL_DEBT.md` TD02 only when new evidence changes them.
- Replace only the current section of `docs/architecture/PROJECT_STATE.md`: mark R7.2.0 committed at `1976b52`, document R7.2.A as local changes based on that SHA and actual executed verification. Do not invent a future commit SHA.

**Stop before TD02 remediation or R7.2.B. No commit/push.** Await architectural review and an explicit identity-cleanup policy decision if needed.
