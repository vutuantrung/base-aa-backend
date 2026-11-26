# NM.3.3.A-R Isolated Deployment Environment Preparation Report

## 1. Repository baselines

- AS: branch `main`, HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`. Existing NM migration edits, untracked reports and prior artifacts were preserved. No reset, stash, stage or commit occurred.
- ARM: `../base-arm-app`, branch `arm-supervisor`, HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`. Its pre-existing `docs/Note.txt` modification remains the only dirty ARM checkout path. No ARM source or pre-existing ARM storage was modified.
- Verification toolchain: Node `v22.23.5`, npm `10.9.9`. The current source package script ran its existing `npm run typecheck` and isolated `npm run build`; no regression suite was run.

## 2. Isolated environment paths

New local verification root: `/tmp/nm33ar-isolated-verification` (created after confirming it did not exist; root and `as-state` parent restricted to mode `0700`). Canonical paths:

| Purpose | Canonical absolute path | Status |
|---|---|---|
| Isolated ARM supervisor storage | `/tmp/nm33ar-isolated-verification/arm-storage` | Created; only the new Supervisor uses it. |
| AS task store | `/tmp/nm33ar-isolated-verification/as-state/tasks` | Created mode `0700`; writable and empty. |
| AS resource selection store | `/tmp/nm33ar-isolated-verification/as-state/resource-selections` | Created mode `0700`; writable and empty. |
| Verification logs/API evidence | `/tmp/nm33ar-isolated-verification/logs` | Created mode `0700`; contains Supervisor log and redacted API preflight evidence. |
| Temporary package build staging root | `/tmp/nm33ar-isolated-verification/package-staging` | Created mode `0700`; packaging script's temporary build directory was cleaned by its trap. |
| Temporary package install verification | `/tmp/nm33ar-isolated-verification/package-install-check` | Created mode `0700`; five isolated extractions and `npm ci` installs; separate from ARM storage and AS state. |
| Secret files | `/tmp/nm33ar-isolated-verification/secrets` | Created mode `0700`; management token and shared app key files mode `0600`; values not displayed. |
| Persistent package output | `/home/parker/Working/Local_localProjects/external-git/base-aa-backend/arm-packages/nm33ar-v1.1.0-verified` | New output directory; separate from `src/`, `testing/`, and temporary build staging. |

The isolated `/tmp` paths are canonically disjoint from the existing ARM checkout/storage (`../base-arm-app/supervisor-data`), the existing AS `data/`, repository source directories, prior NM.3.1 `/tmp` paths and the separate package-staging path. The persistent ZIP output is within the AS repository's `arm-packages/` but in its own new child directory, outside source trees. No existing directory was reused, moved or deleted. The first generation attempt left one newly generated `as-1.1.0.zip` and its checksum file in the separate `arm-packages/nm33ar-v1.1.0/` partial-output directory; it was not used or overwritten. The complete verified set is only in the `...-verified` directory.

The task/selection paths are each distinct and empty at verification. SQLite remains disabled, so no `DB_PATH` is selected. No legacy state records or database contents were opened.

## 3. ARM runtime startup and management API verification

Source inspection showed the requested `npm run dev:supervisor` script is **not** the management Supervisor in this ARM checkout: it runs a standalone ProcessManager example (`examples/supervisor/src/index.ts`) and does not expose the management API. The actual `SupervisorHost` management entrypoint is `npm run dev:management` (`examples/supervisor/src/management-api.ts`), which initializes the host and loopback management API without starting an example app. It was launched with Node/npm 22.23.5/10.9.9, isolated env, `ARM_DEPLOYMENT_ROOT=/tmp/nm33ar-isolated-verification/arm-storage`, `ARM_MANAGEMENT_PORT=3300`, a random 32-byte `ARM_MANAGEMENT_TOKEN`, `ARM_CHILD_LOGGING=1`, and `DOTENV_CONFIG_PATH=/dev/null`. It logs `Supervisor management API listening at http://127.0.0.1:3300`.

Supervisor is still running as local PID `52820`, bound only to `127.0.0.1:3300`. The management token is in the mode-`0600` file noted above and is not included here. A no-token read request returned HTTP 401, confirming authentication remains enabled.

Authenticated, read-only API results (saved without secret/environment fields in `logs/api-preflight.json`):

- `GET /applications`: HTTP 200, `[]`.
- For each of `aab`, `pserver`, `sserver`, `as`, `cdc`, `spa`, `eserver-1`, and `eserver-2`: `GET /applications/{id}` returned 404; `GET /applications/{id}/releases` returned HTTP 200 with zero releases; `GET /runtime/processes/{id}/logs` returned HTTP 200.
- Therefore, the isolated Supervisor contains no applications or releases for the inspected identities. No install, activation or managed-app start occurred through the actual management Supervisor.
- Source package version is `base-arm-app@0.1.0`; no separate runtime build/version endpoint was found. The configured storage root is the exact absolute path above.

