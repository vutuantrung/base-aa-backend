# AAB — Current checkpoint

- Repository: `vutuantrung/base-aa-backend`; branch `main`. R6 and R7.1.0/V accepted. Reviewed source baseline remains `08614077a92946ac2718ac5a3c5c46d5d30467fe`.
- Provenance: R7.1.0 inventory `0bae390fa871aa4797c4d0b44f3cf083f84fdc8e`; R7.1.0 closure `61742f6ee7519612f6b412574a147429e4ab84f7`; R7.1.0-V environment verification `534419855148800e14180f45d719f0e3d9252080` (current tested base HEAD).
- R7.1.A implementation is local and uncommitted. It moves PServer VM/config types to `src/modules/pserver/contracts.ts`, removes M01's infrastructure type import, preserves connector legacy type exports, and uses canonical `VmInfo` in protocol config. Targeted import delta only; no full graph re-audit. M04's transport dependency remains for B.
- Verification at base HEAD `534419855148800e14180f45d719f0e3d9252080` plus dirty source/test/docs: Node 22.23.5 typecheck/build passed; backend 137/137; playground 32/32; diff check passed. Focused config/protocol and approved listener suites passed. Initial sandbox attempt failed five listener suites due to `listen EPERM`; approved local execution passed those suites. See [R7.1.A report](../../R7_1_A_CONFIGURATION_CONTRACTS_REPORT.md).
- Current unrelated pre-existing untracked prompt `prompts/R7_1_A_CONFIGURATION_CONTRACTS_CODEX_PROMPT.md` is preserved. No commit/push. Next: stop for review; R7.1.B is not started. Dependency enforcement is not established.
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
