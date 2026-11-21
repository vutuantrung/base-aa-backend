# Codex task — R7.1 Closure Architecture Review (audit/closure only)

## Start / repository context
- Repository: `vutuantrung/base-aa-backend`, branch `main`. Expected committed R7.1.E HEAD: `64c2c354ccd3e0e9f86ed37c8996fcb2c13249c5` (`updated 11210931`).
- This is a **fresh-session-compatible delta prompt**. First follow `AGENTS.md`; read `docs/architecture/PROJECT_STATE.md` once. Check `git branch --show-current`, `git rev-parse HEAD`, `git status --short`, and compare source changes since the expected HEAD if different. Preserve all unrelated local changes; never reset/stash/switch branches without permission. If unexpected source drift affects closure, report it before proceeding.
- Historical R7.1.A–E results are in committed reports and architecture docs. Do **not** reread all reports or regenerate the full dependency inventory. Read only targeted lines in `docs/architecture/DEPENDENCY_INVENTORY.md`, `MODULE_BOUNDARIES.md`, `TECHNICAL_DEBT.md`, `APPLICATION_SURFACE_INVENTORY.md` and `R7_1_E_DEPENDENCY_ENFORCEMENT_REPORT.md` as needed.

## Goal
Produce an evidence-based **R7.1 closure decision** with a narrow investigation of the module-level runtime SCC and clear separation between enforced architectural rules, accepted compatibility exceptions, and unresolved risks. **Do not refactor production code, alter the checker, add features, delete compatibility shims, change public contracts, or begin R7.2.**

## Scope / tasks
1. Confirm R7.1.E is committed at current HEAD: `scripts/check-architecture.ts`, `tests/architecture-check.test.ts`, `package.json` command, and architecture docs. Read their relevant rules only. Determine if the baseline is docs/source clean or dirty; no fabricated future commit SHA.
2. Review **actual source import/re-export edges** participating in reported module runtime SCC `M10↔M12↔M13`. Present an edge-level table: source file, destination file, owning modules, import/export symbol(s), runtime/type-only, and whether each edge is a compatibility facade, domain dependency, or actual business implementation coupling. Provide a minimal directed cycle witness instead of assuming every pair is bidirectional. Distinguish module aggregation SCC from file-level runtime SCC (reported zero). Check M06/M11 all-import SCC only enough to explain type-only contributions.
3. Classify the SCC using evidence: accepted compatibility/ownership artifact, actionable architectural coupling, or unresolved pending policy. Do not silently mark it fixed or automatically ban all module SCCs. If existing legacy exports are important, identify exact paths and consumer compatibility rationale.
4. Assess R7.1 acceptance against A–E: M01/M04 contract ownership; M08 canonical imports plus exact old shared barrel exception; M02 public surface preserved and D.2 compatibility tests; executable graph rule coverage, NodeNext import resolution and deterministic fixture checks. Clearly identify which rules are *enforced*, *reported only*, and *deferred*.
5. Explicitly document checker limitations found in current source: tracked `src/**/*.ts` scope, ownership map maintenance, NodeNext static import/export graph, dynamic import/require rejection, runtime-versus-type-only classification, module SCCs reporting only, non-modeled DI/closures, and no currently compatible CI workflow. Do not claim CI protection exists.
6. Decide `R7.1 CLOSED` or `CONDITIONALLY CLOSED`/`BLOCKED` with explicit reasons and only necessary follow-ups. Distinguish closure of the approved R7.1 scope from open TD01/TD17/external API/APP-DEMO issues. Do not broaden into R7.2–R7.9 implementation.

## Verification
- Use existing commands, no new dependencies. Node 22.23.5 if available.
- Run `npm run check:architecture` and focused `node --import tsx --test tests/architecture-check.test.ts` if execution is permitted; at minimum inspect actual committed checker and fixture code. For **docs-only** closure, avoid rerunning all 159 backend + 32 playground cases if R7.1.E report and unchanged source/tests establish baseline, and label those cases **historical PASS**, not newly run. If production source or tests have changed, use `AGENTS.md` verification protocol and run relevant/full checks.
- If `spawnSync git EPERM` or `listen EPERM` occurs inside sandbox, document exact cause and request narrow authorized execution rather than weakening checks. Run `git diff --check`; do not claim unrun checks pass.

## Deliverables
- Root file `R7_1_CLOSURE_ARCHITECTURE_REVIEW_REPORT.md` (ideally 60–100 lines): HEAD/status, scope, SCC edge/witness evidence, rule/exception matrix, verification performed vs inherited, closure decision, deferred risks, recommended next checkpoint.
- Update `docs/architecture/PROJECT_STATE.md` with the **actual committed R7.1.E HEAD** and closure outcome; remove stale 'E dirty/uncommitted' wording only after confirming Git.
- Update `docs/architecture/DEPENDENCY_INVENTORY.md` and `TECHNICAL_DEBT.md` **only where SCC classification or closure status adds new evidence**. No broad rewrite, no duplicated historical reports.
- End with changed-file list and a concise review summary. **No commit, no push, no phase transition without user authorization.**