### Startup-script incident and cleanup

The first attempt used the requested `npm run dev:supervisor` script before its actual script mapping was checked. It launched the demo `example-app` child on loopback port `3210` (PID `49654`) and created a new `../base-arm-app/.arm-state/processes.json`. Once the mismatch was identified, that child was sent SIGTERM, port `3210` was confirmed closed, and the newly created state file/empty `.arm-state` directory were removed with explicit cleanup approval. ARM `git status` then returned to its pre-existing `docs/Note.txt` modification only. No existing ARM release/storage data was touched. This was an execution deviation from the no-managed-application-start restriction and is reflected in the acceptance recommendation below.

## 4. Application and release inventory; version selection

The authenticated empty inventory proves no applications or releases exist in this **new isolated root**. The pre-existing ARM storage root was not queried or modified and remains outside this environment. For every target ID (`as`, `cdc`, `eserver-1`, `eserver-2`, `spa`), isolated release inventory returned zero entries. Thus version `1.1.0` is unused for all five IDs in this isolated Supervisor. It says nothing about any pre-existing or remote deployment.

Application auto-start is not inferred from a live app: there are no installed apps. The migrated manifests generated below set `lifecycle.autoStart=false`; this Supervisor requires explicit activation/start. No existing app config exists in the isolated inventory.

## 5. Generated package inventory and checksums

The approved version is `1.1.0`, confirmed unused for all five target IDs in the isolated runtime. The migrated packaging script generated the packages from the current AS working-tree source into persistent output directory [arm-packages/nm33ar-v1.1.0-verified](/home/parker/Working/Local_localProjects/external-git/base-aa-backend/arm-packages/nm33ar-v1.1.0-verified). Its existing isolated build staging was directed to `/tmp/nm33ar-isolated-verification/package-staging`; it did not consume or clean the repository's pre-existing `dist/`.

`SHA256SUMS` is alongside the ZIPs and passed `sha256sum -c SHA256SUMS` (5/5):

| Artifact | SHA-256 |
|---|---|
| `as-1.1.0.zip` | `257c354e077ac51e32bc79a2da93b4150f3b326694390e573eb087518600b104` |
| `cdc-1.1.0.zip` | `17104752e72f0a0449e657932972dd96e4a143ecdf92f6c43418501c98b3f142` |
| `eserver-1-1.1.0.zip` | `83d09710ed06ef71c45b5d8637f160c858cc2e438ba25c26ce4cdeac48e274c1` |
| `eserver-2-1.1.0.zip` | `11845c1a25d04d522f81675438b8441e1d950db1fd10cd8fc6b2103dab407d95` |
| `spa-1.1.0.zip` | `4d1a79339021db7f5f079051092d29206f0a6cc59f115fcce0c550a8dd537f58` |

Package verification results:

- `unzip -t`: PASS for all five archives.
- Manifest: PASS for schema `1.0`, expected app ID/version, expected entrypoint, `npm-ci` strategy, `autoStart=false`, and `arm.enabled=false`.
- Entrypoint and required files: PASS; every ZIP has its declared entrypoint, `package.json`, and `package-lock.json`.
- Dependency metadata: PASS; package dependencies match the package-lock root dependency set for all five. AS deps are `express`, `socket.io`, `socket.io-client`, `zod`; peer deps are `express`, `socket.io`, `socket.io-client`.
- Migrated-name scan: PASS; no obsolete `pserver`, `sserver`, `aab`, or `aaui` identities found in archive paths or JavaScript/JSON contents. No obsolete compiled source paths found.
- Isolated dependency installation: PASS, `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` for all five extracted archives under `/tmp/nm33ar-isolated-verification/package-install-check/`. These are disposable verification installs outside ARM storage; no package was installed into ARM.

## 6. Fresh AS state preparation evidence

Absolute settings for a later isolated app configuration:

```text
AS_TASK_STORE_DIR=/tmp/nm33ar-isolated-verification/as-state/tasks
AS_SELECTION_STORE_DIR=/tmp/nm33ar-isolated-verification/as-state/resource-selections
ENABLE_SQLITE=0
```

Both paths were created only under the new isolated root, canonicalized, confirmed writable by the current service user, and confirmed empty. Their paths do not overlap one another, the isolated ARM storage, existing AS `data/`, existing ARM `supervisor-data`, repository source, or temporary packaging staging. No state-directory preparation used a legacy or release directory. Required permission for a later application identity/service account must be confirmed if different from the current local user.

## 7. Port availability and prepared configuration

