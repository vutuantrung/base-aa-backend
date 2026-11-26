# NM.3.2 Controlled Fresh State Preparation Report

## 1. Baseline verification and preservation

- AS repository branch: `main`; committed HEAD: `72b31e54e266743fbfd18b6169e4a85c843ddeb7` (the recorded original development baseline).
- AS worktree was already substantially modified at entry: migration changes span source, tests, tooling and documentation, with deleted legacy paths and new migrated paths. Untracked NM.1–NM.3.1 reports, R8.0 plans, CDC/AA docs and migrated implementation paths were present. All were preserved. No reset, stash, stage, commit or discard occurred.
- Relevant pre-existing dirty files include `src/config/configuration.ts`, `src/modules/task-workflow/task-file-store.ts`, `src/modules/resource-selection/resource-selection-store.ts`, `src/shared/persistence/atomic-json-record-store.ts`, `src/shared/persistence/reliable-outbox-runner.ts`, `testing/cdc.mjs`, `testing/spa.mjs`, `testing/eserver.mjs`, `testing/shared/create-peer-server.mjs`, `testing/aa/`, `scripts/package-for-arm.sh`, `README.md`, and `docs/architecture/PROJECT_STATE.md`; the NM.3.1 report and prior migration reports were untracked at entry. These existing migration changes were read only where required and left intact.
- ARM checkout: `../base-arm-app`, branch `arm-supervisor`, committed HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`; only pre-existing dirty path observed: `docs/Note.txt` modified. It was not edited.
- Existing naming migration checkpoint: [PROJECT_STATE.md](docs/architecture/PROJECT_STATE.md) records NM.1 closed, NM.2.1–NM.2.3.V pass, and NM.3.1 local packaging pass. NM.3.1 artifacts and package checksums are in [NM.3.1 report](NM_3_1_ARM_PACKAGING_AND_DEPLOYMENT_CONFIGURATION_MIGRATION_REPORT.md).
- This checkpoint changes documentation only. Neither repository's source, tests, configuration, packages, runtime processes nor runtime state was changed or inspected.

## 2. Persistent state configuration inventory

| State | Reader/default | Resolution and durable content |
|---|---|---|
| Task store | `AS_TASK_STORE_DIR`; default `./data/tasks` | `JsonTaskFileStore` calls Node `path.resolve(directory)`, relative to process current working directory when constructed. Task JSON, results and reliability records are durable here; outbox at `<resolved-dir>/.r7.5-outbox`. |
| Resource selection store | `AS_SELECTION_STORE_DIR`; default `./data/resource-selections` | `JsonResourceSelectionStore` also calls `path.resolve(directory)` against process current working directory. Receipts/status and reliability records are durable here; outbox at `<resolved-dir>/.r7.5-outbox`. |
| SQLite | `ENABLE_SQLITE` equals string `1`; `DB_PATH` default `./data/app.db` | Config is read by AS. SQLite opens the given filename; relative paths follow the process working directory. Parent directory is created. `ENABLE_SQLITE=0` leaves this store disabled. Existing SQLite schema/table names and AA domain terminology remain unchanged. |

ARM's process launcher creates a release process from its immutable release entry and passes the per-application environment through its configuration injector. The inspected launcher/configuration contract does not establish a fixed child `cwd`; therefore relative application paths are deployment-dependent and may resolve differently across ARM versions or launch layouts. Do not rely on defaults or relative paths under ARM. Supply absolute paths for all three state settings when SQLite is enabled.

AS durable directories are external to the package staging/release paths in the observed source contracts. A release replacement with the same application ID normally retains the same per-ID `application-config.json` and could therefore reuse those configured paths. The new AS ID `as` gets a distinct ARM configuration record from old `aab`; this does not itself create isolated storage if the operator copies legacy path values. New IDs do not isolate `eserver-1` or `eserver-2` configuration because those IDs are unchanged. No automatic deletion, migration, conversion or replay is present in this preparation.

The store implementations retain their record formats and recovery behavior. Startup recovery for the task and selection outboxes is handled by the existing reliability runner from each store's `.r7.5-outbox`; the runner resumes/reconciles its existing durable pending operation records under the established retry/ACK policy. Do not point fresh configuration at an old store: doing so would reuse records and trigger the existing recovery path. No runtime contents were opened.

## 3. Fresh-state isolation strategy and permissions

Operator supplies three distinct absolute paths on storage controlled for AS runtime state. Example template values below deliberately contain replacement tokens and are not deployable until replaced. Select a deployment-specific root outside (a) every legacy task/selection/database location, (b) ARM's configured storage root, including its `applications/` and `staging/` trees, and (c) temporary release/build staging locations. Do not use a shared directory or a path that resolves through symlinks into those locations.

```text
AS_TASK_STORE_DIR=/REPLACE_WITH_ABSOLUTE_DEPLOYMENT_STATE_ROOT/as/tasks
AS_SELECTION_STORE_DIR=/REPLACE_WITH_ABSOLUTE_DEPLOYMENT_STATE_ROOT/as/resource-selections
DB_PATH=/REPLACE_WITH_ABSOLUTE_DEPLOYMENT_STATE_ROOT/as/sqlite/app.db
ENABLE_SQLITE=1
```

If SQLite is intentionally disabled, use `ENABLE_SQLITE=0`; `DB_PATH` is then inactive. Do not remove or rename any existing SQLite file or JSON/outbox path. Before startup, the operator verifies all selected fresh paths do not exist or are empty and that their canonical resolved paths are disjoint from legacy state and ARM storage/staging roots.

Grant the AS service identity traversal and read/write access to the dedicated state root; restrict the root and its child directories to that identity (recommended directory mode `0700` on POSIX). Store code creates JSON records with mode `0600`; SQLite and its WAL/SHM sidecars also require write access to the containing directory. Apply the target platform's equivalent ACLs where POSIX modes do not apply. Do not make state paths world-readable/writable. Do not pre-create directories as part of NM.3.2.

## 4. ARM storage and configuration contracts

The inspected ARM `ApplicationConfigurationStore` reads `<storageRoot>/applications/<applicationId>/application-config.json`; supported object shape is exactly `{"schemaVersion":1,"environment":{"KEY":"string"}}`. Missing files resolve to an empty environment; no `.env` inheritance is provided. The process launcher injects that application's configured environment. The following are templates only; they have not been written to ARM or verified through live configuration injection.

ARM package installation stores immutable releases under `<storageRoot>/applications/<applicationId>/releases/<version>` and uses `<storageRoot>/staging/<uuid>` for temporary extraction. Installation uses `(applicationId, version)` as release identity. If a release already exists with the same SHA-256, installation reports already installed; a different checksum at the same ID/version fails with `Immutable release version checksum conflict`. Choose a new version for changed package bytes; never overwrite or delete a release. The package script currently defaults to `1.0.0`, so operators must set an unused `VERSION` before rebuilding if these releases already exist.

## 5. Per-application configuration templates

Every template uses ARM's verified JSON format. Replace all `REPLACE_*` tokens with operator-controlled values. Use the same secret value for `API_KEY` on AS and each communicating peer when API-key authentication is enabled; omit the key from every template when disabled. Never place actual credentials in this report. The AS API key is used both for the CDC Socket.IO token and HTTP/peer auth; CDC checks the token when configured; SPA and EServers send the token to AS. Authentication remains optional under current source semantics.

### `as`

```json
{"schemaVersion":1,"environment":{"PORT":"3000","ENABLE_TEST_PEERS":"1","CDC_URL":"http://REPLACE_CDC_HOST:3001","CDC_SOCKET_PATH":"/ws","AS_TASK_STORE_DIR":"/REPLACE_WITH_ABSOLUTE_DEPLOYMENT_STATE_ROOT/as/tasks","AS_SELECTION_STORE_DIR":"/REPLACE_WITH_ABSOLUTE_DEPLOYMENT_STATE_ROOT/as/resource-selections","ENABLE_SQLITE":"1","DB_PATH":"/REPLACE_WITH_ABSOLUTE_DEPLOYMENT_STATE_ROOT/as/sqlite/app.db","API_KEY":"REPLACE_WITH_SHARED_SECRET"}}
```

If peer/CDC integration is not enabled, `ENABLE_TEST_PEERS` must not be set to `1`; in that mode AS does not construct its CDC client. The example assumes the migrated AS peer mode is required. If API-key auth is disabled, remove `API_KEY`. `SOCKET_CORS_ORIGIN` and `SHUTDOWN_TIMEOUT_MS` are supported AS settings but are omitted unless deployment requires a non-default value.

### `cdc`

```json
{"schemaVersion":1,"environment":{"API_KEY":"REPLACE_WITH_SHARED_SECRET"}}
```

CDC has a fixed listener at port `3001` and Socket.IO path `/ws`; source has no port or path environment reader. No CDC URL setting is required on CDC itself. If authentication is disabled on AS, remove `API_KEY` here too.

### `eserver-1`

```json
{"schemaVersion":1,"environment":{"AS_URL":"http://REPLACE_AS_HOST:3000","ESERVER_PORT":"3002","ESERVER_INSTANCE_ID":"e-1","API_KEY":"REPLACE_WITH_SHARED_SECRET"}}
```

### `eserver-2`

```json
{"schemaVersion":1,"environment":{"AS_URL":"http://REPLACE_AS_HOST:3000","ESERVER_PORT":"3012","ESERVER_INSTANCE_ID":"e-2","API_KEY":"REPLACE_WITH_SHARED_SECRET"}}
```

EServer uses `PORT` before `ESERVER_PORT`; do not configure both unless intentionally overriding. `ESERVER_INSTANCE_ID` is the existing logical instance identity and should remain distinct (`e-1` / `e-2` here). Both packages must be rebuilt from migrated source despite preserved ARM IDs.

### `spa`

```json
{"schemaVersion":1,"environment":{"AS_URL":"http://REPLACE_AS_HOST:3000","API_KEY":"REPLACE_WITH_SHARED_SECRET"}}
```

SPA has fixed listener port `3003`; it has no supported port override. API key can be omitted when auth is disabled.

### Standalone AA Electron

AA remains outside ARM packaging. Its current standalone startup reads `AS_URL` (default `http://127.0.0.1:3000`) and optional `API_KEY`; listener port is fixed at `3004`. Supply these through the operator's local process environment when launching the Electron application, not through an ARM application record. No AA packaging support is added.

