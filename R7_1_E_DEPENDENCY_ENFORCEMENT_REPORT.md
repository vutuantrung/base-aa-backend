# R7.1.E — Dependency Enforcement

## Baseline and changed paths

- Tested base: `main` at committed D.2 HEAD `1c47c1a3b30f8038143c8c569c7ec120fec91dba`.
- Final HEAD remains that SHA; the working tree is dirty and the staged diff is empty. Tracked dirty paths: `package.json`, `docs/architecture/PROJECT_STATE.md`, `docs/architecture/DEPENDENCY_INVENTORY.md`, `docs/architecture/MODULE_BOUNDARIES.md`, and `docs/architecture/TECHNICAL_DEBT.md`; new untracked deliverables are this report, `scripts/check-architecture.ts`, and `tests/architecture-check.test.ts`. Changed paths: `package.json`, `scripts/check-architecture.ts`, `tests/architecture-check.test.ts`, `docs/architecture/PROJECT_STATE.md`, `docs/architecture/DEPENDENCY_INVENTORY.md`, `docs/architecture/MODULE_BOUNDARIES.md`, `docs/architecture/TECHNICAL_DEBT.md`, and this report. The pre-existing untracked task prompt is preserved.
- No application behavior/API/schema/config changes. No compatible CI workflow exists; workflow integration is pending.

## Ownership and rule matrix

| Source ownership / boundary | Enforced behavior |
|---|---|
| Explicit file map for M01–M18, Support and Example | Every tracked `src/**/*.ts` path must have exactly one entry. Unknown/new files fail with an actionable mapping diagnostic. `transformation-registry.ts` maps to M11; peer service/contracts/policy and legacy store facades map to M10. M12–M15 retain existing TBD classifications. |
| M01 configuration -> infrastructure | Reject runtime and type-only edges. |
| M04 PServer modules -> infrastructure | Reject runtime and type-only edges. |
| Neutral shared contracts (`shared/contracts/message.ts`, `shared/transport/connectable-message-client.ts`) | Reject imports into infrastructure. M08 may depend on these contracts only by type-only edges. |
| Shared -> infrastructure compatibility | Reject every edge except exact runtime `export { HttpMessageClient, SocketMessageClient }` from `shared/transport/connectable-client.ts` to `infrastructure/integration-clients/index.ts`. Wrong source, target, syntax, kind, or symbols fail. |
| File/runtime graph | Resolve relative imports and re-exports with TypeScript NodeNext; reject unresolved/out-of-graph local edges and file runtime SCCs including self-loops. Report module runtime SCCs for review without blanket rejection. |
| Intentional composition | M02 concrete composition and M05 M12/M13 orchestration remain allowed; M08 neutral-client type use is allowed as specified. No general layer direction was inferred. |

## Fresh graph result

`npm run check:architecture` scanned **52 tracked source files** and **113 resolved edges**: **51 runtime**, **62 type-only**. These are fresh R7.1.E metrics and are distinct from historical R7.1.0's 109/53 figures.

- Runtime file SCCs: **0**.
- Module runtime SCCs: **1**, `M10↔M12↔M13` (reported for review; intentional existing composition/compatibility edges are not automatically failed).
- Module all-import SCCs: **1**, `M06↔M10↔M11↔M12↔M13`. M10↔M11 is the existing M11 type-only dependency on M10 contracts, not a runtime cycle.
- Exact R5-D08 compatibility exception: present and accepted once in the production graph.
- No unresolved relative specifiers, untracked local targets, dynamic imports, `require`, or side-effect-only imports in current tracked source. Fixtures verify these syntax paths; dynamic import and require are explicitly rejected pending support.

## Tests and verification

- Architecture checker fixtures: 10 focused cases passed, covering legal type-only `.js` resolution, named type-only export/import, unresolved paths, M01/M04 type edges, shared-contract boundary, M08 type-only contract use, exact exception and wrong symbol/path, runtime versus type-only cycles, unknown ownership, side-effect imports, dynamic import and `require` rejection.
- `npm run check:architecture`: PASS.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- `npm test -- --test-concurrency=1`: PASS, **159/159 individual backend cases**.
- `npm --prefix testing run test:playground`: PASS, **32/32**.
- `git diff --check`: PASS.
- Node 22.23.5 used. The first sandbox run of the checker hit `spawnSync git EPERM`; the approved rerun passed. An intermediate typecheck caught an empty-import narrowing issue, fixed before final verification. Backend listener tests passed without permission failures.

## Remaining limits / next step

- Static syntax graph only; it does not model dependency injection, late-bound closures, computed loading or runtime behavior. Dynamic `import()` and `require()` are detected and rejected rather than analyzed.
- No CI workflow exists; adding invocation awaits an existing/adopted CI workflow.
- TD01 is partly addressed: targeted dependency rules are enforced, while neutral/shared ownership and unknown external M02 API consumers remain open decisions. TD17 remains open for compatibility facades, unused `MessageBus`, and `tools/utils.ts`; no removal was authorized.
- The M10↔M12↔M13 module runtime SCC is surfaced for review. No R7.2 work started. Stop here for user review; no commit or push.
