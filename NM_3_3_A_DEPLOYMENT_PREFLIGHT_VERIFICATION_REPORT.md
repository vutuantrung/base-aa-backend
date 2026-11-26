# NM.3.3.A Deployment Preflight Verification Report

## 1. Repository baselines

- AS: branch `main`, HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`. The worktree remains extensively dirty from prior naming migration work and untracked reports/artifacts; all pre-existing changes were preserved. No reset, stash, stage or commit occurred.
- ARM: `../base-arm-app`, branch `arm-supervisor`, HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`; pre-existing `docs/Note.txt` modification remains untouched.
- Current toolchain in this shell: Node `v24.21.0`, npm `11.19.0`. NM.3.1 verification was performed with Node `v22.23.5`, npm `10.9.9`. No package generation or regression suite was run here.
- Current migration checkpoint before this report: NM.3.2 PASS for documentary controlled fresh-state preparation. NM.3.3.A is read-only preflight only.

## 2. ARM runtime availability and verified contracts

No local ARM Supervisor runtime was found: no `arm`/`arm-supervisor` executable, no visible Supervisor process, and no listener on proposed application ports `3000`, `3001`, `3002`, `3012`, `3003`, `3004`. Loopback TCP probes to those six ports returned closed. This does not establish that a remote target is absent; no target hostname/address or credential was supplied, so no API query was made. Runtime version, host, actual storage root, application inventory and deployment API availability are **unavailable**.

Source-verified ARM contracts from the local `arm-supervisor` checkout:

- Supervisor source startup: `npm run dev:supervisor` (package script runs `tsx examples/supervisor/src/index.ts`). This command was not run. It requires `ARM_MANAGEMENT_TOKEN` (minimum 16 characters). Management API binds loopback, default port `3300`, configurable by `ARM_MANAGEMENT_PORT`. Source-mode storage root is resolved from current working directory plus `ARM_DEPLOYMENT_ROOT` (default `./supervisor-data`); packaged-mode paths resolve from the executable directory. Do not assume this source-mode default is the target runtime root.
- Management API requires `Authorization: Bearer <token>`. Read routes: `GET /applications`; `GET /applications/{id}`; `GET /applications/{id}/releases`; `GET /applications/{id}/audit`; `GET /runtime/processes/{id}/logs` and `/stdout`, `/stderr`, `/diagnostics` when child logging is enabled. Child logging is enabled only with `ARM_CHILD_LOGGING=1`.
- Package install is `POST /deployments/upload`, content type `application/zip`, raw ZIP body. Source implementation installs an immutable release and returns a receipt; installation does not activate it.
- Activation is a separate `POST /applications/{id}/activate` with JSON `{"version":"..."}`. Process start, stop and restart are separate `POST /applications/{id}/start`, `/stop`, `/restart` actions. Requests require bearer auth. There is no supported application-configuration write endpoint in the inspected management API.
- Application config is a filesystem workflow at `<storageRoot>/applications/<applicationId>/application-config.json`, schema `{"schemaVersion":1,"environment":{"KEY":"string"}}`. Lifecycle process-spec creation reads this file when activation creates a process spec. Thus config must be written before activation/start; the practical sequence is install, write/verify config, activate, then start. No config file was written.
- Per-app auto-start is not a configured ARM API field. The migrated package manifests set `lifecycle.autoStart=false`; applications are explicitly activated and started. Active release selection and process status require live read routes to inspect.
- Install conflict behavior: same app ID/version and same package SHA is an already-installed release; same ID/version with different SHA fails as immutable checksum conflict. Release storage is `<storageRoot>/applications/<id>/releases/<version>`; upload staging is managed under storage root.

## 3. Existing application and release inventory