## 6. Port and connection matrix

| Application | ID | Listener | Connection/configuration |
|---|---|---:|---|
| AS | `as` | `PORT`, default `3000` | Connects to `CDC_URL` on Socket.IO Engine.IO path `CDC_SOCKET_PATH` (`/ws`), namespace `/`; `ENABLE_TEST_PEERS=1` enables this client. |
| CDC | `cdc` | Fixed `3001` | Socket.IO `/ws`, namespace `/`; authenticates AS peer identity `as`, optional shared `API_KEY`. |
| EServer instance 1 | `eserver-1` | `PORT` or `ESERVER_PORT`, example `3002` | Connects to `AS_URL` `/peers`; logical `ESERVER_INSTANCE_ID=e-1`. |
| EServer instance 2 | `eserver-2` | `PORT` or `ESERVER_PORT`, example `3012` | Connects to `AS_URL` `/peers`; logical `ESERVER_INSTANCE_ID=e-2`. |
| SPA | `spa` | Fixed `3003` | Connects to `AS_URL` `/peers`. |
| AA | Standalone | Fixed `3004` | Electron client connects to `AS_URL` `/peers`, HTTP health/API; optional shared key. |

Ports are operator-supplied for host/network placement; the example assumes all listeners can coexist and that peers can route to AS. CDC and SPA ports cannot be changed with current application environment. CDC URL is configured on AS, not CDC. CDC is an AS client connection; AS initiates the Socket.IO connection and CDC does not connect to AS as a client.

