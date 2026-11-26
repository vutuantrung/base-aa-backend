# NM.3.3.V-R Startup Diagnosis and Verification Recovery

## Acceptance recommendation: BLOCKED for V-R.2 — network safety boundary could not be verified

V-R.1 remains PASS for its bounded read-only diagnosis. V-R.2 revalidated the approved Supervisor, releases, stopped application inventory, configurations, credentials and application-port availability, but did not start applications because a sufficiently isolated network boundary could not be established under the restrictions. RF-22 and RF-23 remain runtime-unresolved.

Read-only diagnosis supports that the prior immediate listener probe occurred before AS completed its asynchronous startup. The retained stdout records successful listener initialization and CDC session registration during the same managed process run. The logs do not timestamp the listener event or establish its bind address, so RF-22 cannot be closed. At the original V-R.1 report, controlled startup had not been authorized. The operator later authorized V-R.2, but its safety prerequisite blocked startup as recorded below. The historical NM.3.3.V report remains unchanged.

## 1. Repository baselines and scope

- AS `main`, HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`. Existing migration worktree changes were preserved; this task changes only this report and the checkpoint.
- ARM `arm-supervisor`, HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`. Existing documentation changes, including `docs/Note.txt`, were preserved.
- Read-only diagnosis only. No application configuration, runtime state, releases, source, tests, credentials, or managed processes were changed. No tests were run.
- Historical approved scope is `/home/parker/nm-verification/naming-migration-v1.1.0/`; the prior V report records AS 1.1.1 active and all five applications stopped after containment.
- During V-R.1, a sandbox process/listener recheck was attempted. `ss -ltnp` failed with `Cannot open netlink socket: Operation not permitted`; sandbox process output did not establish host Supervisor/process state. This was not evidence that the Supervisor or applications were absent. In V-R.2, narrowly authorized host inspection later verified the Supervisor, inventory, and listeners before the safety block.

## 2. AS 1.1.1 startup sequence

Source and installed compiled release agree on this sequence:

1. `dist/src/main.js` installs shutdown handlers, resolves environment configuration, calls `startApplication`, and awaits its promise.
2. Configuration resolves `HOST`; the installed code calls the same `resolveHost(environment.HOST)` path as source. ARM's trusted process environment supplies `HOST=127.0.0.1`; HOST is not part of application config.
3. `startApplication` synchronously constructs the application, invokes the lifecycle registration callback, applies test-peer setup, and awaits `application.listen(port, host)`.
4. Application construction opens persistence and creates routes, HTTP API, one HTTP server, Socket.IO attachment, and the CDC connector. With `ENABLE_SQLITE=0`, the SQLite database is not opened.
5. `application.listen` calls `startApplicationResources`. Before the HTTP listen call, it awaits `peerGateway.start(true)`.
6. `peerGateway.start(true)` sequentially starts the task and resource-selection workflows. Each reliable outbox runner awaits store initialization, claims its runner lock, lists persisted records, and may transition records previously marked `attempting`. These filesystem/lock operations can delay listener creation. No fixed startup deadline is defined by this AS lifecycle.
7. After those awaits, AS calls the shared server's `listenHttpServer`. With HOST supplied, it invokes `server.listen(port, host)` and awaits the `listening` event. HTTP and Socket.IO share this server.
8. Only after bind does AS mark ready, activate peer workflows, initiate the CDC connection, mark running, resolve `application.listen`, and log `Server listening on http://localhost:<port>`. The log text uses `localhost` regardless of the actual bound address and is not itself bind-address evidence.
9. CDC connect is initiated after HTTP bind and is not awaited by application startup. The retained session logs therefore follow listener initialization in the child's own stdout sequence.

There is no source evidence of a HOST-to-listener defect in this run. The installed compiled files contain HOST resolution and the explicit `server.listen(port, host)` call. These static checks do not prove the runtime value or actual OS listener address.

## 3. ARM start and RUNNING semantics

- Management `POST /applications/{id}/start` calls the runtime monitor, then the application lifecycle manager and ProcessManager.
- ProcessManager composes the child environment with trusted `PORT` and default/trusted `HOST=127.0.0.1`, spawns the child, waits for the OS `spawn` event, records PID/assigned port, persists process state, and returns. It does not wait for application-level startup or HTTP bind.
- The lifecycle manager's subsequent inspection treats a verifiable live PID as process `RUNNING`. The AS release manifest has `arm.enabled=false`, so readiness is `NOT_CONFIGURED`; runtime monitor's readiness wait returns immediately for this state.
- The Start API's HTTP 200 and `process.status=RUNNING` therefore prove successful process creation and a live PID at inspection time, not HTTP binding, health, or application readiness.
- No AS startup deadline is configured. The 15-second window proposed in V-R.2 is only a diagnostic observation deadline, not an existing readiness contract. The `1500ms` ARM metrics health timeout applies only to configured ARM-enabled readiness and is not used for this AS release.

## 4. Retained failed-start timeline

Evidence is under `/home/parker/nm-verification/naming-migration-v1.1.0/logs/`.

