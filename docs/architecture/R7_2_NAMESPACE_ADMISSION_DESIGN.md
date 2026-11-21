# R7.2 Namespace Admission Boundary Design (TD02)

## Status and invariant

Design only; no production implementation is authorized by this document. Base evidence is R7.2.A.1 at `d3aee608d35f180a8e0df9a322241c1f422df8bb`; see the [A.1 characterization and lifecycle report](../../R7_2_A_1_HANDSHAKE_IDENTITY_REMEDIATION_REPORT.md) and [A.2 design report](../../R7_2_A_2_NAMESPACE_ADMISSION_BOUNDARY_DESIGN_REPORT.md).

Approved policy: only an accepted `/peers` namespace connection may be active in M06; uniqueness remains atomic for AAUI, SServer and `(EServer, instanceId)`; cleanup remains connection-ID-safe. Existing identity and `connect_error` semantics remain constraints.

**Evidence:** M05 constructs the Socket.IO server and attaches the peer gateway internally. Current application callers do not receive `io`; production source has no other `/peers` middleware registration. Socket.IO 4.8.4 namespace `.use()` is public and appends middleware, so encapsulation can enforce the project construction boundary but cannot prevent any holder of `io` from appending middleware.

The A.1 local test reproduced a later namespace middleware rejection after M05 registration, including a sibling `/session` namespace on the same Engine.IO connection. `connect_error` occurred; namespace `connection`, socket `disconnect`/`disconnecting`, and Engine.IO `close` did not. Socket.IO public middleware API does not notify an earlier middleware when later middleware rejects or when transport disappears after `next()` but before connection acceptance. This is a version-checked evidence limit; package internals are not treated as a supported hook.

## Ownership and proposed state model

M05 owns all `/peers` authentication, validation, uniqueness sequencing, and admission middleware registration. No raw `io`/namespace registration capability is to escape the M05 composition boundary. This is a project API rule, not a Socket.IO-enforced restriction.

A possible constrained design separates M06 pending claims from active identities:

| Transition | Proposed behavior |
|---|---|
| `unclaimed -> pending` | After authentication/validation, atomically claim singleton peer ID or EServer instance key. Pending entries are private to uniqueness checks. |
| Duplicate active or pending claim | Reject with the existing duplicate `connect_error` behavior. |
| `pending -> active` | Only on accepted namespace `connection`; store the exact connection ID. |
| `active -> absent` | On ordinary accepted-socket disconnect, remove only if identity and connection ID still match. |
| `pending -> absent` | Required on every rejection/abort terminal outcome. No current public hook covers all such outcomes. |

Pending identities must never be returned by `lookup`, `lookupConnection`, `has`, `listInstances`, `presenceSnapshot`, delivery resolution or gateway `getConnection`. Active presence starts only after namespace `connection`.

A terminal gate plus activation on connection avoids visible pending identity, but a check without reservation permits concurrent duplicates (TOCTOU). An atomic pending reservation closes that race but can leak if a downstream middleware rejects or transport aborts before connection. Existing public APIs do not provide the earlier middleware a terminal rollback callback. Therefore the pending model is incomplete for the full approved all-aborts guarantee and must not be implemented as if it were complete.

## Failure and compatibility constraints

- Authentication and other rejecting checks precede any claim.
- M05 must be the only project registration owner; downstream rejecting middleware is prohibited by architecture.
- Duplicate AAUI/SServer and duplicate EServer instance remain rejected atomically; distinct EServer instances remain allowed.
- `connect_error` behavior remains the rejection surface where the namespace lifecycle allows it.
- Ordinary disconnect cleanup is connection-ID-safe; late cleanup for A cannot remove B.
- A rejected middleware socket is not an accepted socket; do not assume its `disconnect` event or Engine.IO close will fire.
- Do not infer that transport-close cleanup works when another namespace shares the Engine.IO connection.
- No timeout guess, Socket.IO private hook, monkey-patch, takeover, or post-acceptance replacement is approved.

## Focused test matrix

| Case | Deterministic seam | Required assertion | Public API status |
|---|---|---|---|
| Valid AAUI/SServer and EServer instance | Local client; await accepted namespace connection | Active identity appears with correct logical/instance ID | Testable |
| Duplicate AAUI/SServer and same EServer instance | Two local handshakes; await each connect/error | One active; duplicate receives existing `connect_error`; first remains active | Testable |
| Distinct EServer instances | Two local handshakes with distinct instance IDs | Both active and independently addressable | Testable |
| Concurrent same-identity attempts | Controlled local client start and M06 atomic claim; no sleeps | Exactly one winner, loser duplicate error, no duplicate active presence | Public integration test feasible; mock-only claim test is not Socket.IO proof |
| Upstream auth/validation rejection | M05-owned rejection before admission | No pending or active identity; auth error unchanged | Testable if ordering is encapsulated |
| Downstream middleware attempt | Test construction surface and deliberately held server reference | Normal application cannot register downstream middleware; raw holder still can | Project boundary testable; absolute API prohibition impossible |
| Abort between final `next()` and `connection`, sibling `/session` open | Requires a terminal server-side synchronization signal | No active identity and pending claim removed | No supported public terminal seam currently identified; unresolved |
| Stale A disconnect after B active | Direct connection-ID-safe removal or ordered local sockets | B remains active | Deterministic unit test; local event test possible |
| Pending versus active visibility | Inspect all directory and gateway query surfaces around controlled gate | Pending absent from lookup/presence/delivery/getConnection; accepted active visible | Internal unit seam plus local acceptance test |
| Rejection shape / isolation | Loopback ephemeral server and local clients only | Duplicate `connect_error` shape preserved; no production connection | Testable |

## Feasibility and next decision

R7.2.A.3 examined the M05 gate, separate M06 reservation, and Engine.IO transport boundary. Verdict: a truly abort-complete design satisfying the current all-terminal-outcomes policy is **NOT PROVEN** with the identified public APIs. Socket.IO exposes namespace middleware and accepted `connection`, but no reliable namespace-scoped terminal outcome to roll back a pending claim after `next()`; Engine.IO lifecycle is transport-scoped and cannot distinguish `/peers` rejection while `/session` remains open. The 4.8.4 source behavior and the A.1 local shared-transport rejection test are evidence, not a new public hook.

**Decision: Option B selected by the architecture owner.** Retain the all-terminal-rejection/abort cleanup requirement; defer remediation until a supported namespace-scoped lifecycle boundary is established. TD02 remains OPEN. Do not implement partial reservation as complete, use timeout cleanup, private APIs, monkey-patching, or alter duplicate error semantics. The downstream middleware rejection is a reproduced current defect; spontaneous abort in the present single-middleware production composition remains unverified. A.4 changes only the test from an intentionally failing proof-of-defect assertion to a passing current-behavior characterization that asserts identity retention and duplicate retry rejection; it does not fix the defect. See the [A.3 feasibility report](../../R7_2_A_3_SUPPORTED_ADMISSION_LIFECYCLE_FEASIBILITY_REPORT.md) and [A.4 report](../../R7_2_A_4_TD02_PASSING_CHARACTERIZATION_REPORT.md).
