# R7.5.B — Policy Gate Report

## Checkpoint

- Repository: `vutuantrung/base-aa-backend`, branch `main`.
- Actual committed base: `464d88fa50a5060a83f8395cd1a64312e0b9c12f` (`update 11212221`), matching expected HEAD.
- R7.5.A report, baseline, focused characterization tests and documentation are present in this commit. The initial worktree and index were clean.
- This checkpoint changes documentation only. No production code, tests, wire schema, ACK shape, database schema or runtime data changed. No commit/push.

## Gate result: STOP before Stage 2

The approved high-level direction is recorded: D01=B, D02=B, D03=B, D04=B, D05=A,
D06=A. Stage 1 has produced a single proposed policy package at
[R7.5 reliability policy](docs/architecture/R7_5_RELIABILITY_POLICY.md). It makes no
detailed parameter an approval by implication. Stage 2 is **blocked** until the owner
resolves replay safety, externally visible conflict behavior and operational parameters.

Source inspection confirms M04 and M05 outgoing peer delivery use a 5,000 ms
`peer:message` ACK and require `response.ok`; this is not proof of remote durable receipt or
business completion. No receiver-side idempotency evidence is available. A timeout,
disconnect or process death after send can mean the remote side already acted. Automatic
replay in those cases is unsafe to approve from local evidence alone.

## Decisions requiring an owner answer

1. **Remote ACK/replay:** define what positive and negative peer ACKs promise and which
   specific EServer/PServer receivers have stable-ID deduplication. Until then, should
   post-send ambiguity remain `uncertain` without automatic replay? Recommended: yes.
2. **Retry bounds:** approve or replace proposed initial+5 attempts, delays 2s/10s/60s/300s/1800s,
   equal jitter, 24h age, oldest-first scan/batches 100/concurrency 4, 10,000 records/256 MiB
   capacity and offline recovery trigger. Recommended: use controlled jitter, finite bounds,
   and no retry after uncertain send without receiver dedupe.
3. **Idempotency and wire conflict:** approve key/hash fields separately for F08, F09 and
   M13; specify M13 missing-ID semantics; select existing ACK conflict mapping or explicitly
   authorize a versioned public code/body. Recommended: no synthetic dedupe for M13 without
   ID; keep operation-prefixed task IDs; do not add a public code in this checkpoint.
4. **Retention/migration:** approve dedupe retention and expiry/GC relative to sender retry
   horizon; define legacy records as read-only/no replay or authorize a migration. Recommended:
   no automatic legacy backfill/replay and retain keys at least through maximum replay horizon.
5. **Canonical state and projection:** approve states, stale `attempting` → `uncertain`,
   public `pending/forwarded/forwardFailed` mapping and changed timing, plus corruption and
   notification-failure handling. Recommended: canonical state is persisted before
   notification; notifications are projections, not transaction participants.
6. **Storage and operations:** approve single-writer-per-directory assumption, directory
   sync portability/error treatment, quarantine/manual review, backpressure ACK mapping and
   replay-disabled rollout. Recommended: preserve queued evidence on rollback and do not
   replay legacy/uncertain entries automatically.

All recommendations and alternatives are detailed in the policy package with owners,
compatibility effects and test criteria. The owner may approve a coherent subset only if it
does not leave receipt/outbox state inconsistent or label unsafe sends replay-safe.

## Scope blocked

No source implementation, test changes, outbox wiring, retry, replay, idempotency behavior,
status projection, migration, or ACK/error change was started. D05=A preserves M09 fan-out;
D06=A preserves M16 with no catalog migration. TD14/R7.6 shutdown drain remains out of scope.

R7.5.A historical verification remains as reported in its committed report; it was not
rerun here. Node available in this environment: recorded below after verification.

## Verification performed

| Command | Result |
|---|---|
| `node --version` | `v24.21.0` from default PATH; the architecture checker was explicitly run with repository Node `v22.23.5` on PATH |
| `PATH=/home/parker/.nvm/versions/node/v22.23.5/bin:$PATH npm run check:architecture` | Exit 0. 52 files, 113 resolved edges (51 runtime, 62 type-only); 0 runtime file SCCs; existing module runtime SCC M10↔M12↔M13 and all-import SCC M06↔M10↔M11↔M12↔M13; documented M10↔M11 type-only warning; rules passed |
| `npm run typecheck`, `npm run build`, full backend, playground | Not run; docs-only policy gate, no runtime changes |
| `git diff --check` | Exit 0 |
| `git status --short` | Exit 0. Dirty paths: this report; `docs/architecture/ARCHITECTURE_DECISIONS.md`; `docs/architecture/PROJECT_STATE.md`; `docs/architecture/TECHNICAL_DEBT.md`; untracked `docs/architecture/R7_5_RELIABILITY_POLICY.md` |

Changed paths: this gate report, `docs/architecture/R7_5_RELIABILITY_POLICY.md`,
`docs/architecture/PROJECT_STATE.md`, `docs/architecture/TECHNICAL_DEBT.md`, and
`docs/architecture/ARCHITECTURE_DECISIONS.md`.

**Stop:** request approval of the detailed policy questions above. Resume Stage 2 within
R7.5.B only after decisions are recorded. No R7.5.C or R7.6 work.

## Historical gate resolution

This report records the Stage 1 gate as it stood before detailed approval. The architecture
owner subsequently approved Conservative Reliability Policy P01–P06 for Stage 2, including
limits on uncertain replay, retry parameters, idempotency keys/conflict mapping, retention,
canonical status projections and storage operations. The approved implementation contract
now lives in [R7.5 reliability policy](docs/architecture/R7_5_RELIABILITY_POLICY.md) and
the ADR. This historical STOP is resolved; the current implementation and fresh verification
status are in [R7.5.B Stage 2 report](R7_5_B_CONSERVATIVE_RELIABILITY_IMPLEMENTATION_REPORT.md).
