# R7.1.A — Configuration Contracts

## Result

- Moved `VmInfo` and `PServerConnectionConfig` unchanged in shape to `src/modules/pserver/contracts.ts`.
- `pserver-connector.ts` re-exports both types from the legacy import path. Its runtime implementation, event exports, auth handling, and logging are unchanged.
- M01 configuration and M02 app composition import canonical types. M01 has no infrastructure or connector import.
- M04 `PServerProtocolConfig.vmInfo` now uses canonical `VmInfo`; the public interface remains structurally the same.
- Environment parsing, defaults, exact feature flags, socket path, port coercion/range checks, SQLite opt-in, and protocol/transport behavior were not modified.
- Added configuration defaults and override coverage, feature gate/flag and port edge coverage, and actual compile-time assignments between canonical/legacy types, `ApplicationConfig`, `ResolvedConfiguration`, and `PServerProtocolConfig`.
- No packages added. No external services or production data used.

## Targeted dependency result

- Resolved the M01 -> M03 type edge by using M04's neutral contracts; preserved the connector's legacy public type exports.
- Updated only the corresponding inventory edge/finding and module ownership notes. Prior full graph counts remain 109 internal edges / 53 with runtime imports; this change is a targeted delta, not a graph re-audit.
- M04 -> M03 concrete transport type dependency remains for R7.1.B. Other SCCs and dependency enforcement are not claimed resolved.
- TD01 remains open for R7.1.B–E.

## Verification

- Tested base HEAD: `534419855148800e14180f45d719f0e3d9252080`; reviewed source baseline: `08614077a92946ac2718ac5a3c5c46d5d30467fe`.
- Node 22.23.5: typecheck passed; build passed; serial backend suite 137/137 passed; playground 32/32 passed; `git diff --check` passed.
- Focused configuration/protocol tests passed. Five listener suites first failed in the sandbox with the known loopback `listen EPERM`; approved local execution then passed all 12 tests. No tests were changed to accommodate the restriction.
- Targeted import search found no infrastructure reference in `src/config/configuration.ts`.

## Changed files and next step

- Source: `src/modules/pserver/contracts.ts`, `src/config/configuration.ts`, `src/infrastructure/socket/pserver-connector.ts`, `src/modules/pserver/pserver-protocol.ts`, `src/app/create-app.ts`.
- Tests: `tests/configuration.test.ts`.
- Context/docs: `AGENTS.md`, `docs/architecture/PROJECT_STATE.md`, `MODULE_BOUNDARIES.md`, `DEPENDENCY_INVENTORY.md`, `TECHNICAL_DEBT.md`.
- Pre-existing prompt `prompts/R7_1_A_CONFIGURATION_CONTRACTS_CODEX_PROMPT.md` remains untracked and untouched.
- All changes are uncommitted; no commit or push. R7.1.A is ready for review. Stop before R7.1.B.
