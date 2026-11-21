# R7.2.A — Handshake Identity Lifecycle Characterization (TD02)

## Baseline and scope

- Branch `main`; base HEAD `1976b522d31868c63213ba3deaebd06bee99e537`, matching expected R7.2.0 commit. Tracked tree was clean at start; one pre-existing untracked task prompt was preserved.
- Test-first characterization only. No production behavior, public API, contracts, identity rules, or recovery policy changed.
- Added `tests/socket-peer-gateway-handshake.test.ts`; updated TD02 evidence in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md`, TD02 in `docs/architecture/TECHNICAL_DEBT.md`, current checkpoint in `docs/architecture/PROJECT_STATE.md`; created this report.

## Deterministic scenarios

1. **Isolated middleware-gap simulation — PASS, not real Socket.IO evidence.** The fake captures the middleware registered by `createSocketPeerGateway`, invokes it with valid auth and does not invoke the connection callback. `next()` succeeds and M06 retains `aaui -> fake-aaui-socket`. This proves only the isolated call sequence.
2. **Controlled local Socket.IO downstream rejection — REPRODUCED.** A local loopback Socket.IO server installs the production peer middleware, then a test-only second `/peers` namespace middleware calls `next(error)`. The client receives the controlled `connect_error`; the namespace `connection` callback does not run. M06 still contains the rejected `aaui` identity, and another `aaui` registration throws `peer already connected`. The cleanup assertion at `tests/socket-peer-gateway-handshake.test.ts:67` intentionally fails, preserving the evidence.
3. **Current production transport-abort race — NOT REPRODUCED.** The repository has only the peer-auth middleware on `/peers` (`socket-peer-gateway.ts:22–35`); the test adds a later rejecting middleware to control the phase. This proves Socket.IO can reject after registration when a later middleware exists, not that spontaneous transport interruption reaches this phase in the current single-middleware chain.

Observed order: M05 validates and calls `directory.register()` before `next()` (`src/infrastructure/socket/socket-peer-gateway.ts:25–35`). Namespace connection then looks up the identity (`37–41`). M05 installs the socket disconnect handler after connection handling starts (`socket-peer-gateway.ts:53–61`; `src/infrastructure/socket/peer-gateway.ts:96–128`). M06 removes only when the current connection ID matches (`src/modules/peer-messaging/peer-directory.ts:37–44`). In the reproduced rejection path, no connection callback installs that cleanup handler, so identity remains and blocks retry.

Existing invariants remain covered by `tests/peer-directory.test.ts:16–42` (duplicate rejection and connection-ID-safe removal), `tests/peer-connections.test.ts:11–43` (valid/invalid handshakes), and `tests/multiple-eservers.test.ts:64–70` (duplicate EServer instance). The new local scenario adds post-registration namespace rejection evidence; it does not alter EServer instance behavior.

## Policy question and stopping point

The test establishes an observable retained identity under controlled later-middleware rejection. The current application has no later `/peers` rejection middleware, so the frequency/reachability of spontaneous transport interruption in its current chain remains open. Review whether every post-registration namespace rejection must release its identity. Any remediation must remain connection-ID-safe so late cleanup cannot delete a newer identity. Do not add cleanup, takeover, timeout, retry, or other recovery behavior without that decision.

Await architectural review and the identity-cleanup policy decision. Stop before TD02 remediation and R7.2.B.

## Verification

All commands used Node 22.23.5.

- Focused `node --import tsx --test tests/socket-peer-gateway-handshake.test.ts`: **1 pass, 1 intentional failure**. Failure is the retained directory identity versus the cleanup invariant; exact actual value and stack were observed. Initial sandbox attempt hit `listen EPERM`; narrowly authorized loopback rerun reached the controlled rejection and produced the assertion failure.
- `npm run check:architecture`: PASS (52 source files, 113 edges; zero file runtime SCCs; one module runtime SCC reported).
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm test -- --test-concurrency=1`: **160 pass, 1 fail out of 161**; sole failure is the intentional new cleanup assertion.
- `npm --prefix testing run test:playground`: PASS, 32/32.
- `git diff --check`: PASS.

No production endpoints or runtime data were used. No commit or push.
