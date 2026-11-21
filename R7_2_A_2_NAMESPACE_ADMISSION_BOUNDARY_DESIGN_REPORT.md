# R7.2.A.2 — Namespace Admission Boundary Design

## Baseline and scope

- Branch `main`, committed base `d3aee608d35f180a8e0df9a322241c1f422df8bb` (expected).
- Pre-existing local delta preserved: A.1 docs and `tests/socket-peer-gateway-handshake.test.ts`; task prompts are untracked. The A.1 test retains its intentional cleanup failure. No production code or tests were changed in this design checkpoint.
- Installed Socket.IO version: 4.8.4. No runtime test was rerun; lifecycle evidence is the A.1 local test/report plus installed package source.

## Observed lifecycle and ownership

`createSocketGateway()` constructs the `Server` and, when test peers are enabled, calls `attachPeerGateway()` before returning it (`src/infrastructure/socket/socket-gateway.ts:18–23`). `attachPeerGateway()` creates the M06 directory and calls `createSocketPeerGateway()` (`peer-gateway.ts:22–25`). That function calls `io.of('/peers')`, registers its current auth/identity middleware, then installs the namespace `connection` listener (`socket-peer-gateway.ts:21–39`). The normal application surface does not expose `io`; the returned gateway exposes neither namespace nor middleware registration. No other production source currently gets `/peers` or appends middleware. The A.1 test directly retains `ioServer` and appends one to force the downstream rejection case.

The namespace `.use()` is public and append-only from a holder of the namespace. Application wiring therefore gives M05 practical ownership by encapsulation, but Socket.IO itself does not reserve `.use()` for M05 or prevent a future internal caller/test/plugin with `io` access from adding a later rejecting middleware. This is an enforceable project construction boundary only if all `/peers` registration remains encapsulated and no raw server/namespace escapes; it is not a guarantee against arbitrary code with the server reference.

Socket.IO 4.8.4 public namespace middleware calls `next()` to continue and `next(error)` to reject. The public `connection` event indicates successful namespace admission; ordinary accepted-socket disconnect is observable on that socket. The A.1 real local test established that a later middleware `next(error)` produces client `connect_error`, does not fire namespace `connection` or server socket `disconnect`/`disconnecting`, and does not close the shared Engine.IO transport while `/session` remains connected. Package source (`dist/namespace.js`, `_add`/`run`) shows middleware is copied/run in order; rejection cleans up the pre-connect socket and sends `CONNECT_ERROR`, with no callback to the earlier middleware. These private implementation details support the observed version-specific result, not a stable public hook.

## Candidate designs

| Design | Claim / visibility | Duplicate and rejection behavior | Rollback and race limits |
|---|---|---|---|
| **1. M05 terminal admission gate, activate on `connection`** | Authentication/validation first; a final M05 gate checks identity; active M06 insertion occurs when `connection` fires. No pending identity is visible to directory queries. | If the final gate only checks then releases before `connection`, concurrent handshakes can both pass (TOCTOU). If the gate claims the identity in M06, it is already active/visible before acceptance and repeats the leak. Returning duplicate `next(error)` preserves current `connect_error` only if the gate can atomically reserve. | Activation on `connection` handles ordinary accepted disconnect. It cannot learn that transport closed after `next()` but before `connection`, nor any later middleware rejection. A final-gate ordering rule is insufficient for full rollback. |
| **2. M06 pending reservation, committed at accepted `connection`** | Atomically reserve `(peerId)` or `(eserver, instanceId)` in a separate pending map; `lookup`/`has`/presence/delivery/getConnection consult active entries only. At `connection`, commit that exact connection ID to active. | Reservation serializes concurrent claims; duplicate reservation returns existing duplicate `connect_error`. Rejection before reservation is harmless. Rejection after reservation needs rollback. | An earlier middleware cannot receive a terminal callback when a later middleware rejects; transport close may be shared and stay open. Public accepted-socket disconnect only exists after `connection`. Thus pending reservation can leak. Connection-ID keys protect stale cleanup after commit, but do not solve unknown pending terminal outcomes. Requires another approved boundary/hook. |

**Assessment:** neither design, alone, guarantees the approved invariant for every middleware rejection and transport abort using the public namespace API while retaining atomic duplicate `connect_error`. A M05-owned pipeline that forbids external downstream middleware can remove the demonstrated downstream-rejection path from production architecture, but it does not create a public signal for an abort in the gap between final `next()` and accepted `connection`. The current single auth middleware's spontaneous gap-abort has not been reproduced; the shared-namespace downstream rejection is directly reproduced.

## Proposed constrained direction and state model

