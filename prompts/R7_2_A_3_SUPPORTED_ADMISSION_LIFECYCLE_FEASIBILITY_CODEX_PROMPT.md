# Codex Task — R7.2.A.3: Supported Admission Lifecycle Feasibility

## Baseline and operating rules

Repository: `vutuantrung/base-aa-backend`, branch `main`, expected HEAD `ca3e1048808b825544e5b4dabf38ec5090e64aaf`.

1. Read `AGENTS.md` and `docs/architecture/PROJECT_STATE.md` first. Confirm branch, HEAD, `git status --short`. Never reset/stash/overwrite unrelated work; stop if relevant source drift conflicts with this checkpoint.
2. Read only: `R7_2_A_1_HANDSHAKE_IDENTITY_REMEDIATION_REPORT.md`, `R7_2_A_2_NAMESPACE_ADMISSION_BOUNDARY_DESIGN_REPORT.md`, `docs/architecture/R7_2_NAMESPACE_ADMISSION_DESIGN.md`; inspect relevant M05/M06 source, focused handshake tests, and installed Socket.IO 4.8.4 public API/contracts when needed. Avoid broad repository re-audits.
3. This is a **feasibility/decision** checkpoint, not authorization to change production source, public API, directory semantics, or commit/push.

## Approved invariants — do not silently weaken

- M05 owns the `/peers` namespace admission pipeline; rejecting checks must be ordered before the final admission stage; no exposed production downstream middleware registration.
- An identity is **active** only after successful namespace acceptance. Pending claims must not leak into `lookup`, `has`, snapshots, delivery, or getConnection.
- Atomic uniqueness: one accepted AAUI/SServer, one accepted EServer per instanceId; distinct EServer instances allowed. Preserve duplicate `connect_error` semantics, not post-acceptance takeover.
- Cleanup must remain connection-ID-safe. No late cleanup may remove a newer identity.
- Policy remains **all terminal rejection/abort outcomes must not retain pending claims** unless the policy owner explicitly approves a narrower guarantee. Do not infer that approval from A.2.

## Findings to respect

- A.1 reproduced controlled downstream rejection with `/session` sharing an open Engine.IO transport. Server namespace `connection`/`disconnect` and Engine.IO close do not provide the needed pending rollback signal in that scenario.
- A.2 concluded that neither final gate alone nor pending reservation alone proves abort-complete cleanup with public namespace middleware APIs; no supported terminal hook was identified. Existing source graph and absence of downstream middleware do not prove the spontaneous transport-abort gap safe.
- The intentionally failing A.1 cleanup assertion remains in default backend suite: historical 160 pass / 1 fail. Do not report a green suite. Do not delete, skip, weaken, or change that assertion without recording a narrowly justified test strategy and separate approval.

## Task — bounded feasibility investigation

Evaluate whether an **actually supported, maintainable** Socket.IO / Engine.IO integration boundary can provide a terminal outcome or avoid creating an unbounded claim at all, while keeping the full set of invariants. Investigate **at most three** credible alternatives; examples to assess, not assumed solutions:

1. A single M05-owned namespace admission function with no downstream rejecting middleware and a supported way to pair admission/acceptance lifecycle atomically.
2. A supported Engine.IO-level / socket lifecycle integration where namespace rejection and shared Engine.IO transports are handled correctly, with explicit evidence of API availability and event ordering.
3. An alternative public integration pattern that reserves/commits unique identity without a leak across pre-acceptance terminal paths.

For each alternative record: exact public API or source contract, state transitions, duplicate rejection timing/error shape, cancellation and shared-transport behavior, how pending claims are rolled back, connection-ID safety, testability, and expected compatibility impact. Separate **publicly supported guarantees** from **version-specific implementation internals** and hypotheses. Reject timer-only cleanup, private Socket.IO hooks, monkey-patching, implicit duplicate takeover, and speculative frameworks.

Use targeted local **throwaway experiments** if needed, but do not alter committed production code or existing tests. Avoid network beyond local loopback and do not access production PServer or user runtime data. If proof is unavailable, state `NOT PROVEN` rather than recommending a partial solution as complete.

Assess if a truly abort-complete design is feasible. If yes, provide the minimal implementation plan and exact deterministic acceptance matrix. If not, explicitly present a policy decision to the user with two choices:
- **Option A:** Accept a scoped M05-controlled admission guarantee and document residual spontaneous-abort risk, with bounded mitigation/operational observability, while avoiding claims of full cleanup.
- **Option B:** Keep all-aborts guarantee and defer remediation pending an alternative supported transport/protocol boundary.
Do **not** choose A or B on the user's behalf.

## Verification and deliverables

Produce:
- `R7_2_A_3_SUPPORTED_ADMISSION_LIFECYCLE_FEASIBILITY_REPORT.md` (concise decision report, proof/unknown matrix, no invented passes).
- Update `docs/architecture/R7_2_NAMESPACE_ADMISSION_DESIGN.md`, TD02 row in `docs/architecture/TECHNICAL_DEBT.md`, and `docs/architecture/PROJECT_STATE.md` only as necessary to reflect actual evidence and pending user decision.

At minimum run `npm run check:architecture` and `git diff --check`. If targeted experiments/tests are run, report actual results including the inherited intentional failure. Do not claim typecheck/build/backend/playground freshly passed unless rerun. Keep the known red baseline explicitly visible. No refactor, no production edits, no commits/push, no R7.2.B until policy review.
