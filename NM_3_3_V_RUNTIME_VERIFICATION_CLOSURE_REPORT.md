# NM.3.3.V Runtime Verification Closure Report

## Acceptance recommendation: PARTIAL — AS listener safety gate failed

The approved persistent environment and artifact revalidated successfully. AS 1.1.1 installed and activated, and the approved fixed-port configurations were applied. CDC passed its first loopback listener gate. AS 1.1.1 reported RUNNING and its logs showed CDC session establishment, but the immediate OS inspection found no listener on 3000 and health returned HTTP 000. AS and CDC were stopped for containment; EServers and SPA were not started. No process was restarted after the failed AS gate. RF-22 remains open and dependent RF-23 listener verification was not reached.

## 1. Repository baselines and authorization

- AS `main`, HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; pre-existing migration worktree changes preserved.
- ARM `arm-supervisor`, HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`; existing documentation modifications, including `docs/Note.txt`, preserved.
- Operator explicitly authorized NM.3.3.V for the exact persistent root, AS 1.1.1 candidate, fixed PORT values, and process lifecycle/runtime checks. No authorization was inferred beyond that scope.
- No source/test changes, package regeneration, commits, non-isolated deployment changes, or NM.4 work occurred.

## 2. Environment revalidation

- Canonical root: `/home/parker/nm-verification/naming-migration-v1.1.0/`; ARM storage, AS task/selection state, secrets and logs resolve beneath that root. Root and operational directories are owned by `parker` and mode `0700`; protected token/key are mode `0600`.
- Existing management process identity: PID `81410`, executable Node 22.23.5, command `examples/supervisor/src/management-api.ts`; listener `127.0.0.1:3300`. ARM `package.json` maps `dev:management` to this host and `dev:supervisor` to the example app; no new Supervisor was started.
- Authenticated management inventory succeeded. Before mutation, all five apps were STOPPED; AS active 1.1.0, peers active 1.1.0. Their release inventory confirmed AS 1.1.1 unused. Required ports 3000, 3001, 3002, 3012, 3003 were closed. Existing credentials were available; values were not printed.
- Repository dirty worktrees were preserved. Current shell reported Node 24/npm 11, while the verified Supervisor and child runtime executable are pinned to Node 22.23.5. No npm build or test command was run in this task.

## 3. AS artifact and installation

- Artifact: `arm-packages/nm33d-v1.1.1-verified/as-1.1.1.zip`.
- SHA256SUMS passed; exact SHA-256 `0857d072f9515bef0ad2e19128b8c70d70f5278de9970b12e7ede6c669e39a13` matched approval.
- Manifest confirms application ID `as`, version `1.1.1`, schema `1.0`, entry `dist/src/main.js`; package contains lockfile and compiled HOST remediation.
- Authenticated `POST /deployments/upload` returned HTTP 201. Receipt recorded version `1.1.1`, matching SHA-256, and immutable path `/home/parker/nm-verification/naming-migration-v1.1.0/arm-storage/applications/as/releases/1.1.1`. `alreadyInstalled:false`; no installation error was returned. Immediately after install, AS remained selected at 1.1.0 and STOPPED.
- AS 1.1.0 and peer 1.1.0 releases were preserved. No peer 1.1.1 artifacts were installed.

## 4. Configuration and activation

Before editing, previous application configs were preserved under `logs/nm33v-config-backup-2026-11-26/`, directory mode `0700`, files `0600`. Config files remain mode `0600`; API key values are redacted.

Applied settings:

- AS `PORT=3000`, test peers enabled, SQLite disabled, CDC URL/path preserved, isolated task and selection paths preserved. No HOST was placed in app config.
- CDC `PORT=3001`.
- EServer 1 `PORT=3002`, identity `e-1`; EServer 2 `PORT=3012`, identity `e-2`. Redundant `ESERVER_PORT` removed.
- SPA `PORT=3003`.
- Shared application key, AS URLs, credentials and isolated state locations were preserved.

AS-only activation returned HTTP 200 and selected 1.1.1 while remaining STOPPED. CDC, both EServers and SPA remained active on 1.1.0 and STOPPED. No automatic reactivation of AS 1.1.0 occurred.

## 5. Startup gates and listener evidence

| App | Release | ARM assigned port | Actual listener | Result |
|---|---:|---:|---|---|
| CDC | 1.1.0 | 3001 | `127.0.0.1:3001`, owned by managed PID 755740 | Gate passed |
| AS | 1.1.1 | 3000 | No listener observed on port 3000 at immediate check | Gate failed; stopped |
| EServer 1 | 1.1.0 | Not started | Not checked | Not started by safety gate |
| EServer 2 | 1.1.0 | Not started | Not checked | Not started by safety gate |
| SPA | 1.1.0 | Not started | Not checked | Not started by safety gate |

CDC process identity was correlated: ARM PID 755740, `/proc` executable Node 22.23.5, command points to the approved isolated `cdc/releases/1.1.0/main.js`; `ss` showed `127.0.0.1:3001` owned by PID 755740.

AS start returned HTTP 200, release 1.1.1, PID 756903, assigned port 3000, RUNNING. `/proc/756903` identified Node 22.23.5 and the isolated AS 1.1.1 entrypoint. Immediate OS listener check had no `:3000` row; `curl http://127.0.0.1:3000/health` failed with `curl: (7) Failed to connect to 127.0.0.1 port 3000`, HTTP 000. No wildcard listener was present either. This is absence of a listener, not evidence of a compliant loopback bind.