If the policy owner accepts a scoped guarantee, the smallest public-API design is M05-only `/peers` middleware registration and a distinct pending claim in M06, followed by activation on `connection` and connection-ID-safe removal on ordinary disconnect. Rejecting auth/validation runs before reservation. No user code, extension point, or returned object may append middleware after the final admission stage. This preserves invisibility and duplicate atomicity during the middleware stage, but must be described as **not abort-complete** until a supported terminal outcome is supplied. Do not ship this partial reservation design under the stronger guarantee.

Proposed transitions: `unclaimed -> pending` atomically after validation; duplicate active/pending -> existing `connect_error`; `pending -> active` only on namespace `connection`; `active -> absent` only on matching connection-ID disconnect. `pending -> absent` is required for all terminal rejection/abort paths, but no public trigger covers all such paths in the present integration. Pending state must never be returned by `lookup`, `lookupConnection`, `has`, `listInstances`, `presenceSnapshot`, delivery policy or gateway `getConnection`.

## Deterministic local test matrix

| Scenario / seam | Expected invariant | Public-API status |
|---|---|---|
| Valid AAUI/SServer and EServer instance | Accepted `connection` activates exactly the intended singleton/instance identity; presence/delivery can see only active entries. | Testable with local Socket.IO and connection event. |
| Sequential duplicate AAUI, SServer, same EServer instance | Second gets existing `connect_error` shape; first stays active. Different EServer instances both accepted. | Testable locally. |
| Concurrent duplicate handshakes | At most one reservation/activation; loser gets duplicate error, no transient duplicate presence. | Testable with two clients and a deferred validation seam; must be designed without production hooks or timing races. A controlled middleware fake can prove atomic M06 operations but is not Socket.IO proof. |
| Upstream auth/validation rejection | No active or pending claim; original auth error remains. | Testable locally if rejection is owned before the admission gate. |
| Attempt to add downstream rejecting middleware | Architectural construction must not expose `/peers` namespace/server registration access; if a test deliberately holds `io`, it can still append middleware through public API. | Project encapsulation testable; absolute prevention is not offered by Socket.IO public API. Preserve A.1 controlled test as evidence, not as a supported extension point. |
| Abort after final `next()` before `connection`, with `/session` alive | No active identity; pending claim eventually cleared. | No reliable public server-side terminal seam identified. Requires alternative lifecycle integration or explicit residual-risk policy; do not use sleep/timers. |
| Stale A disconnect after B becomes active | A cleanup cannot remove B because removal matches connection ID. | Directory unit testable deterministically; public accepted-socket event test possible with controlled order. |
| Pending visibility | Pending claim absent from `lookup`, `has`, EServer snapshots, delivery and `getConnection`; active appears only after connection. | Directory/gateway unit seams testable; end-to-end accepted state locally. |
| Error shape / no production service | Duplicate remains a namespace `connect_error`; tests bind loopback/ephemeral port and use local clients only. | Testable locally. |

## Feasibility and decision needed

**Verdict: IMPLEMENTABLE_WITH_CONSTRAINTS** for an M05-owned namespace pipeline and ordinary accepted-connection lifecycle; **not implementable with public APIs as an abort-complete guarantee** in the present Socket.IO integration. The policy text combines atomic pre-acceptance uniqueness with rollback on outcomes Socket.IO does not expose to middleware. No source change is authorized by this design task.

Smallest decision: choose either (1) scope the guarantee to M05-controlled admission/ordinary public lifecycle and explicitly accept unresolved transport-abort cleanup risk, or (2) retain the stronger all-aborts guarantee and authorize investigation of a different supported integration boundary/API. Do not choose timeout cleanup, private API hooks, monkey-patching, or post-acceptance duplicate takeover implicitly.

If option 1 is approved: R7.2.A.3 should first implement the encapsulated pipeline and pending/active separation, then add focused deterministic directory and local Socket.IO tests (valid IDs, each duplicate class, concurrent claim, upstream rejection, active visibility, stale cleanup, error shape). Preserve the A.1 shared-transport rejection test as a documented non-production append scenario and keep its current red assertion unchanged until the new boundary is explicitly defined. If option 2 is selected, resolve the lifecycle mechanism before implementation. TD02 remains open; R7.2.B remains deferred.

## Verification and limits

- `node_modules/socket.io/package.json`: 4.8.4. Source review: `namespace.js` public `.use()` and private `_add`/`run`; `socket.js` accepted-socket disconnect lifecycle.
- Reused A.1 evidence: checker, typecheck/build, playground 32/32 passed; backend 160 pass / 1 intentional failure. These are historical, not rerun here.
- Docs-only changes: run `npm run check:architecture` and `git diff --check` at exit. No typecheck/build/backend/playground rerun. No production endpoint or data used.
