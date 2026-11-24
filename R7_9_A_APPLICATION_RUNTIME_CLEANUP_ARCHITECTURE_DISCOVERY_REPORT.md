# R7.9.A — Application Runtime Cleanup Architecture Discovery Report

## Checkpoint and repository state

- Repository: `vutuantrung/base-aa-backend`; branch `main`.
- Expected and actual committed HEAD: `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9`.
- Starting dirty status: only `?? prompts/R7_9_A_APPLICATION_RUNTIME_CLEANUP_ARCHITECTURE_DISCOVERY_CODEX_PROMPT.md` (the supplied prompt); no staged or pre-existing source/worktree changes.
- Starting default shell versions: Node `v24.21.0`, npm `11.19.0`. Required baseline selected explicitly: Node `v22.23.5`, npm `10.9.9`.
- Final changes are docs only: this report, three architecture documents and a current note in `docs/architecture/PROJECT_STATE.md`. No production source, tests, runtime configuration, package scripts/manifests, CI, contracts or behavior changed. No staging, commit or push.
- Final committed HEAD is unchanged. Build generated ignored local `dist/` output; tracked artifact comparison showed no tracked build changes.

## Discovery outcome

Breadth-first RA01–RA09 evidence is in the [runtime responsibility inventory](docs/architecture/R7_9_A_RUNTIME_RESPONSIBILITY_INVENTORY.md). It traces entrypoints, M02 construction/lifecycle and acquisition/cleanup, exact config gates/defaults, gateway/protocol composition and module graph, M12/M13 durable stores/runners, shared SQLite/API, readiness/diagnostics, legacy exports/utilities and R7.7 verification ownership.

Key current runtime facts confirmed in source:

- `main.ts` resolves environment, installs process signal ownership before async startup, and delegates to M02. Direct callers also use `createApplication` and `startApplication`; the public application surface has concrete handles with unknown external embedder usage.
- M02 constructs one coordinator, optional SQLite handle/repositories, app-local route and transform registries, sender/router, HTTP and Socket.IO servers, gated peer gateway and conditional PServer connector. It owns lifecycle coordination, not all resource internals.
- `startApplication` creates the app, invokes `onCreated`, conditionally registers demo transformation by the top-level resolved flag, then calls `listen`. This is the accepted R7.8.C bounded APP→example exception. Keep C-D01=A/C-D02=A/C-D03=A: no edge replacement, implicit registration remains, registry is app-local.
- `ENABLE_TEST_PEERS === '1'` sets both CLI top-level/nested booleans and default PServer configuration; programmatic callers may set booleans independently. CLI SQLite defaults disabled; direct factory omission defaults enabled. `SHUTDOWN_TIMEOUT_MS` defaults to 15000 and is bounded 1–120000.
- M12 and M13 remain formally TBD regardless of demo-named payloads; their workflow/store/outbox/ACK/data behavior is unchanged. M14/M15 remain APP with HTTP/SQLite contracts retained. `testing/` is a separate package/process boundary.
- M02 close cuts admission, waits for tracked work and peer runners, then closes PServer, peer gateway/store, sockets, listener and SQLite. Preserve R7.5 writer ownership and uncertain/no-replay semantics, R7.6 deadline/rollback/late-settlement/signal invariants, and R7.7 manifest, serial `npm test`, profiles and assertions.
- `/health` remains a simple status response and is not aggregate readiness. M18 diagnostics are not uniformly used; direct console emission remains. No readiness, health or logging contract change is proposed as current work.
- Static checker result is 59 files/145 import-export edges, 65 runtime/80 type-only; zero runtime file SCCs. Existing M10↔M12↔M13 runtime module aggregation SCC and M06↔M10↔M11↔M12↔M13 all-import SCC are recorded as observed graphs, not proof that behavior can be removed.

## Opportunity and decision package

The [opportunity catalog](docs/architecture/R7_9_A_RUNTIME_CLEANUP_OPPORTUNITY_CATALOG.md) defines RC-01…RC-09 with location, evidence, responsibility-level proposal, acceptance criteria, compatibility class, invariant/test impact, prerequisites, stop conditions and qualitative rollback/review burden. The most realistic later review topics are:

1. RC-01: characterize M02 construction/lifecycle failures and consider one bounded private extraction.
2. RC-02: characterize exact feature-mode combinations only; redesign remains separately unauthorized.
3. RC-03: inventory internal M18 diagnostics/redaction needs before any consistency change.

RC-05 explicitly marks removal/replacement of the accepted R7.8 lifecycle-example behavior as prohibited under current approval. RC-06 preserves M12/M13 TBD and durable behavior. Legacy deletion based only on no tracked callers is deferred.

The [decision policy](docs/architecture/R7_9_A_RUNTIME_CLEANUP_DECISION_POLICY.md) presents options, trade-offs, recommendations, affected areas, compatibility gates and rollback for RC-D01–RC-D07. **Every decision is PENDING OWNER APPROVAL.** Recommendations do not authorize R7.9.B.

## Verification evidence

Commands below were run with `PATH=/home/parker/.nvm/versions/node/v22.23.5/bin:$PATH` where applicable. Exit codes shown are observed. Full test log from the authorized host rerun was captured at `/tmp/r79-full-host.log`.

| Command | Result |
|---|---|
| `node --version` / `npm --version` (baseline PATH) | `v22.23.5` / `10.9.9` |
| `git status --short` at start | Exit 0; supplied prompt only, untracked |
| `git diff --check` | Exit 0 |
| `git diff --cached --check` | Exit 0 |
| `npm run check:architecture` | Exit 0; 59 files, 145 edges; 0 runtime file SCC; existing module SCCs/warning as above |
| `npm run test:manifest` | Exit 0; 55/55 discovered tests; Fast 11, Integration 16, Full 55 |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0; no tracked build artifacts changed |
| `npm run test:full` | Exit 0 on authorized host; SQLite preflight Node v22.23.5, ABI 127, load/open/query/close pass; backend 255/255, playground 32/32, zero failures/skips; 50 backend files + 5 playground files selected |
| `git diff --check` and `git diff --cached --check` final | Exit 0 for both |

A separate sandboxed repeat of `npm run test:full` stopped at architecture startup because `scripts/check-architecture.ts` calls `git ls-files` via `spawnSync`, which returned `EPERM`. This was an environment permission failure, not reported as a passing run; the authorized host rerun of the same full command passed and supplies the counts above. No external peers or production services were contacted.

## Risks and limitations

- No runtime change occurred; these checks verify the unchanged baseline and do not prove parity against a future refactor.
- The `ApplicationInstance` inventory and repository-local static use cannot enumerate all external consumers. Unknown callers keep exports/signatures compatibility-sensitive.
- Existing integration evidence is local test infrastructure. It does not establish deployed filesystem/power-loss behavior, remote PServer semantics, receiver deduplication, exactly-once effects or operational log consumers.
- `npm run test:full` and architecture checker rely on process-spawn permissions. Host authorization was needed after the sandbox returned EPERM.
- R7.7 responsibility-map `unknown` rows stay unknown. No tests or responsibility rows were relabeled.
- No debt item was closed, and `MODULE_BOUNDARIES.md` classifications were not changed.

## Recommendation and handoff

**GO for owner decision review.** The inventory is breadth-first, grounded in current source, and records concrete bounded opportunities and no-go areas. RC-D01–RC-D07 remain pending. Owner review should select or reject each decision before any implementation checkpoint. Preserve accepted R7.8 decisions, M12/M13 TBD, M14/M15 APP and R7.5–R7.7 safety gates. No R7.9.B work has started; no commit or push was made.
