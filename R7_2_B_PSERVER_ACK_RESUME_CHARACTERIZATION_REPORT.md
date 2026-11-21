# R7.2.B — PServer Deferred ACK & Resume Characterization

## Baseline and scope

- Branch `main`; committed base `75d728081a3713ec87e6c99139a3ab5a00b71dcc`, matching the updated A.4 acceptance SHA. Tree was clean at start.
- Reran baseline backend suite before edits on Node 22.23.5: **161/161 passed**.
- Changes are limited to `tests/pserver-protocol.test.ts`, TD03 in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` and `docs/architecture/TECHNICAL_DEBT.md`, `docs/architecture/PROJECT_STATE.md`, and this report. No production source, public interface, schema, or behavior changed.
- TD02 Option B remains selected and OPEN; no handshake admission changes. No production PServer connection or runtime data used.

## Characterized behavior

`FakeTransport` now queues externally controlled promises for each `SESSION_CONNECT_EVENT`; test outcomes resolve or reject them explicitly without sleeps. Ordinary baseline confirms transport-connected before ACK is not session-ready and becomes ready after valid ACK. The 10,000 ms session ACK timeout, 5,000 ms peer delivery ACK timeout, event names, and VM/resume payloads remain asserted.

- **ACK after disconnect, before reconnect:** after `disconnect`, a valid ACK mutates `sessionId` and internal `sessionReady`. `transport.connected`, public `protocol.connected`, and registered gateway `isConnected()` stay false. The current protocol inbound/outbound handlers check `sessionReady` rather than transport state: with this fake, inbound `peer:message` is passed to the gateway and outbound `deliver` emits despite the transport being disconnected. Fake transport emission is a protocol-state observation, not network delivery evidence.
- **ACK1 after connect2 begins:** connect2 transmits `vmInfo` because ACK1 has not yet supplied an ID. Resolving ACK1 sets public and gateway readiness true on transport2 before ACK2. Resolving ACK2 then replaces the session ID.
- **Out-of-order:** resolving ACK2 first sets the newer ID; subsequently resolving ACK1 overwrites it with the older ID while readiness remains true.
- **Resume rejection after established ID:** missing, negative, and rejected resume outcomes leave transport connected but protocol/gateway readiness false; `sessionId` remains `established-session`; outbound delivery rejects as not registered. The next connect again sends `{ session_id: 'established-session' }`; a subsequent valid ACK restores readiness.
- Existing pre-ready inbound ACK (`UNSUPPORTED_DESTINATION`), no-ingest behavior, ready inbound ACK forwarding, outbound not-ready rejection, exact outbound ACK timeout, and failed delivery ACK behavior remain covered.

These are **Observed by deterministic fake** for current callback/state ordering. They do not reproduce PServer network timing. Whether a real PServer can deliver these ACK interleavings is **Unverified**. No stale-ACK ignore rule or rejected-resume clearing/fallback/retry policy is selected; compatibility decisions remain for a later approved remediation task.

## Verification (Node 22.23.5)

- Focused `node --import tsx --test tests/pserver-protocol.test.ts`: **14/14 passed**.
- `npm run check:architecture`: **PASS**; 52 files, 113 edges (51 runtime / 62 type-only), 0 runtime file SCCs; one module runtime SCC reported.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `npm test -- --test-concurrency=1`: **165/165 passed**.
- `npm --prefix testing run test:playground`: **32/32 passed**.
- `git diff --check`: **PASS**.

Stop after this characterization for review. TD03 fixes and R7.2.C are out of scope; no commit/push.
