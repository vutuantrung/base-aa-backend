# R7.1.0 — Dependency Inventory Verification

## Baseline and state

- Repository `vutuantrung/base-aa-backend`; branch `main`; current docs HEAD `61742f6ee7519612f6b412574a147429e4ab84f7`.
- Reviewed source baseline `08614077a92946ac2718ac5a3c5c46d5d30467fe`; source/test/dependency/schema/config diffs: none. Untracked source/test files: none.
- Existing untracked user prompt `prompts/R7_1_0_DEPENDENCY_INVENTORY_CODEX_PROMPT.md` preserved. Documentation changes are uncommitted.
- R6 Closure accepted in review. No R7.1.A implementation was performed.

## Audit result

- TypeScript API scan of tracked source resolved 109 internal import/export edges, including type-only and runtime syntax. NodeNext `.js` resolution succeeded for every relative edge. No dynamic imports, `require`, side-effect-only imports, unresolved relative imports or file SCCs were found in scanned `src`.
- Ownership map explicitly accounts for M01–M18 and separately labels shared support, compatibility facades, example and `tools/utils.ts` (unmapped, no internal consumers). App/runtime, test/playground and external package edges are distinguished in [DEPENDENCY_INVENTORY.md](docs/architecture/DEPENDENCY_INVENTORY.md).
- Module-level runtime graph has no non-trivial SCC. All-import module graph has M03↔M04 and M10↔M11 aggregation SCCs, caused by type-only reverse edges; no file-level SCC exists. This does not prove the absence of runtime DI/composition cycles.
- Targeted findings classify configuration/connector types and protocol/concrete transport as candidates; shared client barrel and old store exports as compatibility debt; M02/M05 composition as intentional; neutral shared message contracts as acceptable. `MessageBus`/tools utils showed no consumers in tracked source/tests/playground.
- Concrete M02 repository handles are part of the returned API; tests call catalog upserts, but production callers were not found. Do not remove/narrow without public compatibility review.
- R4-D03, R5-D01–03, R5-D07–08; TD01 and TD17 were applied as design criteria. No original decision records were re-searched.

## Proposed bounded sequence

1. **A Configuration contracts:** isolate neutral PServer config/value types; preserve current public config shapes and add config/connector type and runtime coverage.
2. **B Protocol transport port:** invert M04’s type dependency from concrete transport to a small port; preserve protocol events/ACK semantics and test protocol against a fake.
3. **C Integration-client boundary:** separate shared client interface from implementation re-exports; retain compatibility path while existing consumers migrate.
4. **D Application composition surface:** clarify neutral API ports while retaining concrete repository handles until public compatibility policy is decided; test overloads and optional SQLite/API behavior.
5. **E Enforcement:** only after approved exceptions and contracts, add deterministic tracked-source graph checks covering type/runtime edges, resolution and SCCs.

Detailed affected files, allowed directions, risks, prerequisites and acceptance checks are in the linked dependency inventory. R7.2–9 and M12–M15 TBD behavior remain deferred. Next step is review and explicit authorization; this audit grants none.

## Verification

- Node 22.23.5: typecheck PASS; build PASS; playground 32/32 PASS; `git diff --check` PASS.
- Backend command `npm test -- --test-concurrency=1`: FAIL at Node test-file worker startup; 16/38 files passed, 22 failed with worker `exitCode: 1`, `ERR_TEST_FAILURE` and no per-test assertion details in the emitted summary. This differs from the R6 135-case baseline; it is not reported as a pass.
- Static inventory used TypeScript API with repository `tsconfig.json`. No packages or persistent tooling were added.
