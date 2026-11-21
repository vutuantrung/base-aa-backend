# AAB — Current checkpoint

- Repository `vutuantrung/base-aa-backend`; branch `main`; reviewed R7.2 source HEAD `dce8537cff84d0968589fafa9e55dac8c52c518b` (`fix(r7.2.c): enforce logical instance affinity during async transformation`). R7.2 closure review verification ran against this committed source. Local documentation changes for the review are uncommitted; the pre-existing untracked `prompts/R7_2_CLOSURE_REVIEW_CODEX_PROMPT.md` is preserved.
- **R7.2 recommendation: CONDITIONALLY CLOSED, pending reviewer approval.** TD02 remains OPEN under Option B; all-aborts identity cleanup is still required and no supported complete namespace-scoped rollback boundary is established. Its controlled downstream `/peers` rejection remains a passing current-behavior characterization, not a fix. Spontaneous abort reachability in the current production middleware composition is unverified.
- TD03 is partially remediated: M04 generation guards ignore stale ACKs and readiness gates protocol operations on both transport connectivity and current session readiness. Retained-session-ID behavior after a failed resume is preserved. Real PServer timing, remote resume semantics and already-started delivery cancellation remain outside evidence.
- TD04 implements approved logical EServer instance affinity: bind before async transformations, allow physical socket replacement only for that instance, preserve untargeted wire envelopes, and distinguish offline/ambiguous topology from delivery errors. Deterministic tests pass; real socket timing and the non-atomic lookup-to-send interval remain unproven.
- Fresh Node 22.23.5 verification: focused reliability suite 43/43; architecture check passed (52 files, 113 edges; zero file runtime SCCs; M10↔M12↔M13 module runtime SCC reported); typecheck/build passed; backend 177/177; playground 32/32; diff check passed. See [R7.2 closure review](../../R7_2_CLOSURE_REVIEW_REPORT.md) for exact commands and execution notes.
- R7.3 is **not started**. Recommendation is that it may proceed as a separately authorized phase after review: TD02’s unresolved boundary is isolated to M05/M06 admission cleanup; TD03 limits are explicitly retained; no R7.2 change alters M12/M13 workflows or public message contracts. This is not authorization to begin.
- Future task granularity: one phase-level task by default; split high-risk phases into two checkpoints and critical phases into two or three meaningful checkpoints only when evidence requires it. Avoid micro-task decomposition unless a concrete blocker requires it.
- R7.1 remains conditionally closed at its committed checkpoint; the M10/M12/M13 module SCC and checker limitations remain recorded deferred work. See [R7.1 closure review](../../R7_1_CLOSURE_ARCHITECTURE_REVIEW_REPORT.md), [dependency inventory](DEPENDENCY_INVENTORY.md), and [application-surface inventory](APPLICATION_SURFACE_INVENTORY.md).

## Read on demand
| Need | File / section |
|---|---|
| Runtime topology, flows, roadmap | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Ownership, files, dependency directions | [MODULE_BOUNDARIES.md](MODULE_BOUNDARIES.md) — find module ID |
| Decisions and evidence limits | [ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md) — find decision ID |
| Known risks and work sequencing | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) — find debt ID |
| R7.2 connection/session risks | [R7_2_RELIABILITY_RISK_INVENTORY.md](R7_2_RELIABILITY_RISK_INVENTORY.md) |
| Historical implementation evidence | Root reports linked from relevant debt rows; open only when needed |

## Checkpoint protocol
Check HEAD/status first. If docs-only descendants of reviewed source baseline, no broad source re-audit is required; if relevant source changed, inspect the delta and update affected facts. A local uncommitted change must record base HEAD + changed paths and test status, not a future commit hash. Preserve unrelated changes. Closure must record actual validation outcomes and exceptions. Do not commit/push or advance phases without authorization.
