# R7.10.C — Architecture Scope Reassessment & Decision Report

**Disposition:** complete for Architecture Owner review; all SC decisions remain pending. **No further phase or implementation is authorized.**

## Baseline and worktree

- Repository: `vutuantrung/base-aa-backend`; branch: `main`.
- Expected and observed committed source HEAD: `3af7920814e2260ae3cdfeef220ef75fbea0daeb`.
- Node.js `v22.23.5`; npm `10.9.9`.
- At entry, tracked tree and index were clean; the supplied prompt was the only untracked path. The prompt remains untouched.
- Final tracked modification: `docs/architecture/PROJECT_STATE.md` (compact current-state prepend). New docs: this report and the three R7.10.C architecture documents listed below. No staged paths; HEAD unchanged. No production, test, config, manifest, script, CI, schema, API, or public-contract changes.

## C01 — Evidence reconciliation and contract freeze

The committed R7.10.A/B baseline is reconciled without rewriting its reports or approval record. The later explicit owner record in [R7.10.A decision policy](docs/architecture/R7_10_A_ARCHITECTURE_SCOPE_DECISION_POLICY.md) governs: AS-D01=A, AS-D02=B, AS-D03=A, AS-D04=A, AS-D05=A (scoped), AS-D06=A. R7.10.B fulfilled its bounded characterization authorization with two targeted additions to existing tests; it did not migrate behavior.

The [feature-mode reassessment](docs/architecture/R7_10_C_FEATURE_MODE_SCOPE_REASSESSMENT.md) classifies material claims as source-confirmed, test-observed, historical, unknown external, or proposal. The current contract remains: exact `'1'` CLI gates; top-level demo registration vs nested peer gateway/workflow/connector eligibility; both mismatch combinations; direct factory SQLite-on default vs resolved CLI/default start SQLite-off; `onCreated` then conditional registration then `listen`; app-local registry; PServer construction distinct from later external connection. `/health` remains liveness-shaped `{status:'ok'}`. R7.8’s accepted lifecycle-to-example static edge and direct-start compatibility behavior remain constraints.

R7.5–R7.9 constraints remain unchanged: no unsafe replay; receipt/ACK, lock/quota, admission/deadline/late-mutation, persistence, startup/shutdown and reliability boundaries stay in force; R7.7 manifest/profile/serial/playground requirements remain; R7.8 behavior remains; R7.9 RC-D01–D07 and FI-D01–D05 remain accepted. M12/M13 remain TBD, M14/M15 APP, TD15–TD17 open, and M02 extraction **DEFERRED — EQUIVALENCE NOT PROVEN**. F1 DB reopen does not prove original native handle release; F2 async socket-close completion remains NOT PROVEN. Historical unattributed 254/255 failures and the focused-vs-Full discrepancy remain unresolved. No production, power-loss, remote-deduplication or exactly-once inference is made.

## C02 — Three-track scope disposition

| Track | Evidence and confidence | Recommendation |
|---|---|---|
| **A — Preserve feature-mode behavior** | High confidence for the locally characterized source and test cases; no named material defect. Deployment flags, external caller expectations and remote PServer behavior remain unknown. | Freeze current semantics as compatibility constraints. No further mode test or redesign absent a named material caller-specific gap. This does not close TD16 or assert every deployment combination. |
| **B — External caller / ownership discovery** | Repository documents embedding (`createApplication`) and CLI use; `package.json` is private and has no `exports` map. These do not prove no consumers. No named repository/release maintainer, supported distribution channel, product/API owner, operator, downstream receiver or deployment target appears in the reviewed evidence. | Defer active discovery until an accountable provider and target are named. First candidate is a bounded inventory of supported channels and exact app API/legacy symbols, only for channels confirmed by the maintainer. M12/M13 product/receiver discovery is separate and needs named parties. Required contacts and stop conditions are in [responsibility evidence next scope](docs/architecture/R7_10_C_RESPONSIBILITY_EVIDENCE_NEXT_SCOPE.md). |
| **C — Additive capability design** | No accepted named product/operational need, observable outcome, change budget, or version/migration boundary is evidenced. | **NOT ELIGIBLE.** Do not propose an abstraction. Reconsider only after a concrete requirement and accountable owner, compatibility/versioning, migration/rollback, budget and acceptance evidence are supplied. |

AS-D01=A is a longer-term business-boundary evidence objective; it does not require selecting M12/M13 now or rewriting M02. No local grep, private-package flag, or absent deployment manifest is treated as proof of external non-use.

## C03 — Owner decision package

The [decision policy](docs/architecture/R7_10_C_ARCHITECTURE_SCOPE_DECISION_POLICY.md) presents each decision with bounded options, trade-offs and gates. Recommendations are proposals only:

| Decision | Recommendation | Status |
|---|---|---|
| SC-D01 — feature-mode disposition | A: freeze current compatibility semantics | **PENDING OWNER APPROVAL** |
| SC-D02 — next responsibility evidence target | C: defer until evidence provider and target are named | **PENDING OWNER APPROVAL** |
| SC-D03 — additive design threshold | A: require accepted named observable need and compatibility/migration evidence; currently NOT ELIGIBLE | **PENDING OWNER APPROVAL** |
| SC-D04 — verification/evidence policy | A: proportional docs-only checks now; approved future code/test work gets scoped checks plus maintained serial/Full/playground gates, bounded attempts and complete logs | **PENDING OWNER APPROVAL** |
| SC-D05 — exit/governance | A: stop for owner decisions; any discovery needs separate scope; no standing implementation permission | **PENDING OWNER APPROVAL** |

No SC choice is self-approved. Acceptance of a discovery option would not authorize implementation, debt closure, ownership reclassification, R7.10.D or R7.11.

## C04 — Read-only verification

All required checks were run under Node.js `v22.23.5` / npm `10.9.9`:

| Command | Result |
|---|---|
| `npm run check:architecture` | PASS, exit 0: 59 source files; 145 resolved edges (65 runtime, 80 type-only); 0 runtime file SCCs; existing M10↔M12↔M13 module runtime SCC; architecture rules pass. |
| `npm run test:manifest` | PASS, exit 0: 55 manifest entries match 55 discovered; Fast 11, Integration 16, Full 55. |
| `git diff --check` | PASS, exit 0. |
| `git diff --cached --check` | PASS, exit 0; index remains empty. |

No Full, serial, playground, typecheck or build suite was rerun; the prompt specifies these broad suites are unnecessary for this documentation-only checkpoint. Historical R7.10.B verification remains cited in its committed report, not represented as a fresh run here. A whitespace scan of all new Markdown artifacts also returned no trailing whitespace.

## Changed-path inventory and stop

- Added `docs/architecture/R7_10_C_FEATURE_MODE_SCOPE_REASSESSMENT.md`.
- Added `docs/architecture/R7_10_C_RESPONSIBILITY_EVIDENCE_NEXT_SCOPE.md`.
- Added `docs/architecture/R7_10_C_ARCHITECTURE_SCOPE_DECISION_POLICY.md`.
- Added this report.
- Prepended one compact current checkpoint section to `docs/architecture/PROJECT_STATE.md`; historical R7.10.A/B entries and reports were preserved.
- Supplied `prompts/R7_10_C_ARCHITECTURE_SCOPE_REASSESSMENT_DECISION_CODEX_PROMPT.md` remains untouched and untracked.

No staging, commit, push, or index change occurred. **GO for Architecture Owner review of SC-D01–SC-D05; stop here.** Do not begin R7.10.D or R7.11 absent a new explicit authorization.