No accessible running target runtime means the following identities cannot be inventoried. Existing versions, active releases, ARM-recorded checksums, running/stopped state, application-config contents and deployment auto-start state are all **UNKNOWN** for `aab`, `pserver`, `sserver`, `as`, `cdc`, `spa`, `eserver-1`, and `eserver-2`. Do not infer absence from local ports or source tree. Old applications `aab`, `pserver`, and `sserver` must remain preserved and must be stopped before a coordinated incompatible cutover; do not run old and migrated naming contracts concurrently. Existing EServer IDs remain in place and require an explicit release/config switch decision.

The operator must use the target's authenticated read routes before any deployment authorization. Do not query or export secret values into this report; configuration inventory should redact `API_KEY` and all other credentials.

## 4. Package artifact availability and checksums

The NM.3.1 isolated artifact path `/tmp/nm31-packages.btIlmq/final/` is no longer present. Repository-local `arm-packages/` contains only the two EServer ZIPs among the five expected artifacts. Their current SHA-256 values do **not** match NM.3.1 recorded artifacts:

| Artifact/version | NM.3.1 expected SHA-256 | Current local status |
|---|---|---|
| `as-1.0.0.zip` | `7a1427532fa7c2cb84dcaf2e7fdf35dc413f0756b8958149be230ae31aec5e42` | Absent; exact NM.3.1 artifact unavailable |
| `cdc-1.0.0.zip` | `5c949cd65abf03e3cef13d017154bd975cb35c747f9096e99725df40eaee58b3` | Absent; exact NM.3.1 artifact unavailable |
| `eserver-1-1.0.0.zip` | `55d74977afcfc0f05b6a928237450231d4970af187340999bf555e8585f55197` | Present, SHA `27971310a490b3fba648d48464f4fbcc78fab43e911ad44ca28b9f8e4de9dc62`; mismatch, do not use |
| `eserver-2-1.0.0.zip` | `0c04309f10cec6caef326484867f228fce8962214c46028c6a26dfbf01c15d8e` | Present, SHA `81712ff61a2d8fa2a383ef4865ec7cdcc2defa9233f6c70ca8b33a11a3dc9fd9`; mismatch, do not use |
| `spa-1.0.0.zip` | `d987590e5425c9ab93b2ea2f10a0f22a479a0dae9a9ba916248b5f8c50aca7a4` | Absent; exact NM.3.1 artifact unavailable |

No artifact is verified usable for this deployment set. Package regeneration was prohibited and not attempted. The target's `(applicationId, version)` inventory is unavailable, so none can be classified as new installation, matching already-installed release or runtime checksum conflict. `1.1.0` is **not confirmed unused**. Do not recommend or use it until a target release inventory confirms it; a valid matching package set for the selected version must separately be produced and checksummed in an authorized phase.

## 5. Port and configuration preflight

At check time, loopback TCP ports `3000`, `3001`, `3002`, `3012`, `3003` and `3004` were closed, and no listener was shown by the local socket listing. This is a local snapshot only, not proof of availability on the unknown ARM target or across its network interfaces. ARM's default management port `3300` was not identified as a running listener; no API connection was attempted.

Source readers match the NM.3.2 templates: AS `PORT`, `ENABLE_TEST_PEERS`, `CDC_URL`, `CDC_SOCKET_PATH`, `API_KEY`, `ENABLE_SQLITE`, `DB_PATH`, `AS_TASK_STORE_DIR`, `AS_SELECTION_STORE_DIR`; CDC optional `API_KEY` and fixed port/path; EServer `AS_URL`, `PORT` (wins), `ESERVER_PORT`, `ESERVER_INSTANCE_ID`, `API_KEY`; SPA `AS_URL`, optional `API_KEY`, fixed port. ARM environment values must be strings. SQLite remains disabled in the proposed integration baseline; `DB_PATH` is omitted while disabled. `ENABLE_TEST_PEERS=1` enables AS's CDC client/peer mode.

### Redacted ARM application configuration templates

