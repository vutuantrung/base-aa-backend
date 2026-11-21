# AAB — Current checkpoint

- Repository: `vutuantrung/base-aa-backend`; branch `main`. R6 and R7.1.0/V accepted. Reviewed source baseline remains `08614077a92946ac2718ac5a3c5c46d5d30467fe`.
- Provenance: R7.1.0 inventory `0bae390fa871aa4797c4d0b44f3cf083f84fdc8e`; R7.1.0 closure `61742f6ee7519612f6b412574a147429e4ab84f7`; R7.1.0-V environment verification `534419855148800e14180f45d719f0e3d9252080` (current tested base HEAD).
- R7.1.A/B/C are accepted/committed; C baseline is current HEAD `41d7215e98b85e46bfaa7a270280c9ebd2e91dad`. C established canonical M08 exports and retained the shared legacy compatibility exception. See [R7.1.C report](../../R7_1_C_INTEGRATION_CLIENT_BOUNDARY_REPORT.md).
- R7.1.D.1 is a documentation-only application-surface and consumer audit at base HEAD `41d7215e98b85e46bfaa7a270280c9ebd2e91dad`. It inventories all 11 application properties and config fields, overload/runtime behavior, known consumers, compatibility risks, and D.2 options. No narrowing or implementation is authorized. See [audit report](../../R7_1_D_1_APPLICATION_SURFACE_AUDIT_REPORT.md) and [evidence inventory](APPLICATION_SURFACE_INVENTORY.md).
- Checkpoint verification with Node 22.23.5 at the D.1 base plus docs-only diff: typecheck/build passed; backend 145/145; playground 32/32; diff check passed. Backend used approved loopback execution. No source/test/package/schema/config changes or untracked source/test files.
- Pre-existing untracked prompt `prompts/R7_1_D_1_APPLICATION_SURFACE_AUDIT_CODEX_PROMPT.md` is preserved. No commit/push. Next: user review/approval before D.2. Dependency enforcement is not established.
- Unresolved: M12–M15 APP/DEMO TBD; production PServer, Node 24 native SQLite and GUI demo unverified; dependency enforcement and bounded shutdown drain not established. Original R0–R5 decision records and `api-data.json` are absent from inspected tree; do not repeat this discovery.

## Read on demand
| Need | File / section |
|---|---|
| Runtime topology, flows, roadmap | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Ownership, files, dependency directions | [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) — find module ID |
| Decisions and evidence limits | [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) — find decision ID |
| Known risks and work sequencing | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) — find R7 step or debt ID |
| M02 public surface and consumer evidence | [APPLICATION_SURFACE_INVENTORY.md](APPLICATION_SURFACE_INVENTORY.md) |
| Historical implementation evidence | Root R6 reports referenced in relevant rows; open only when needed |

## Checkpoint protocol
Check HEAD/status first. If docs-only descendants of reviewed source baseline, no broad source re-audit required; if relevant source changed, inspect delta and update affected facts. A local uncommitted implementation must record base HEAD + changed file list and test status, not a future commit hash. Preserve unrelated changes. Keep this file short, replace current state rather than append history. Closure must record real validation outcomes and exceptions; full test rerun is required before claiming fresh PASS.
