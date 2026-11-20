# R7.1.B — Protocol Transport Port

## Result

- Moved `PServerTransport` and `TransportEventHandler` to M04-owned `src/modules/pserver/contracts.ts` with the exact prior signatures.
- M04 protocol imports the canonical port locally. M03 Socket.IO adapter imports it type-only and re-exports both legacy types from `pserver-transport.ts`.
- Adapter mechanics, connector validation/logging/exports/wiring, protocol config/factory surface, session flow, dispatch handling, ACKs and timeouts were not changed.
- Existing fake transport now uses canonical types. Added bidirectional compile-time legacy/canonical assignments and deterministic cases for connect/close delegation, absent/negative/rejected registration ACKs, pre-ready inbound ACK and outbound rejection, ready outbound success/rejection with 5000ms timeout, and ready inbound messages without ACK callbacks.
- No packages, production endpoints, schema changes, or test weakening.

## Targeted dependency result

- Removed the M04 protocol -> M03 infrastructure type edge. Targeted source inspection confirms M04 has no infrastructure imports and M03 depends type-only on the canonical M04 port while retaining legacy exports.
- Updated only M03/M04 ownership and the affected inventory rows/findings. The historical 109 internal edges / 53 runtime-containing edges remain the R7.1.0 inventory counts; B did not regenerate the full graph or SCCs.
- This resolves the known M03/M04 reverse edge in the targeted inventory. M10↔M11 and other TD01 findings remain open; no broad dependency enforcement claim.

## Verification

- Tested base HEAD: `78df51b73050d9457ee0c127cd644e771220d79c`; R7.1.A reviewed/committed at this HEAD.
- Node 22.23.5: typecheck passed; build passed; focused protocol suite passed; serial backend 144/144 passed; playground command passed (5/5 top-level tests); `git diff --check` passed.
- Backend serial suite used approved local loopback access due to the known sandbox listener restriction. No production network or data used.

## Changed files and next step

- Source: `src/modules/pserver/contracts.ts`, `src/modules/pserver/pserver-protocol.ts`, `src/infrastructure/socket/pserver-transport.ts`.
- Tests: `tests/pserver-protocol.test.ts`.
- Context/docs: `docs/architecture/PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `DEPENDENCY_INVENTORY.md`, `TECHNICAL_DEBT.md`.
- Pre-existing prompt `prompts/R7_1_B_PROTOCOL_TRANSPORT_PORT_CODEX_PROMPT.md` remains untracked and untouched.
- B changes are uncommitted; no commit or push. Ready for review; stop before R7.1.C.