| Event | Evidence and timestamp | Finding |
|---|---|---|
| Start API response | `nm33v-start-as.json`: AS 1.1.1, PID 756903, assigned port 3000, RUNNING, readiness `NOT_CONFIGURED`; no response timestamp retained | Spawn-level status only |
| Child launch | Diagnostics: `2026-11-26T09:41:01.604Z` | Exact launch timestamp retained |
| Child spawned | Diagnostics: `2026-11-26T09:41:01.608Z`, PID 756903 | Four milliseconds after recorded launch |
| Immediate listener probe | Historical V report records no `:3000` listener and failed `curl http://127.0.0.1:3000/health` (`curl: (7) Failed to connect`, HTTP 000); exact probe timestamp not retained | Probe was performed after the Start response, but delay is unknown |
| HTTP listen completed | AS stdout records `Server listening on http://localhost:3000`; no timestamp | Successful listen invocation is evidenced, actual bind address is not |
| CDC connection/session | Following lines in the same stdout record transport connection and `SESSION READY` for synthetic VM `as-demo-vm`; no timestamps | Startup progressed past HTTP listen and CDC session registration |
| Stop and exit | Diagnostics: child exit `2026-11-26T09:41:45.464Z`, code 0, signal null; stdout records lifecycle drain and cleanup | Process lived about 43.856 seconds from spawn to exit; this is not a measured startup duration |

No retained timestamps exist for Start API response, listener initialization, probe, health request, or stop request. Do not derive startup duration from log order or the spawn-to-exit interval. Stdout's in-process ordering, the later successful listen log, and the clean managed stop support that the no-listener probe preceded listener initialization; there is no evidence that the process exited or closed the server between those events.

## 5. Root cause classification and limits

**Classification: Confirmed premature verification (RF-26).** ARM's successful Start response/RUNNING status is intentionally earlier than AS readiness for a package with readiness disabled. AS has awaited filesystem-backed workflow/outbox initialization before binding. The immediate probe observed no listener, while the same managed run later logged successful HTTP listen and CDC session readiness. Together these support that verification sampled startup before the bind completed.

This conclusion does not establish how long initialization took, nor that the actual listener was `127.0.0.1`. `localhost` in the log is a fixed message, not an address observation. No source defect or configuration defect is confirmed. A controlled observation is still required to verify HOST injection at runtime and the actual OS bind address.

## 6. V-R.1 authorization status and V-R.2 safety status

- At V-R.1, V-R.2 authorization had not yet been supplied, so no controlled startup was attempted then. The subsequent operator authorization is recorded in section 10.
- No application was started, stopped, or restarted during either V-R.1 or V-R.2. No replacement Supervisor was started.
- The V-R.2 authenticated inventory freshly confirmed all five applications STOPPED and host listener inspection confirmed application ports free before any startup decision.
- No network isolation mechanism was established or validated. Polling alone cannot rule out a transient unsafe listener. Section 10 records why the authorized V-R.2 attempt stopped before startup.
- Installed AS 1.1.1 statically supports HOST and passes it explicitly to `server.listen`; the ARM trusted launch contract statically supplies `HOST=127.0.0.1`. The effective runtime injection was not exercised because no application was started.

## 7. Remaining NM.3.3.V verification

No V-R.2 application runtime checks were run because network isolation could not be established. The prior V report's CDC loopback gate remains historical evidence only; it was stopped after the AS failure. EServers and SPA were not started in that attempt. V-R.2 did freshly confirm all five apps stopped, their active release versions, configuration values with secrets redacted, and required application ports available. It provides no fresh application listener, authentication, peer-registration, lifecycle/reconnection, or state-activity results.

If separately authorized and safe observation is established, use the bounded V-R.2 procedure: start CDC and confirm process-correlated `127.0.0.1:3001`; then start AS and observe PID/listeners/logs every 200–250ms for at most 15 seconds. Verify exact `127.0.0.1:3000` and health before starting peers. Stop and contain immediately for any unexpected listener, process identity uncertainty/exit, startup error, or deadline expiry. Do not retry AS after a safety failure. Only after the AS gate passes, verify EServer 1 `:3002`, EServer 2 `:3012`, SPA `:3003`, identity/auth/session behavior, and the previously authorized representative lifecycle checks with the same bind gate after starts/restarts. Preserve releases, credentials, state, and logs.

## 8. Finding dispositions and final inventory

- **RF-22:** OPEN. Source and compiled HOST wiring are consistent; actual AS listener address was never captured.
- **RF-23:** OPEN. EServers were not started in the retained attempt; fixed-port listener behavior remains unverified.
- **RF-24:** PARTIAL. Prior AS-to-CDC session ACK is retained. EServer/SPA, positive/negative app authentication, and AA-dependent workflows remain unverified; AA flows stay deferred to NM.4.
- **RF-25:** CONTAINED in the historical attempt. AS was stopped after the failed immediate gate; no retry or dependent peer startup followed. This diagnosis made no runtime changes.
- **RF-26:** CONFIRMED verification-timing/readiness-semantics discrepancy. ARM's `RUNNING`/HTTP 200 is spawn-level for this readiness-disabled app; AS's listener follows awaited filesystem-backed startup work. No application readiness contract is being added.
- Last retained final inventory: AS 1.1.1 active, peers 1.1.0 active, all five processes STOPPED; management Supervisor PID 81410 was reported on loopback 3300 with approved storage. These are historical observations from the V report, not a current live revalidation. Persistent evidence and state remain under the approved root.