## 7. Application identity and release mapping

| Previous application ID | Migrated ID | Action |
|---|---|---|
| `aab` | `as` | Install migrated `as` package; configure isolated fresh state. |
| `pserver` | `cdc` | Install migrated `cdc` package and configure optional matching API key. |
| `sserver` | `spa` | Install migrated `spa` package; its port is fixed at 3003. |
| `eserver-1` | unchanged | Install migrated EServer package with the same application ID. |
| `eserver-2` | unchanged | Install migrated EServer package with the same application ID. |

Do not delete or rename previous applications/releases. New IDs do not inherit old application configuration. For unchanged EServer IDs, inspect and preserve previous configuration, then update it deliberately for migrated AS URL/auth and instance identity as needed; retain a record of prior values for rollback.

## 8. Controlled cutover procedure (documentation only; not executed)

1. In ARM, inventory current application IDs, active release versions, configured startup state and process status. Record evidence without opening runtime records.
2. Confirm all five migrated package archives are available from the approved NM.3.1 output or a newly generated release set. Ensure both EServer packages came from migrated source.
3. Obtain SHA-256 checksums from the package producer and independently verify every archive at the transfer destination before installation. Compare exact bytes, not filenames.
4. List releases for each target application ID. If `(applicationId, version)` exists, compare its recorded package checksum: same checksum is already installed; different checksum is a hard conflict. Select a new unused version and rebuild rather than overwrite.
5. Identify old state locations from existing configuration and deployment records only. Do not read database contents or outbox records. Record paths, ownership and backup/preservation responsibility.
6. Confirm pending operations are handled under the existing system policy and the operator's accepted cutover criteria. Do not delete, replay, migrate, convert or manually mark records complete. If pending work cannot be resolved under policy, stop and escalate before cutover.
7. Stop incompatible old application processes in a coordinated maintenance window. Do not allow old and migrated naming contracts to exchange messages concurrently.
8. Preserve old applications, releases, per-app configuration and state untouched for rollback. Do not rename or delete them.
9. Select new AS task, selection and SQLite paths using the isolation rules above; set `ENABLE_SQLITE` deliberately. Confirm target filesystem permissions.
10. Verify selected fresh paths do not exist or are empty and resolve outside every legacy state, ARM storage and release staging root. This inspection must be limited to path metadata/emptiness, not record contents.
11. Prepare all five ARM configuration objects and review JSON syntax, IDs, URL, ports, shared-key consistency, feature mode and state paths. Apply updated config for `eserver-1` and `eserver-2` only after preserving previous values. AA remains a separate Electron startup configuration.
12. Install packages for `as`, `cdc`, `eserver-1`, `eserver-2` and `spa`; verify ARM's reported application ID/version/checksum and do not overwrite any release.
13. Activate migrated releases in a coordinated manner after all packages/configuration are ready. Keep old application IDs/releases inactive but preserved. ARM activation is stop-before-switch for a given unchanged ID; coordinate the overall migration to avoid mixed contracts.
14. Verify ARM configuration injection through process environment diagnostics that do not expose secret values, then verify each intended process starts and binds its assigned port. Live injection is not verified in this checkpoint.
15. Verify AS-to-CDC connection on `/ws` namespace `/`, peer registrations under migrated identities, then run approved business-flow checks for task submission/results, resource selection, SPA and both EServer instances. Confirm expected ACK and persistence behavior using application-level evidence; do not change retry/readiness semantics.