Read-only local listener inspection found the isolated management API on `127.0.0.1:3300` and no listener on application ports `3000`, `3001`, `3002`, `3012`, `3003`, `3004`; TCP probes returned CLOSED for all six. The accidental demo port `3210` is also CLOSED after cleanup. This is a local snapshot, not a reservation. CDC (`3001`) and SPA (`3003`) are fixed in source; AS and EServer ports are configurable.

For this isolated loopback-only plan, application-level API-key authentication is explicitly **enabled** with one shared random key for AS/CDC/EServer/SPA. Its mode-`0600` value is stored in the local secrets directory but is not printed or installed. ARM management authentication remains enabled and independently uses its own token. No application config files have been written.

The ARM schema is `{"schemaVersion":1,"environment":{"KEY":"string"}}`. Replace `REDACTED_SHARED_APP_KEY` only from the local secret file when a later authorized config write occurs. These are templates, not active configuration.

`as`
```json
{"schemaVersion":1,"environment":{"PORT":"3000","ENABLE_TEST_PEERS":"1","CDC_URL":"http://127.0.0.1:3001","CDC_SOCKET_PATH":"/ws","AS_TASK_STORE_DIR":"/tmp/nm33ar-isolated-verification/as-state/tasks","AS_SELECTION_STORE_DIR":"/tmp/nm33ar-isolated-verification/as-state/resource-selections","ENABLE_SQLITE":"0","API_KEY":"REDACTED_SHARED_APP_KEY"}}
```

`cdc`
```json
{"schemaVersion":1,"environment":{"API_KEY":"REDACTED_SHARED_APP_KEY"}}
```

`eserver-1`
```json
{"schemaVersion":1,"environment":{"AS_URL":"http://127.0.0.1:3000","ESERVER_PORT":"3002","ESERVER_INSTANCE_ID":"e-1","API_KEY":"REDACTED_SHARED_APP_KEY"}}
```

`eserver-2`
```json
{"schemaVersion":1,"environment":{"AS_URL":"http://127.0.0.1:3000","ESERVER_PORT":"3012","ESERVER_INSTANCE_ID":"e-2","API_KEY":"REDACTED_SHARED_APP_KEY"}}
```

`spa`
```json
{"schemaVersion":1,"environment":{"AS_URL":"http://127.0.0.1:3000","API_KEY":"REDACTED_SHARED_APP_KEY"}}
```

AA remains a standalone Electron application on port `3004`, with local `AS_URL=http://127.0.0.1:3000` and the same `API_KEY`; it is not packaged or configured in ARM here.

## 8. RF-16–RF-19 disposition

- **RF-16 ARM runtime unavailable — RESOLVED for isolated local verification.** Actual `SupervisorHost` is running at loopback port 3300 from the local ARM checkout, against a new storage root. The `dev:supervisor` alias is a demo ProcessManager script in this source; actual management host uses `dev:management`.
- **RF-17 missing/unverified packages — RESOLVED for local package set.** All five migrated packages were generated at version `1.1.0` and passed structural, ZIP, naming and checksum checks. No dependency installation or ARM installation was performed.
- **RF-18 release version unconfirmed — RESOLVED for isolated root.** Authenticated release queries confirmed zero prior releases for all five IDs; `1.1.0` is unused there. This does not prove availability in any other ARM storage root.
- **RF-19 fresh state paths unresolved — RESOLVED for isolated local verification.** Two absolute AS state paths were created, canonicalized, writable and empty. SQLite is disabled.

## 9. Remaining blockers, process ownership and cleanup

No technical preflight blocker remains for this isolated environment. Application installation, ARM app-config writes, release activation, managed application start and business-flow verification remain unexecuted and require a separate NM.3.3.B authorization. The first script mismatch caused a brief, cleaned demo-process deviation described above; review this before accepting the checkpoint.

The isolated Supervisor process is owned by this verification session and runs as PID `52820`. Keep it available for the next authorized read/deployment phase. To stop it after work is complete, send SIGTERM to PID `52820` (or Ctrl-C the `npm run dev:management` session). This stops only the new isolated Supervisor. Do not delete its storage/logs/secrets without a separate cleanup decision; the directories and token are isolated from existing deployment data.

## 10. Acceptance recommendation

**Acceptance recommendation: PARTIAL.** The isolated runtime, authenticated empty inventory, unused release version, verified package set and fresh AS paths are prepared. However, the supplied `dev:supervisor` command maps to a demo application in the actual checkout; that script briefly launched an example child before the correct management entrypoint was used. The child and its newly created state footprint were cleaned, but the restriction against managed-app startup was transiently breached. No deployment has been verified, installed or activated. Stop here; do not begin NM.3.3.B automatically.