The supported ARM stdout shows AS loaded the configured CDC URL/path, connected to CDC and received `SESSION READY` for the synthetic demo VM before stop. Stderr was empty. ARM stop returned HTTP 200 and status STOPPED; a subsequent listener inspection showed no port 3000. CDC was then stopped as containment. All five final app statuses are STOPPED and all five required ports are closed.

## 6. Authentication, integration, lifecycle and state

- Management authentication was verified during preflight through authenticated inventory and prior NM.3.3 records; no secret was exposed. This run did not send synthetic application-level valid/invalid credential requests because the AS listener gate failed and downstream verification was halted.
- AS-to-CDC Socket.IO `/ws` connection and session acknowledgment were observed in AS stdout. The CDC start passed its loopback/assigned-port gate.
- No EServer, SPA registration, welcome/ping, app-auth negative test, or business-flow checks were run in this attempt. No AA Electron or AA-dependent flow was started.
- Lifecycle testing was limited to the safety stop of AS and containment stop of CDC. No restart was performed after the failed AS gate. No EServer lifecycle test was reached.
- SQLite remained disabled. Existing approved task/selection paths remained configured; AS created expected `.r7.5-outbox` directories and `.quarantine` directories only under those paths. No legacy state was accessed or mutated. No task/selection business records were created.

## 7. Finding dispositions

- **RF-22 — OPEN.** Although release 1.1.1 contains the HOST remediation and config omitted HOST as required, no listener appeared on port 3000 at the mandatory immediate inspection. It cannot be marked loopback-bound. AS was stopped and must not be restarted until the runtime startup/bind discrepancy is diagnosed in a separately authorized step.
- **RF-23 — OPEN / not fully tested.** CDC confirms explicit PORT produces matching assigned and loopback listener. Neither EServer was started, so fixed 3002/3012 behavior remains unverified.
- **CDC/SPA port consistency:** CDC passed. SPA was not started, so SPA remains unverified.
- **RF-24 — PARTIAL.** CDC session authentication/registration acknowledgment was observed; app-level positive/negative auth matrix and EServer/SPA connectivity were not reached. AA-dependent business flows remain deferred to NM.4.
- **RF-25 — CONTAINED.** AS safety gate failure caused immediate stop, no restart, and no dependent peer start. CDC was stopped afterward; evidence and state were preserved. No deviation from the containment requirement.

## 8. Final inventory, evidence and ownership

- Supervisor PID 81410 remains the isolated `dev:management` host on `127.0.0.1:3300`, storage root `/home/parker/nm-verification/naming-migration-v1.1.0/arm-storage`.
- Installed releases: AS 1.1.0 and 1.1.1; CDC, EServer 1/2, SPA 1.1.0. Active selections: AS 1.1.1; peers 1.1.0.
- Final process inventory: all five applications STOPPED. Only management port 3300 remains in the approved set; app ports are closed.
- Durable API receipts, status, logs, health result, containment responses and redacted preflight evidence are under `/home/parker/nm-verification/naming-migration-v1.1.0/logs/`. Config backups are under `logs/nm33v-config-backup-2026-11-26/`. Credentials, releases and state were not deleted.
- To start the Supervisor later, verify port 3300 ownership first, use the existing protected management token and ARM storage path, Node/npm 22.23.5/10.9.9, `ARM_CHILD_LOGGING=1`, `DOTENV_CONFIG_PATH=/dev/null`, then run `npm run dev:management` in the ARM checkout foreground. Stop only after verifying process identity, using Ctrl-C/SIGTERM. Do not start AS or peers before a new explicit runtime-safety plan; do not use `dev:supervisor`.

## 9. Remaining work and stop point

The blocker requires targeted diagnosis of why the AS 1.1.1 process produced a successful ARM start and CDC session logs but no observable HTTP listener on its assigned port. Do not reactivate/start AS 1.1.0 as fallback. Do not start EServers or SPA until AS has passed its loopback gate. Preserve the persistent environment. NM.3.3.V stops here; NM.4 was not started.