Dependency-driven startup order: prepare and start CDC so AS can establish its client connection; start AS with CDC peer mode and fresh state; then start SPA and both EServers after AS is listening. AA is standalone and should start after AS. Existing peer clients use their current connection/retry behavior; this order does not imply a new readiness guarantee.

## 9. Rollback procedure and limitations

1. Pause new operator-driven business traffic and stop migrated `as`, `cdc`, `spa`, and both EServer processes. Stop AA separately if it is running.
2. Do not run old and migrated naming contracts concurrently against the same peer topology. Select one coherent release/configuration set for the rollback window.
3. Preserve the new AS state paths exactly as found; do not point a previous release at them unless compatibility has been specifically established. Do not copy new records into old paths.
4. Restore compatible previous releases/configuration for `aab`, `pserver`, and `sserver` where supported, and restore the saved prior configuration for unchanged `eserver-1` and `eserver-2`. Switch EServer releases to the previous compatible builds; their unchanged IDs mean release activation affects those existing application identities.
5. Reactivate and start the previous application set using the previous persistent state only with its compatible release/configuration. Confirm peer URLs, credentials, ports and identity contract match that prior set.
6. Keep new application IDs, releases, configurations and AS state preserved for investigation. Do not delete them or automatically replay their outboxes.
7. Verify previous peer contracts and business flows; record any new operations that occurred during the migrated window and decide explicitly how they will be reconciled.

