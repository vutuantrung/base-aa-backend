# Naming Migration Closure

**Status: closed by explicit operator decision.** Implementation is complete; some runtime verification remains deferred. Closure does not mean deployment acceptance or production readiness.

## Objective and final naming

Update current AS and ARM-facing code, peer identities, demos, packaging and maintained documentation to the accepted service names while preserving generic protocols, architecture ownership and business behavior.

| Historical name | Current name | Current identity / responsibility |
|---|---|---|
| AAB | AS | `as`; backend HTTP API and peer host, task/resource-selection workflows and durable state owners. |
| PServer | CDC | `cdc`; Socket.IO server and VM session registration endpoint used by AS. |
| SServer | SPA | `spa`; AS peer client/demo service. |
| AAUI | AA | `aa`; standalone Electron client, outside ARM application management. |
| EServer | EServer | `eserver`; AS peer client. Two ARM instances use logical IDs `e-1` and `e-2`. |
| ARM | ARM | Unchanged; owns packaging, immutable releases, trusted child environment, process supervision and assigned-port metadata. |

Repository names remain unchanged. Current code paths include `src/modules/cdc/`, `src/infrastructure/socket/cdc-connector.ts`, `src/infrastructure/socket/cdc-transport.ts`, `src/examples/cdc-to-aa.ts`, and `testing/{cdc.mjs,spa.mjs,eserver.mjs,aa/}`. No legacy compatibility aliases were added. Historical report/prompt names and contents are intentionally retained.

## Preserved contracts and architecture

- AS is a Socket.IO server for enabled EServer/SPA/AA peers on namespace `/peers`; inbound identities are `eserver`, `spa`, and `aa`. EServer instances are distinguished by `ESERVER_INSTANCE_ID` (`e-1`, `e-2`). AS identity is `as`.
- AS connects outbound to CDC at `CDC_URL` using Engine.IO path `CDC_SOCKET_PATH` (default `/ws`) and namespace `/`. CDC authenticates AS identity `as` and performs VM session registration. The CDC server remains the server; the direction was not reversed.
- Generic peer message envelope fields (`from`, `to`, `channel`, `event`, IDs/correlation metadata), `peer:message`, `peer:ping`, task/resource-selection events, `/ws`, `/peers`, and the existing message version remain as specified by current contracts. The migrated welcome event is `as:welcome`.
- Architecture module IDs and ownership boundaries remain. Current paths include M01 configuration, M02 application composition/lifecycle, M03 CDC transport/connector, M04 CDC protocol/session, M05 peer gateway, M06 peer directory, M07 HTTP API, M09 generic message routing, M10 peer messaging, M11 transformations, M12 task workflow, M13 resource selection, and M17 persistence. M02 extraction remains deferred; M12/M13 ownership remains TBD; M14/M15 remain APP.
- ACK timing and meaning, retries, delivery outcomes, state formats, persistence guarantees, lifecycle semantics and fresh-state requirements were preserved. AA domain/table terminology and SQLite schema were not renamed. No old runtime state was converted, copied, replayed or removed.

## Environment contracts

| Application | Current environment contract |
|---|---|
| AS | `PORT` (default 3000); optional `HOST` accepts a valid IPv4/IPv6 literal, with absent HOST preserving prior `server.listen(port)` behavior; `API_KEY`; `ENABLE_TEST_PEERS`; `ENABLE_SQLITE`; `DB_PATH` only when SQLite is enabled; `CDC_URL`; `CDC_SOCKET_PATH`; `AS_TASK_STORE_DIR`; `AS_SELECTION_STORE_DIR`. ARM supplies trusted `HOST=127.0.0.1`; do not put HOST in per-app configuration. |
| CDC | ARM config requests `PORT=3001`; `API_KEY`; server uses `/ws` for its Socket.IO Engine.IO path. |
| EServer 1/2 | `PORT=3002` / `3012`; `AS_URL`; `ESERVER_INSTANCE_ID=e-1` / `e-2`; `API_KEY`. Source keeps `PORT`-before-`ESERVER_PORT` precedence. Omit redundant `ESERVER_PORT` in ARM config. |
| SPA | ARM config requests `PORT=3003`; `AS_URL`; `API_KEY`. |
| AA | Standalone Electron on loopback port 3004; reads `AS_URL` and optional `API_KEY`. It is not an ARM-managed application. |

On ARM, application-config `PORT` requests fixed assignment; absence permits dynamic allocation. ARM injects the selected `PORT` and trusted `HOST`. `process.port` is **ASSIGNED** metadata; it does not prove a listener is bound or ready. Successful process spawn/`RUNNING` does not establish application readiness when readiness is `NOT_CONFIGURED`. Install, activate and start are separate actions. Installed `(applicationId, version)` releases are immutable; changed package bytes require a new version. SQLite remains disabled in the approved isolated AS deployment.

