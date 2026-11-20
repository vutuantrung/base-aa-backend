# AAB — Current checkpoint

- Repository: `vutuantrung/base-aa-backend`; branch `main`. R6 and R7.1.0/V accepted. Reviewed source baseline remains `08614077a92946ac2718ac5a3c5c46d5d30467fe`.
- Provenance: R7.1.0 inventory `0bae390fa871aa4797c4d0b44f3cf083f84fdc8e`; R7.1.0 closure `61742f6ee7519612f6b412574a147429e4ab84f7`; R7.1.0-V environment verification `534419855148800e14180f45d719f0e3d9252080` (current tested base HEAD).
- R7.1.A was committed/reviewed at `78df51b73050d9457ee0c127cd644e771220d79c` (current tested base HEAD). R7.1.B local changes move the unchanged `PServerTransport`/`TransportEventHandler` contract to M04; M03 imports/re-exports it, and M04 no longer imports infrastructure. Targeted import delta only; no full graph/SCC regeneration. M10↔M11 and remaining TD01 findings stay open.
- R7.1.B verification at base HEAD `78df51b73050d9457ee0c127cd644e771220d79c` plus dirty files `src/modules/pserver/contracts.ts`, `src/modules/pserver/pserver-protocol.ts`, `src/infrastructure/socket/pserver-transport.ts`, `tests/pserver-protocol.test.ts`, and the four architecture docs: Node 22.23.5 typecheck/build passed; backend 144/144; playground command 5/5 top-level tests; focused protocol suite passed; diff check passed. Backend ran with approved loopback access. See [R7.1.B report](../../R7_1_B_PROTOCOL_TRANSPORT_PORT_REPORT.md).
- Pre-existing untracked prompt `prompts/R7_1_B_PROTOCOL_TRANSPORT_PORT_CODEX_PROMPT.md` is preserved. No commit/push. Stop for review before R7.1.C. Dependency enforcement is not established.
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