Rollback is not necessarily lossless after new business operations have occurred. New state may contain operations absent from the old state, and replay/merge/conversion is not authorized. The operator must decide whether to accept a business-operation gap, remain on the migrated release for controlled recovery, or obtain a separately approved data reconciliation plan. ARM's release activation can switch a stopped application's selected release; same-version package replacement is prohibited by checksum conflict. The dedicated safe-rollout manager has its own prior-release history behavior, but this coordinated multi-application naming cutover is not documented as an atomic transaction; do not assume a cross-application rollback is automatic.

## 10. Validation results and evidence boundaries

- Source-verified readers: AS `PORT`, `ENABLE_TEST_PEERS`, `CDC_URL`, `CDC_SOCKET_PATH`, `API_KEY`, `DB_PATH`, `ENABLE_SQLITE`; task/selection stores `AS_TASK_STORE_DIR` and `AS_SELECTION_STORE_DIR`; peer processes `AS_URL`, EServer `ESERVER_PORT`/`PORT` and `ESERVER_INSTANCE_ID`; AA `AS_URL`/`API_KEY`.
- Source-verified fixed ports: CDC `3001`, SPA `3003`, AA `3004`. AS defaults to `3000`; EServer defaults to `3002` and supports configured ports.
- ARM JSON schema verified from `ApplicationConfigurationStore`: integer schema version 1 plus string-valued environment map. Release conflict behavior verified from `DeploymentManager` and `ApplicationStorage`.
- Template consistency review: IDs match package mapping (`as`, `cdc`, `eserver-1`, `eserver-2`, `spa`); AS `CDC_URL`/path matches CDC's fixed listener and `/ws`; all peer `AS_URL`s target the AS example port; EServers have distinct listener ports and logical IDs; AS state paths are distinct absolute placeholders.
- Structural validation: templates were authored to the ARM source-verified object schema; all values are strings and optional secret placeholders have no real credentials. No live ARM config file was written or injected, and no ARM runtime configuration validation was claimed.
- No full regression suite was run, as instructed. No deployment commands, process operations or runtime-state inspection were performed.

## 11. Operator-supplied values and NM.3.3 deployment gate

Before NM.3.3 the operator must provide/confirm:

- [ ] ARM runtime availability, access method, target storage root and supported supervisor version.
- [ ] Approved package artifacts for all five IDs and verified SHA-256 checksums.
- [ ] Current application IDs, active release versions/checksums and preserved old application configuration.
- [ ] New release version unused for every `(applicationId, version)` target.
- [ ] Target AS hostname/address and routable URLs; distinct listener port allocations; availability of fixed CDC `3001` and SPA `3003`.
- [ ] Whether SQLite is enabled and three selected, distinct fresh absolute AS state paths outside legacy state, ARM storage/staging and release staging.
- [ ] Empty/nonexistent check and required filesystem permissions for selected fresh paths.
- [ ] External per-application configuration provider access for all five IDs and secret injection/rotation procedure.
- [ ] Old runtime state preservation location/owner and confirmation that pending operations meet the existing cutover policy.
- [ ] Whether an external CDC is used and, if so, its compatibility with the migrated AS protocol/authentication contract.
- [ ] Maintenance window, operator authorization for installation and activation, coordinated process control and rollback decision owner.
- [ ] Standalone AA Electron host/startup environment if AA is part of deployment validation.

Source-verified facts are the readers, defaults, ports, package identity mapping, ARM config schema and immutable release conflict rule described above. Operator-supplied values include actual paths, addresses, credentials, port availability, storage permissions, artifact provenance/checksums and package version. Unverified deployment conditions include ARM runtime availability/version, live config injection, target filesystem semantics, network reachability, external CDC compatibility, actual release inventory and process startup/flow results.

## 12. Remaining blockers and acceptance recommendation

- NM.3.3 is blocked pending operator-supplied target details and explicit authorization for installation/activation. No deployment or runtime validation is claimed.
- CDC and SPA listener ports are fixed in current package source; the deployment network must provide these ports or a separately approved product change would be required.
- Current package script defaults to version `1.0.0`; a conflicting different-checksum release requires a new version and regenerated artifacts.
- ARM source inspection does not prove target supervisor config injection, filesystem path behavior, external peer interoperability or release inventory.

**Acceptance recommendation: PASS for NM.3.2 preparation.** The persistent-state inventory, source-verified configuration templates, cutover/rollback procedures and deployment gate are prepared. Installation, activation, live injection and runtime operation remain unexecuted and outside this checkpoint.