Replace host/path tokens with approved target values. The secret token is a placeholder only: include the same real secret in communicating apps only if the operator selects API-key authentication; otherwise omit `API_KEY` consistently. Templates are not written to the target.

`as`
```json
{"schemaVersion":1,"environment":{"PORT":"3000","ENABLE_TEST_PEERS":"1","CDC_URL":"http://REPLACE_TARGET_HOST:3001","CDC_SOCKET_PATH":"/ws","AS_TASK_STORE_DIR":"/REPLACE_WITH_FRESH_ABSOLUTE_ROOT/as/tasks","AS_SELECTION_STORE_DIR":"/REPLACE_WITH_FRESH_ABSOLUTE_ROOT/as/resource-selections","ENABLE_SQLITE":"0","API_KEY":"REDACTED_OPERATOR_SECRET"}}
```

`cdc`
```json
{"schemaVersion":1,"environment":{"API_KEY":"REDACTED_OPERATOR_SECRET"}}
```

`eserver-1`
```json
{"schemaVersion":1,"environment":{"AS_URL":"http://REPLACE_TARGET_HOST:3000","ESERVER_PORT":"3002","ESERVER_INSTANCE_ID":"e-1","API_KEY":"REDACTED_OPERATOR_SECRET"}}
```

`eserver-2`
```json
{"schemaVersion":1,"environment":{"AS_URL":"http://REPLACE_TARGET_HOST:3000","ESERVER_PORT":"3012","ESERVER_INSTANCE_ID":"e-2","API_KEY":"REDACTED_OPERATOR_SECRET"}}
```

`spa`
```json
{"schemaVersion":1,"environment":{"AS_URL":"http://REPLACE_TARGET_HOST:3000","API_KEY":"REDACTED_OPERATOR_SECRET"}}
```

If auth is disabled remove the `API_KEY` entry from all five. AS task/selection paths are not operator-selected yet, so they are unresolved placeholders and have not passed path checks. CDC binds fixed `3001`; SPA binds fixed `3003`; AS defaults/configures to `3000`; EServers use distinct proposed ports `3002`/`3012` and IDs `e-1`/`e-2`; AA remains standalone on fixed `3004`.

## 6. Persistent-state preflight

No deployment metadata or ARM per-app configuration was accessible, so legacy state paths are **UNKNOWN**. No task JSON, outbox record, SQLite database or other runtime record was opened. The NM.3.2 placeholder root is not an operator-selected path; canonical resolution, existence/emptiness, permissions, filesystem accessibility, and disjointness cannot be verified. No directories were created and no permissions changed.

Proposed path pattern, pending operator selection: `<approved-state-root>/as/tasks`, `<approved-state-root>/as/resource-selections`; SQLite `DB_PATH` is not applicable while `ENABLE_SQLITE=0`. Once actual paths are supplied, verify canonical paths are distinct and outside legacy state, ARM storage root, release directories, and temporary packaging/staging locations; check only path metadata and emptiness. Preserve existing paths. Pending-operation disposition remains an operator decision under existing policy; lack of observed records here is not evidence of cutover safety.

## 7. Proposed deployment command/API plan (not executed)

All examples below are plans only. Set placeholders from an approved environment; never put the bearer or app API secret in shell history or report output. Commands that write configuration/state or mutate releases/processes require a later explicit NM.3.3.B authorization.

