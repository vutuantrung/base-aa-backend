# R7.1.C — Integration Client Boundary

## Changes

- Added `src/infrastructure/integration-clients/index.ts` as the canonical M08 entry point for the existing HTTP and Socket.IO client classes and neutral `ConnectableMessageClient` type.
- Kept `src/shared/transport/connectable-message-client.ts` unchanged and free of infrastructure imports. Both client implementations continue to import its type only; implementation bodies and public constructors/signatures are unchanged.
- Kept `src/shared/transport/connectable-client.ts` as a documented legacy facade re-exporting the same classes from the M08 index and the neutral type.
- Migrated maintained integration tests and README example to M08 index. The old barrel is used only in focused compatibility verification; historical docs/prompts remain records.
- Added compile-time type assignments in both directions and runtime identity assertions for both canonical and legacy class exports. HTTP tests also verify content type and serialized request body; existing local HTTP/Socket.IO behavior tests remain.

## Dependency result

- Targeted search confirms the neutral interface has no infrastructure imports; M08 client implementations depend on it by type only.
- The remaining shared -> M08 runtime re-export is a narrow R5-D08 compatibility exception. Keep this explicit for future enforcement; it is not counted as a resolved dependency violation. No other maintained old-barrel consumers were found.
- Updated only M08/compatibility rows and TD01/TD17. Prior full graph counts (109 internal edges / 53 with runtime imports) remain historical; no full graph or SCC regeneration was performed.

## Verification

- Tested base HEAD: `7899cc2fb58c8a87a79870b4bc659eab9e70e34e` (R7.1.B accepted/committed).
- Node 22.23.5 typecheck and build passed. Focused integration-client/application integration tests: 5/5 passed.
- Serial backend: 145/145 passed; 0 failures, cancellations, or skips. The sandbox attempt produced 22 loopback listener failures; approved local execution passed.
- `npm --prefix testing run test:playground`: 5/5 file-level entries passed. Direct execution of all five unchanged test files passed 32/32 individual declared cases (21 + 3 + 3 + 3 + 2); this resolves the earlier 5-versus-32 reporting mismatch without changing playground tests.
- `git diff --check` passed. No production network/data used and no packages added.

## Changed paths and next step

- Source: `src/infrastructure/integration-clients/index.ts`, `src/shared/transport/connectable-client.ts`.
- Consumers/tests: `README.md`, `tests/integration-clients.test.ts`, `tests/integration.test.ts`.
- Context/docs: `docs/architecture/PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `DEPENDENCY_INVENTORY.md`, `TECHNICAL_DEBT.md`.
- Pre-existing prompt `R7_1_C_INTEGRATION_CLIENT_BOUNDARY_CODEX_PROMPT.md` remains untracked and untouched.
- Changes are uncommitted; no commit or push. Ready for review; stop before R7.1.D.