The ARM management host in the inspected checkout is started by `npm run dev:management`. `npm run dev:supervisor` launches an example ProcessManager and is example-only. Check the script mapping before any future startup.

## Accepted decisions

The operator accepted NM-D01 through NM-D09. Retained NM.1 evidence preserves the NP-01–NP-08 policy contents, but does not retain an exact one-to-one assignment of each NP item to NM-D01, D02, or D03; the decision register records that group collectively rather than inventing a split. See [architecture decisions](docs/architecture/ARCHITECTURE_DECISIONS.md).

- **NM-D01–D03, collectively:** accepted name mapping, unchanged repositories/EServer/ARM, no legacy aliases, preservation of generic contracts/module IDs/AA domain schema/history/worktree changes, and controlled fresh state. Detailed accepted policy basis: NP-01–NP-08 in [NM.1 audit](NM_1_NAMING_INVENTORY_AND_IMPACT_DISCOVERY_REPORT.md).
- **NM-D04-B:** bounded use of the explicitly isolated ARM runtime and approved IDs; no non-isolated deployment changes.
- **NM-D05:** persistent isolated verification root `/home/parker/nm-verification/naming-migration-v1.1.0/`, with separate owner-restricted storage, state, secrets and logs.
- **NM-D06-A:** optional AS HOST follows ARM trusted HOST injection; absence preserves prior bind behavior.
- **NM-D07-A:** fixed EServer `PORT` values 3002/3012 under ARM; preserve source `PORT`-first precedence.
- **NM-D08-A:** preserve `process.port` ASSIGNED semantics and clarify documentation only.
- **NM-D09-A:** configure CDC `PORT=3001` and SPA `PORT=3003`; no CDC/SPA source change.

NM-D10 is **not** an accepted decision.

## Implementation and verification status

- Naming source, test/demo consumers, package IDs, active documentation and architecture tooling were migrated. AS committed baseline is `b8311c3bc229a5327d3aca106ddc4d1db567c775` (`Naming Migration`), descended from original `72b31e54e266743fbfd18b6169e4a85c843ddeb7`. At this documentation task's entry, AS was clean. ARM baseline is `4e887715d4576e6fa64644778f0072bc94c018b4` on `arm-supervisor`; four existing unstaged documentation paths were present and preserved.
- NM.2.3.V recorded two consecutive serial backend runs passing 260/260 with zero skips. NM.3.3.D recorded focused HOST/listener tests, typecheck, build, architecture check, manifest check and Fast profile passing. A full regression run after the HOST remediation has **not** been completed.
- AS 1.1.1 was verified as an immutable artifact, installed and selected in the persistent isolated ARM environment. CDC, EServer 1/2 and SPA remain on 1.1.0. Corrected fixed `PORT` values are present in app configuration. The last authenticated inventory found all five managed applications stopped.
- Earlier NM.3.3.B runtime work observed CDC/AS session behavior and EServer/SPA interoperability under the then-tested process configuration, but identified AS wildcard binding and EServer assigned-versus-listening port mismatch. This evidence is partial and does not establish safe deployment.
- NM.3.3.V-R.1 confirmed that AS performs awaited filesystem-backed outbox/workflow initialization before HTTP listen and that ARM `RUNNING` for this readiness-disabled package is spawn-level. The earlier no-listener probe was premature; retained stdout later records listen and CDC session ACK, but no actual listener address or startup duration was recorded.
- NM.3.3.V-R.2 was explicitly authorized, then **deferred before app startup** because adequate network isolation could not be verified. The host had an active Wi-Fi interface; firewall inspection required prohibited root access, and unprivileged network namespace creation was denied. No prohibited system/network/security change was made. The five apps remain stopped.

| Finding | Current disposition |
|---|---|
| RF-22 — AS bind address | Source HOST remediation implemented and focused-tested; AS 1.1.1 installed/active. Actual runtime loopback bind remains unverified. |
| RF-23 — EServer ports | Correct fixed PORT configuration applied; EServer listener ports were not verified after remediation. |
| RF-24 — integration/authentication | Partial runtime interoperability evidence exists. EServer/SPA authentication matrix and AA-dependent business flows remain unverified; AA work stays outside this closure. |
| RF-25 — safety gates | Containment was respected; V-R.2 did not start applications without a verified isolation boundary. |
| RF-26 — startup timing | Confirmed verification/readiness-semantics discrepancy: ARM spawn-level RUNNING precedes AS's asynchronous bind. No readiness API or deadline was added. |
| RF-27 | No definition or disposition appears in the retained NM reports or current checkpoint; status remains unknown/unassigned. |

