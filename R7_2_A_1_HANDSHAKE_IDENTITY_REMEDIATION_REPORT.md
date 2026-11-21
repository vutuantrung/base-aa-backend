# R7.2.A.1 — Handshake Identity Remediation Design Investigation

## Baseline / changed paths

- Branch `main`, base HEAD `d3aee608d35f180a8e0df9a322241c1f422df8bb`, matching expected. Tracked tree was clean at start; pre-existing untracked task prompt preserved.
- No production code changed. The focused characterization test was extended to observe Socket.IO disconnect and Engine.IO transport-close events while a sibling namespace remains connected.
- Changed: `tests/socket-peer-gateway-handshake.test.ts`, `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` TD02-A/sequence, `docs/architecture/TECHNICAL_DEBT.md` TD02, `docs/architecture/PROJECT_STATE.md`; this report.

## Decision investigation

The approved invariant requires pending identity claims to be invisible until namespace acceptance, while duplicates must still fail in middleware with existing `connect_error` behavior. A pending reservation therefore needs an atomic claim before `next()`, a commit on accepted `connection`, and rollback on every rejected/aborted handshake.

Socket.IO 4.8.4 source evidence (`node_modules/socket.io/dist/namespace.js:209–243`, `socket.js:560–572`): on middleware error, `_add` removes the preconnect socket via `_cleanup()` and sends a `CONNECT_ERROR` packet. It does not emit namespace `disconnect`/`disconnecting`, nor does `Namespace.run()` provide the earlier middleware a terminal callback after later middleware returns an error. The namespace API exposes `.use()` but no rejection notification hook.

The local regression scenario now keeps `/session` connected through the same Socket.IO Manager while a later `/peers` middleware rejects. This demonstrates:

- client receives the intended `connect_error`;
- namespace `connection` is not accepted;
- server socket `disconnect` and `disconnecting` callbacks do not fire;
- Engine.IO remains `open` because the sibling namespace is connected; the raw `close` event does not fire;
- M06 still contains the rejected identity, and a retry is rejected as duplicate.

The test’s cleanup assertion remains intentionally failing. A raw Engine.IO close listener can clean up transport aborts only when the shared transport closes; it cannot cover namespace rejection while another namespace remains active. Registering only on `connection` would eliminate pending state, but duplicate attempts would reach acceptance before uniqueness is checked and could no longer preserve middleware `connect_error` semantics. A reservation plus timeout, private Socket.IO internals, or monkey-patching the middleware pipeline would invent an unapproved mechanism and is not used.

## Outcome and unresolved design conflict

The policy itself is clear; the current Socket.IO public lifecycle surface cannot implement it for all downstream namespace rejection paths while preserving atomic duplicate rejection. Stop before production remediation. A future design decision must provide an explicit M05-owned terminal outcome for the complete namespace middleware chain (including downstream errors) or authorize a different supported integration boundary. Do not proceed to TD02 remediation or R7.2.B until that design is reviewed.

Existing duplicate semantics remain covered by `peer-directory.test.ts` and `multiple-eservers.test.ts`; stale connection-ID removal remains covered by `peer-directory.test.ts`. Those are sequential/unit checks, not a new concurrent-handshake guarantee. No new concurrency test was added because no implementation was selected. Spontaneous transport interruption in the current single peer-middleware chain remains unverified.

## Verification (Node 22.23.5)

- Focused `node --import tsx --test tests/socket-peer-gateway-handshake.test.ts`: **1 pass, 1 expected failure** at the preserved cleanup assertion. The test additionally asserts open shared Engine.IO and absence of server disconnect events before that failure.
- `npm run check:architecture`: PASS; 52 tracked source files, 113 edges (51 runtime / 62 type-only), 0 file runtime SCCs; one module runtime SCC reported.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm test -- --test-concurrency=1`: **160 pass, 1 fail / 161**; sole failure is the known cleanup assertion.
- `npm --prefix testing run test:playground`: PASS, 32/32.
- `git diff --check`: PASS.
- No `listen EPERM` occurred during this task's focused run; local loopback only. No production endpoints or runtime data used.

Recommendation: keep TD02 open and resolve the lifecycle integration design before attempting the approved invariant. No commit or push; stop for review before R7.2.B.