1. **Supervisor startup if required:** from the ARM checkout, with source-mode storage root, API port and secret supplied by the operator: `ARM_DEPLOYMENT_ROOT=/ABS/ARM_STORAGE_ROOT ARM_MANAGEMENT_PORT=3300 ARM_MANAGEMENT_TOKEN=<secret-from-secret-store> npm run dev:supervisor`. This starts a runtime and is not approved or executed in NM.3.3.A. For an existing runtime, do not start a second one.
2. **Read-only status/inventory:** with a protected token available as a local variable, request `GET http://127.0.0.1:3300/applications`; then `GET /applications/{id}` and `GET /applications/{id}/releases` for each listed/required ID. Capture IDs, active version/checksum and process state only; redact config secrets. The local runtime was unavailable, so no requests were made.
3. **Process stop (mutation, later authorization only):** `POST /applications/{id}/stop` for old incompatible IDs `aab`, `pserver`, `sserver`, and any EServer requiring a coordinated release switch. Do not stop anything now; preserve all applications/releases/config/state.
4. **Metadata preservation:** record release/config paths and versions using approved ARM backup procedure. Do not copy state or expose secrets. ARM source supplies no API to read or write app config as a configuration API; filesystem-level preservation requires the operator's target access procedure.
5. **Fresh path preparation:** after operator selects paths, validate canonical disjointness and nonexistence/emptiness. Directory creation/permissions are intentionally omitted from this read-only phase and require later authorized execution.
6. **Install (mutating, separate from activation):** for each verified ZIP, `curl --fail-with-body -H 'Authorization: Bearer <token>' -H 'Content-Type: application/zip' --data-binary @<verified-zip> http://127.0.0.1:3300/deployments/upload`. This creates/installs an immutable release but does not activate it. Never upload an unverified/mismatching artifact or overwrite a same-version release.
7. **Configuration write (mutating filesystem workflow):** after install, write `<storageRoot>/applications/<id>/application-config.json` using ARM schema. Preserve existing EServer config first. No management API exists for this write in inspected source. Confirm JSON schema and redact secrets on review. The configuration must be in place before activation because activation reads it to create the process specification.
8. **Activate (separate mutation):** `POST /applications/{id}/activate` with `Content-Type: application/json` and body `{"version":"<verified-version>"}`. Activation requires stopped process; it selects release but does not itself start it.
9. **Start:** `POST /applications/{id}/start` for each migrated app after all configs/releases are ready. For planned dependency order, start CDC, AS, SPA, and both EServers; start AA separately only at its standalone host.
10. **Verify:** repeat `GET /applications` and per-ID `GET /applications/{id}`. If enabled, read `GET /runtime/processes/{id}/logs/stdout` and `/stderr`; use diagnostics route for launch details. Child logs require `ARM_CHILD_LOGGING=1` at Supervisor startup. No environment/config-injection verification API was found; verify injection through approved non-secret process diagnostics or operator-controlled runtime inspection.

The management API's exact endpoint/body contracts above are source-verified, but endpoint availability/features on an actual runtime are not. Example authenticated curl requests for any mutation are intentionally withheld from execution; no management call was sent.

## 8. Proposed rollback plan and limits (not executed)

1. Pause business traffic; stop migrated `as`, `cdc`, `spa`, `eserver-1`, and `eserver-2` via `POST /applications/{id}/stop`; stop standalone AA separately.
2. Preserve all new AS state paths, new releases/configuration and old applications. Do not copy, delete, convert or replay records.
3. Restore prior configuration from the operator's protected backup workflow. Restore old compatible package selection for `aab`, `pserver`, `sserver`; for unchanged EServer IDs select their saved prior release versions and restore previous config.
4. Activate each previous version with `POST /applications/{id}/activate` and body `{"version":"<previous-version>"}`, then start with `POST /applications/{id}/start`. Old IDs do not inherit the new IDs' configuration.
5. Verify the old coherent peer set and record operations made during the migrated window. A rollback is not necessarily lossless after new operations have occurred; operator must decide whether to accept gaps, stay on migrated releases for recovery, or seek separately approved reconciliation.

These are API patterns, not executable approved commands. The safe-rollout feature exists in ARM source but is not assumed enabled on the unknown target. Cross-application rollback is not atomic. Existing EServer IDs make release activation affect the same application identities.

## 9. Integration verification plan (not run)

