# R7.2.A.3 — Supported Admission Lifecycle Feasibility

## Baseline and scope

- `main` at expected committed HEAD `ca3e1048808b825544e5b4dabf38ec5090e64aaf`; tree clean at start. The only untracked path was this checkpoint's prompt.
- Installed Socket.IO is 4.8.4. No source/test changes or runtime experiments were made. A.1's local test/report remains the only real-socket rejection evidence; it intentionally fails its active-identity cleanup assertion (historical backend 160/161).
- Review was limited to the A.1/A.2 reports, admission design, M05/M06 wiring, focused handshake test, and installed Socket.IO/Engine.IO public declarations plus version-specific implementation where needed.

## Evidence and candidate designs

| Candidate | Supported contract / proposed transitions | Duplicate, rollback, shared transport, compatibility | Finding |
|---|---|---|---|
| **1. M05-owned single admission pipeline; activate at accepted `connection`** | Public `Namespace.use()` registers middleware; public `connection` is emitted for an accepted namespace socket. M05 can encapsulate the `/peers` namespace and order all rejecting checks before its final admission stage. Activation on connection gives active-only visibility; accepted disconnect can use connection-ID-safe cleanup. | Checking uniqueness then calling `next()` leaves a concurrent TOCTOU window. Reserving atomically before `next()` solves duplicate concurrency but creates pending state needing rollback if final acceptance never occurs. A later middleware rejection is prohibited by project composition but remains possible to code holding `io`; an abort after final `next()` has no earlier-middleware terminal notification. Moving uniqueness solely to `connection` makes duplicate rejection post-acceptance and changes `connect_error` semantics. | **NOT PROVEN abort-complete.** Supported for ownership/order and accepted lifecycle only. Does not satisfy current all-terminal-outcomes policy. |
| **2. Pending claim in M06; commit on namespace `connection`** | M06 can maintain a separate pending-key map and active identity map. Claim singleton AAUI/SServer or `(EServer, instanceId)` after auth, reject active/pending duplicate through existing middleware `next(error)`, then commit on accepted `connection`; active queries omit pending. | Atomic claim and current duplicate error shape are feasible. Rollback is required on every rejection/abort before connection. Public namespace middleware API has no “the full chain terminated” callback for an earlier middleware. Public accepted socket disconnect does not apply before acceptance. Engine close is not enough for a shared transport. API and identity shapes could remain unchanged if pending is private, but the all-aborts guarantee cannot be demonstrated. | **NOT PROVEN complete.** Strong active/pending model, incomplete terminal transition. |
| **3. Reserve at Engine.IO transport lifecycle** | Engine.IO publicly exposes `Server.use()` for HTTP handshake requests and a transport `connection` event/socket `close` lifecycle. This boundary can reject/observe transport handshakes and terminal transport closure. | Engine.IO middleware and `connection` occur before Socket.IO namespace CONNECT identifies `/peers`; Engine.IO APIs have no public namespace-acceptance callback or namespace rejection event. A reservation there is transport-scoped, so it cannot safely map one `/peers` claim when `/session` or another namespace shares the transport. Transport close does not occur on namespace rejection when a sibling namespace stays open (A.1 reproduced). Rejecting at transport level would also change behavior for non-peer namespaces and duplicate `connect_error` shape. | **Rejected.** Public transport lifecycle is the wrong scope; no rollback signal for namespace-only terminal outcomes. |

## Lifecycle evidence: public contract versus implementation detail

Public Socket.IO declarations document `Namespace.use(socket, next)` and the namespace `connection` event; `Socket` exposes accepted-socket disconnect lifecycle. Public Engine.IO declarations document handshake middleware, transport connection and close. They do not document a callback from `Namespace.use` to an earlier middleware after later rejection, a pre-acceptance namespace abort event, or a mapping from Engine.IO handshake middleware to the eventual namespace admission decision.

Version-specific source in installed 4.8.4 (`socket.io/dist/namespace.js`) copies/runs the middleware chain, and on error cleans the pre-connect socket and sends CONNECT_ERROR. That path does not emit the accepted socket's disconnect events or call earlier middleware. This implementation inspection is explanatory evidence for the pinned installed version, not an extension contract. A.1's loopback test with `/session` sharing Engine.IO observed no peer namespace connection/disconnect and no transport close after controlled later middleware rejection.

The spontaneous transport abort between the final successful middleware `next()` and namespace `connection` has not been reproduced with a deterministic public synchronization seam. It remains **NOT PROVEN safe**. Lack of production downstream middleware reduces one known rejection path but does not prove this abort gap is impossible.

## Feasibility decision

**A truly abort-complete design satisfying all approved invariants is not proven feasible through the currently identified Socket.IO/Engine.IO public APIs.** The integration offers a namespace acceptance event and accepted-socket disconnect, but no reliable namespace-scoped terminal event for a reserved pre-acceptance attempt. Engine.IO observes transport lifetime, not namespace lifetime. A gate without reservation risks concurrent duplicate admission; a reservation needs a rollback signal that is absent. Do not implement a partial design as if it meets the all-aborts policy.

## Decision required from policy owner

- **Option A — scoped guarantee:** authorize an M05-controlled pipeline, pending/active separation and accepted-connection lifecycle, while explicitly accepting residual spontaneous-abort cleanup risk. Add bounded operational observability for aged pending claims only if separately specified; a timer must not release identity or be represented as proof of rollback. Duplicate rejection remains atomic; pending stays invisible; no post-acceptance takeover.
- **Option B — retain all-aborts guarantee:** defer remediation until a different supported transport/protocol integration boundary can provide a namespace-scoped terminal outcome, or until such an API is established. Keep the intentional A.1 regression failure as evidence. No private hook, monkey-patch, timeout cleanup, or changed error semantics.

No option is selected here. TD02 remains open; R7.2.B is not started.

## If a design is later approved: minimum acceptance matrix

Use local loopback only, deterministic gates/deferred promises, and no sleeps. Verify valid AAUI/SServer and EServer identities; duplicate AAUI, SServer and same EServer instance with unchanged `connect_error`; distinct EServer instances; concurrent same-key handshakes with exactly one admission; upstream auth rejection; downstream middleware unavailable through production composition; active/pending separation across lookup, `has`, snapshots, delivery and `getConnection`; accepted disconnect cleanup; stale A cleanup preserving B; shared `/session` transport; and an abort between gate and `connection`. The last case must have a supported synchronization/terminal signal and assert pending is cleared. If that seam cannot be supplied, mark the all-aborts criterion unresolved rather than passing by fake-only sequence.

## Verification and changed paths

- `npm run check:architecture`: PASS on Node 22.23.5; 52 files, 113 edges (51 runtime, 62 type-only), 0 runtime file SCCs; one module runtime SCC reported.
- `git diff --check`: PASS.
- No targeted runtime experiment/test was run. Historical A.1 results only: backend 160 pass / 1 intentional failure; playground 32/32. Typecheck/build/backend/playground were not rerun.
- Changed paths: this report; `docs/architecture/R7_2_NAMESPACE_ADMISSION_DESIGN.md`; TD02 in `docs/architecture/TECHNICAL_DEBT.md`; current R7.2 status in `docs/architecture/PROJECT_STATE.md`. No production/test code changed; no commit/push.
