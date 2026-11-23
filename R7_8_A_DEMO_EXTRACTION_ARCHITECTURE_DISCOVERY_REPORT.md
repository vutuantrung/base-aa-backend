# R7.8.A — Demo Extraction Architecture Discovery Report

## Checkpoint and recommendation

- Repository `vutuantrung/base-aa-backend`, branch `main`.
- Expected, actual starting and ending committed source HEAD: `e3cbc412d002db1c0ac415e2a8ac97b6d2a208dd`.
- Initial status: only supplied untracked `prompts/R7_8_A_DEMO_EXTRACTION_ARCHITECTURE_DISCOVERY_CODEX_PROMPT.md`; it remains unchanged. No staged or prior source changes were found.
- The checked-in `PROJECT_STATE.md` still contained an older R7.7-era snapshot; this discovery adds a current progress section while leaving historical R7.5–R7.7 reports intact. Relevant R6.4.A–D reports explicitly kept M12–M15 APP-versus-DEMO classification unresolved; their consumer evidence is summarized in the boundary inventory.
- This checkpoint changed documentation only. No production/test source, package scripts, dependencies, CI, public contracts, test profiles or runtime behavior changed. Nothing was committed or pushed.
- **Recommendation: GO to owner review of the pending decision package; NO-GO for extraction implementation until ES-D01–D08 are explicitly decided and a separate R7.8.B scope is authorized. Do not begin R7.8.B or R7.9.**

## Discovery result

The main ownership boundary is not “everything named demo versus everything in `testing/`.” The playground is already a separate set of Node/Electron processes with its own package scripts and no static source imports into AAB. Its connection to AAB is through Socket.IO and HTTP contracts. The concrete app/demo static couplings are inside AAB: M02 lifecycle imports and registers `src/examples/pserver-to-aaui.ts`; M05 `peer-gateway.ts` constructs M12/M13 workflows, JSON stores and outbox runners behind the named-peer gate.

`ENABLE_TEST_PEERS=1` is broader than its name. It enables `/peers`, M12/M13 initialization/recovery/writer ownership, and in CLI config also supplies a default PServer config (`http://127.0.0.1:3001`, `/ws`). M02 lifecycle separately registers the sample transform from the top-level resolved flag; M05 receives the nested application flag. Programmatic `createApplication({enableTestPeers:true})` without `pserver` creates peer workflows but no M03/M04 connector; CLI has no equivalent “peers on, PServer config absent” input in the current resolver. Programmatic SQLite defaults enabled, while CLI SQLite defaults disabled unless `ENABLE_SQLITE=1`.

M12 and M13 remain **TBD** and were assessed separately. Both contain real receipt/ACK/durable delivery and lifecycle behavior alongside demo-named wire operations and mock/UI consumers. M12 has task target/source capture, F08/F09 correlation, durable intent and history projection. M13 has normalized selection receipt, original ACK replay, durable delivery state and AAUI snapshots. The source evidence supports a future mixed-split discussion, not automatic demo classification. M14 and M15 are also kept **TBD independently**: both are composed outside `enableTestPeers`, backed by the M02-owned optional SQLite database, and exposed through `/api/sessions` and `/api/process-usage`; external caller/product inventories remain incomplete. They are not M04 transport session or M18 diagnostics.

The current HTTP, Socket.IO, persistence and lifecycle contracts and no-regression tests are captured in the [runtime composition and dependencies document](docs/architecture/R7_8_RUNTIME_COMPOSITION_AND_DEPENDENCIES.md). The full per-responsibility/file inventory, candidate labels, importer/composition evidence, state ownership, test evidence and confidence is in the [boundary inventory](docs/architecture/R7_8_DEMO_BOUNDARY_INVENTORY.md).

## Pending owner choices

The [decision policy](docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md) proposes eight explicit pending choices:

1. ES-D01: behavior-owner classification policy; prefer capability/contract evidence over file names.
2. ES-D02: M12 Task Workflow; mixed split is a hypothesis, formal ownership remains TBD.
3. ES-D03: M13 Resource Selection; split demo catalog/UI from receipt/outbox only if the owner affirms the application capability.
4. ES-D04: M14 Generic Session independently; APP candidate, TBD pending approval/caller inventory.
5. ES-D05: M15 Process Usage independently; APP candidate, TBD pending approval/caller inventory.
6. ES-D06: preserve or split the `ENABLE_TEST_PEERS`/`enableTestPeers` compatibility bundle; current behavior remains unchanged.
7. ES-D07: preserve the playground package/process dependency direction or later create a dedicated package; no AAB-to-demo imports.
8. ES-D08: breadth-first migration, contract/test ownership, rollback gates, and the separate authorization boundary before R7.9.

No classification or implementation option is approved by this discovery package. Keep R7.5 P01–P06 durable semantics and R7.6 D01–D06 lifecycle/admission/deadline/late-writer rules intact through any future decision. Keep R7.7 manifest, additive profiles, serial `npm test`, Node baseline and full gate intact.

## Verification

Commands were run with Node `v22.23.5`, npm `10.9.9` (Linux host); architecture/full checks had host permission for Git discovery, loopback, native SQLite, temporary filesystem and child processes.

| Command | Result |
|---|---|
| `node --version` / `npm --version` | `v22.23.5` / `10.9.9`. |
| `npm run check:architecture` | PASS, exit 0: 59 source files, 145 resolved edges (65 runtime / 80 type-only), zero runtime file SCCs. Existing module runtime SCC M10↔M12↔M13 and all-import SCC M06↔M10↔M11↔M12↔M13 remain; M10↔M11 warning is type-only. |
| `npm run test:manifest` | PASS, exit 0: 55 entries match 55 discovered files; 50 backend / five playground; profile memberships 11 Fast / 16 Integration / 55 Full entries. |
| `npm run typecheck` | PASS, exit 0. |
| `npm run build` | PASS, exit 0. |
| `npm run test:full` | PASS, exit 0: SQLite preflight passed; architecture, typecheck, build, backend and playground stages all passed. Profile reported 50 backend and five playground files. |
| `npm test -- --test-concurrency=1` | PASS, exit 0: 253/253 backend tests, 0 skipped, 20.37 s test-runner duration. |
| Playground stage in Full | PASS, 32/32 tests, 0 skipped, 0.27 s test-runner duration. |
| `git diff --check` | PASS, exit 0; checked at checkpoint end. |

The Full gate preflight loaded `better-sqlite3` under Node 22.23.5, ABI 127, and opened/queried/closed `:memory:` successfully. No live production services were contacted. Listener and child-process evidence is local Linux evidence only. Test success does not establish remote peer behavior, deployed filesystem behavior, power-loss durability or exactly-once business effects.

## Changed documentation and stop point

- Added `docs/architecture/R7_8_DEMO_BOUNDARY_INVENTORY.md`.
- Added `docs/architecture/R7_8_RUNTIME_COMPOSITION_AND_DEPENDENCIES.md`.
- Added `docs/architecture/R7_8_DEMO_EXTRACTION_DECISION_POLICY.md`.
- Added this root report; added a compact R7.8.A progress section to `docs/architecture/PROJECT_STATE.md`.
- Clarified TD16 with the observed two-flag composition and M14/M15 gate independence; TD16 remains open.
- Preserved `MODULE_BOUNDARIES.md` classifications and all historical R7.5–R7.7 reports. No M12–M15 TBD was resolved.

**Stop for architecture owner assessment of ES-D01–D08. No source movement, production refactor, commit, push, R7.8.B or R7.9 work was performed.**