## 9. Stop point

V-R.1 diagnosis acceptance is **PASS**. The V-R.2 execution acceptance is **BLOCKED**. Do not begin application startup until an approved isolation boundary is available. No implementation or NM.4 work began. The original NM.3.3.V report is preserved unchanged.

## 10. V-R.2 authorized recovery attempt — preflight and safety blocker

The operator explicitly authorized controlled startup observation with a 15-second maximum window and approximately 250ms polling, and authorized remaining NM.3.3.V checks if safety prerequisites pass. No deployment mutation was performed because the mandatory network safety prerequisite did not pass.

### Revalidation

- AS remained `main` at `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; ARM remained `arm-supervisor` at `4e887715d4576e6fa64644778f0072bc94c018b4`. Existing dirty worktrees were preserved.
- Canonical persistent root, ARM storage, AS state, logs and secrets resolve beneath `/home/parker/nm-verification/naming-migration-v1.1.0/`; root/storage/state/log directories are owner `parker`, mode `0700`. Management and application credentials are present, owner-only `0600`; values were not read into output.
- Actual Supervisor PID `81410` was inspected: Node executable `/home/parker/.nvm/versions/node/v22.23.5/bin/node`, working directory is the ARM checkout, entrypoint `examples/supervisor/src/management-api.ts`; filtered process environment confirms `ARM_DEPLOYMENT_ROOT=/home/parker/nm-verification/naming-migration-v1.1.0/arm-storage`, management port `3300`, `ARM_CHILD_LOGGING=1`, and `DOTENV_CONFIG_PATH=/dev/null`. `ss` confirmed management listener `127.0.0.1:3300` owned by PID 81410.
- Authenticated `GET /applications` returned HTTP 200. Active releases and statuses: AS 1.1.1 STOPPED; CDC, EServer 1, EServer 2 and SPA 1.1.0 STOPPED. All reported readiness `NOT_CONFIGURED`; no application process PID was present. Recovery state was `MANUALLY_STOPPED` for each.
- A host listener listing showed no listener on required ports 3000, 3001, 3002, 3012, or 3003. The same listing showed an active Wi-Fi interface separately during network inspection; therefore absence of app listeners is not itself a network isolation boundary.
- Owner-restricted configuration reads confirmed fixed PORTs 3000/3001/3002/3012/3003, AS `ENABLE_SQLITE=0`, CDC URL/path and persistent task/selection paths, EServer IDs `e-1`/`e-2`, and API keys present. No HOST was added to application config. No config was changed. The approved persistent state directories and existing outbox/quarantine subdirectories were preserved.
- Node/npm in the interactive shell were `v24.21.0`/`11.19.0`; no Supervisor restart or package/build operation was attempted. The existing Supervisor itself was verified as Node 22.23.5. No active release, configuration, credential, state, or package changes were made.

### Network safety prerequisite result

- Host interface inspection showed `wlp3s0` UP at `10.0.219.123/24` with a default route. This host is connected to a non-loopback network.
- Exact read-only command `nft list ruleset` failed: `Operation not permitted (you must be root)`. The shell is not root; sudo is prohibited. Thus no existing firewall policy was verified to isolate a transient wildcard child listener.
- Exact command `unshare --user --map-root-user --net true` failed: `unshare: unshare failed: Operation not permitted`. In addition, placing the already running Supervisor and its children in a new network namespace would require changing Supervisor process ownership/lifecycle, which was outside this bounded application-start authorization and was not attempted.
- A sandbox listener recheck failed with `Cannot open netlink socket: Operation not permitted`; an earlier narrowly authorized host inspection succeeded and established no listeners on the five app ports. The sandbox denial was not treated as application absence.
- No firewall rule or system permission was changed. No sudo was used. No app start, stop, restart, diagnostic startup polling, or synthetic request was issued.

### Stop reason and minimal prerequisite

The requirement to prevent transient non-loopback exposure cannot be met by polling alone. The approved host has an active external interface; firewall isolation could not be verified without root, and user/network namespace creation is denied. Because system firewall changes, sudo, and Supervisor replacement/relaunch were not authorized, startup is blocked before any process mutation. The minimal next prerequisite is an operator-provided execution environment or pre-established, verifiable network isolation boundary that contains any accidental wildcard bind while preserving loopback communication among the five managed processes. Once available, the already authorized bounded startup observation and remaining NM.3.3.V verification may resume without further deployment authorization, provided the approved environment remains unchanged.

Final status for this attempt: all five managed apps remain STOPPED; AS 1.1.1 and peer 1.1.0 release selections are preserved; management PID 81410 remains the verified isolated Supervisor on loopback port 3300. No synthetic state was created. RF-22, RF-23, and remaining RF-24 checks are still open/partial; RF-25 safety containment was respected; RF-26 diagnosis remains confirmed.