No production-readiness claim is made. NM.3.3.V-R.2 remains deferred. NM.4 was not executed. Remote Application Update is a separate feature task and was not started. Closure is the operator's project-scope decision, not a waiver of outstanding findings.

## Canonical documentation index

| Need | Canonical document |
|---|---|
| Agent instructions and permanent safety limits | [AS `AGENTS.md`](AGENTS.md); [ARM `AGENTS.md`](../base-arm-app/AGENTS.md) in the separate sibling checkout. |
| Current status and next boundaries | [PROJECT_STATE](docs/architecture/PROJECT_STATE.md) |
| Current architecture and module boundaries | [ARCHITECTURE](docs/architecture/ARCHITECTURE.md), `docs/architecture/MODULE_BOUNDARIES.md`, `docs/architecture/DEPENDENCY_INVENTORY.md` |
| Accepted decisions | [ARCHITECTURE_DECISIONS](docs/architecture/ARCHITECTURE_DECISIONS.md) |
| Current application surface and Socket.IO map | [APPLICATION_SURFACE_INVENTORY](docs/architecture/APPLICATION_SURFACE_INVENTORY.md), `docs/architecture/SOCKET_IO_HOSTS_NAMESPACES_EVENTS_INVENTORY.md` |
| CDC/AS protocol and feature examples | [CDC_SESSION_PROTOCOL](docs/CDC_SESSION_PROTOCOL.md), `docs/flows/DF-07_CDC_TASK_REQUEST_INTEGRATION.md`, `docs/DEMO_CDC_AA.md`, `docs/MULTIPLE_ESERVERS.md`, `docs/PEER_MESSAGE_TRANSFORMATION.md` |
| AS deployment/configuration and limitations | [Naming Migration deployment runbook](docs/operations/NAMING_MIGRATION_DEPLOYMENT_RUNBOOK.md), `docs/operations/NM_3_3_D_ARM_APPLICATION_CONFIGURATION_TEMPLATES.md` |
| ARM runtime/deployment contracts (separate `base-arm-app` checkout) | `docs/ENV_CONFIGURATION.md`, `docs/CHILD_ENVIRONMENT_BUILDER.md`, `docs/DYNAMIC_ENDPOINTS.md`, `docs/PROCESS_SUPERVISOR.md`, `docs/PHASE_R3_PACKAGE_AND_DEPLOYMENT_EXTRACTION.md`, `docs/architecture/ADR-R7-002-RUNTIME-MANIFEST-VERSIONING-AND-COMPATIBILITY.md` |

## Historical evidence

Use these reports only for detailed evidence not captured in current canonical docs:

- [NM.1 inventory](NM_1_NAMING_INVENTORY_AND_IMPACT_DISCOVERY_REPORT.md); [NM.2.1](NM_2_1_CORE_NAMING_AND_CONTRACT_MIGRATION_REPORT.md); [NM.2.2](NM_2_2_DEMO_AND_CONSUMER_MIGRATION_REPORT.md); [NM.2.3](NM_2_3_TOOLING_AND_DOCUMENTATION_MIGRATION_REPORT.md); [NM.2.3.V](NM_2_3_V_VERIFICATION_CLOSURE_REPORT.md).
- [NM.3.1 packaging](NM_3_1_ARM_PACKAGING_AND_DEPLOYMENT_CONFIGURATION_MIGRATION_REPORT.md); [NM.3.2 fresh state](NM_3_2_CONTROLLED_FRESH_STATE_PREPARATION_REPORT.md); [NM.3.3.A](NM_3_3_A_DEPLOYMENT_PREFLIGHT_VERIFICATION_REPORT.md); [NM.3.3.A-R](NM_3_3_A_R_ISOLATED_DEPLOYMENT_ENVIRONMENT_PREPARATION_REPORT.md); [NM.3.3.B](NM_3_3_B_ARM_FRESH_DEPLOYMENT_AND_RUNTIME_VERIFICATION_REPORT.md); [NM.3.3.C](NM_3_3_C_RUNTIME_CONFIGURATION_ROOT_CAUSE_ANALYSIS_REPORT.md); [NM.3.3.D](NM_3_3_D_TARGETED_REMEDIATION_REPORT.md); [NM.3.3.V](NM_3_3_V_RUNTIME_VERIFICATION_CLOSURE_REPORT.md); [NM.3.3.V-R](NM_3_3_V_R_STARTUP_DIAGNOSIS_AND_VERIFICATION_RECOVERY_REPORT.md).

Read `AGENTS.md`, then `PROJECT_STATE.md`, then the relevant feature/contract and decision docs. Inspect implementation only where needed; load historical reports only for a specific unresolved evidence question.
