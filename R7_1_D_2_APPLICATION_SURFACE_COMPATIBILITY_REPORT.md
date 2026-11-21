# R7.1.D.2 — Application Surface Compatibility Verification

## Scope and baseline

- Verified `createApplication` / `ApplicationInstance` compatibility against D.1 inventory; no production source or public contract changes.
- Base: `main` at committed D.1 HEAD `e88bbe909f22d602ade889e9e816d07fc5630d8c`; implementation/test delta is one new focused test file. Existing untracked prompt `prompts/R7_1_D_2_APPLICATION_SURFACE_COMPATIBILITY_CODEX_PROMPT.md` was preserved.
- Runtime: Node 22.23.5, optional `better-sqlite3` installed.

## Evidence matrix

| Area | Outcome | Evidence |
|---|---|---|
| Type overloads | PASS | Compiler-checked omitted, literal `true`, literal `false`, and dynamic boolean calls. Enabled handles assign to concrete session/usage/catalog classes; broad/disabled handles assign to optional concrete types. `ResolvedConfiguration.application` is accepted by `startApplication`; close-only object accepted by `stopApplication`. |
| SQLite runtime | PASS | Omitted/true produce repositories; false/dynamic values match runtime. Session create/get/list and usage create/list work. Existing isolation tests plus focused assertions show separate in-memory app state. |
| Catalog compatibility | PASS | Existing concrete repository tests exercise all five upserts (`upsertAa`, `upsertBrowser`, `upsertExtension`, `upsertActivity`, `upsertTask`) and read methods; application integration verifies concrete catalog availability and isolation. No writer port added. |
| PServer conditions | PASS | Connector absent with peers disabled or PServer missing; present only with both supplied, initially disconnected. `close()` cleans resources without invoking `listen()`; no production endpoint contacted. |
| Lifecycle | PASS | `listen(0)` returned the actual bound port; `close()` released it. `startApplication` with resolved config and close-only `stopApplication` behavior verified. |
| Public compatibility | PASS | Existing `ApplicationInstance` properties, constructors, overloads, catalog concrete assignment, and optional inferred connector shape remain unchanged. No defect found. |

## Verification

- Focused tests: 25/25 cases across the new test and four existing catalog/session/usage files. Initial sandbox attempt failed on loopback `listen EPERM`; the same focused command passed after narrowly authorized execution.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm test -- --test-concurrency=1`: PASS, 149 individual cases (all passed; 0 skipped), across the backend suite.
- `npm --prefix testing run test:playground`: PASS, 32 individual cases (all passed; 0 skipped).
- `git diff --check`: PASS.

## Changed paths and decisions

- Added `tests/application-surface-compatibility.test.ts` only. No production changes and no inventory/debt edits because evidence confirms the existing contracts and decisions without changing them.
- Updated `docs/architecture/PROJECT_STATE.md` for the D.2 verification checkpoint and next step.
- No unresolved public API decision was exercised or implied. External consumer discovery remains incomplete; compatibility confidence is limited to repository consumers and D.1 evidence.
- Recommend closing D.2 without production modifications. Do not start R7.1.E without separate authorization.
