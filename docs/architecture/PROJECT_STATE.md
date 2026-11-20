# AAB — Current checkpoint

- Repository: `vutuantrung/base-aa-backend`; branch `main`. R6 and R7.1.0/V accepted. Reviewed source baseline remains `08614077a92946ac2718ac5a3c5c46d5d30467fe`.
- Provenance: R7.1.0 inventory `0bae390fa871aa4797c4d0b44f3cf083f84fdc8e`; R7.1.0 closure `61742f6ee7519612f6b412574a147429e4ab84f7`; R7.1.0-V environment verification `534419855148800e14180f45d719f0e3d9252080` (current tested base HEAD).
- R7.1.A was committed/reviewed at `78df51b73050d9457ee0c127cd644e771220d79c`; R7.1.B was accepted/committed at current tested base HEAD `7899cc2fb58c8a87a79870b4bc659eab9e70e34e`. C adds the M08 canonical index and keeps the old shared barrel as the explicit compatibility exception; no client behavior changes or broad graph/SCC regeneration.
- R7.1.C verification at base HEAD `7899cc2fb58c8a87a79870b4bc659eab9e70e34e` plus local diff: Node 22.23.5 typecheck/build passed; focused client tests 5/5; backend 145/145; playground package command 5/5 file entries and direct per-file execution 32/32 individual cases; diff check passed. Sandbox backend attempt had 22 loopback failures; approved local run passed. See [R7.1.C report](../../R7_1_C_INTEGRATION_CLIENT_BOUNDARY_REPORT.md).
- Pre-existing untracked prompt `prompts/R7_1_C_INTEGRATION_CLIENT_BOUNDARY_CODEX_PROMPT.md` is preserved. No commit/push. Stop for review before R7.1.D. Dependency enforcement is not established.
- Unresolved: M12–M15 APP/DEMO TBD; production PServer, Node 24 native SQLite and GUI demo unverified; dependency enforcement and bounded shutdown drain not established. Original R0–R5 decision records and `api-data.json` are absent from inspected tree; do not repeat this discovery.

## Read on demand
| Need | File / section |
|---|---|
| Runtime topology, flows, roadmap | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Ownership, files, dependency directions | [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) — find module ID |
| Decisions and evidence limits | [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) — find decision ID |
| Known risks and work sequencing | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) — find R7 step or debt ID |
| Historical implementation evidence | Root R6 reports referenced in relevant rows; open only when needed |

## Checkpoint protocol
Check HEAD/status first. If docs-only descendants of reviewed source baseline, no broad source re-audit required; if relevant source changed, inspect delta and update affected facts. A local uncommitted implementation must record base HEAD + changed file list and test status, not a future commit hash. Preserve unrelated changes. Keep this file short, replace current state rather than append history. Closure must record real validation outcomes and exceptions; full test rerun is required before claiming fresh PASS.