- Confirm CDC process is running and target listener `3001` accepts the intended local/network route; confirm Socket.IO Engine.IO `/ws`, namespace `/`.
- Start AS on `3000` with `ENABLE_TEST_PEERS=1`, fresh task/selection stores and SQLite disabled; verify non-secret injected settings and AS health/status.
- Verify AS client connection to CDC, CDC acceptance of peer identity `as`, `cdc:welcome`/`as:welcome` compatibility and CDC session acknowledgment. Do not send a business test message to an existing environment in preflight.
- Verify EServers connect to AS `/peers`, listen on `3002`/`3012`, and register distinct logical IDs `e-1`/`e-2`; verify SPA connects and listens on `3003`.
- Review ARM process state and (if configured) stdout/stderr/diagnostics. Check initial start, explicit stop/start and configured restart behavior only in an authorized deployment window; do not assume Supervisor restart policy without runtime status/evidence.
- After separate approval, use approved local test business flows to verify task submission/result, selection, and SPA/EServer peer routes and ACK/persistence contracts. AA graphical verification remains NM.4. No verification above was executed.

## 10. Operator decisions and deployment authorization gate

| Decision | Status | Evidence/required input |
|---|---|---|
| Target Supervisor runtime/host/API port/storage root/version | **BLOCKED** | No local process/runtime; target endpoint and version not supplied. |
| Package release version | **BLOCKED** | Artifacts absent/mismatched and target inventory unavailable; 1.1.0 not confirmed unused. |
| Fresh AS task/selection paths | **PENDING** | Operator must select absolute, isolated paths; no actual paths provided. |
| SQLite | **PASS for proposal** | Integration baseline keeps `ENABLE_SQLITE=0`; `DB_PATH` omitted. |
| Authentication mode and secret provider | **PENDING** | Choose shared `API_KEY` mode or consistently omit; secret value not requested/disclosed. |
| Port allocation | **PENDING** | Local loopback proposal ports closed; target-side allocation/network reachability unavailable. Fixed CDC 3001/SPA 3003 must be supported. |
| Existing application handling | **BLOCKED** | IDs, versions, active releases, statuses and config unknown; target read-only inventory required. |
| Pending-operation disposition | **PENDING** | Operator confirms existing policy and cutover criteria; this check does not establish safety. |
| Maintenance window/process coordination | **PENDING** | Operator supplies window and responsible process operator. |
| Rollback responsibility | **PENDING** | Name decision owner; confirm prior releases/config backup and business-operation gap policy. |
| Deployment authorization | **PENDING** | Prior coding approvals do not authorize install, config writes, activation or process operations. |

Gate checklist:

- [x] Source-level ARM API/configuration contracts inspected; no live target claimed.
- [x] Local proposal port snapshot checked; all six app ports closed at check time.
- [ ] Target ARM runtime and read-only access confirmed.
- [ ] Existing identities/releases/checksums/status/configuration inventoried with secrets redacted.
- [ ] Five valid packages available and checksums verified; current two local EServer packages rejected due hash mismatch.
- [ ] Common unused release version confirmed for all five target IDs.
- [ ] Operator-selected state paths pass canonical isolation/emptiness/permission checks.
- [ ] Auth mode, host URLs, target port allocation and fixed listener availability approved.
- [ ] Pending-operation disposition, preservation owner and maintenance window approved.
- [ ] Rollback owner and loss/reconciliation decision confirmed.
- [ ] Explicit installation/configuration/activation/process authorization issued for NM.3.3.B.

## 11. Remaining blockers and acceptance recommendation

The target runtime and application inventory are unavailable; three expected artifacts are absent; the two local EServer artifacts have checksum mismatches; no unused release version or real state paths can be verified. No deployment mutations occurred. Resolve target access, package provenance/version, operator paths and cutover decisions before authorization.

**Acceptance recommendation: BLOCKED for deployment readiness.** Source-verified API and configuration plans are prepared, but artifacts and target runtime evidence are insufficient to authorize deployment. Stop at NM.3.3.A; NM.3.3.B has not started.
