# NM.3.3.B ARM Fresh Deployment & Runtime Verification Report

## Acceptance recommendation: BLOCKED

Deployment did not begin. Mandatory isolated-environment revalidation found that the approved ARM storage root, fresh AS state root, and protected credential files are absent; the management service is not reachable. No installation, configuration, activation, application startup, or state mutation was performed.

## Repository baseline and authorization

- AS `main` HEAD: `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; extensive pre-existing NM migration edits and untracked reports/artifacts remain preserved.
- ARM `arm-supervisor` HEAD: `4e887715d4576e6fa64644778f0072bc94c018b4`; its pre-existing `docs/Note.txt` edit remains preserved.
- Operator explicitly authorized NM-D04-B and NM.3.3.B for only `http://127.0.0.1:3300`, `/tmp/nm33ar-isolated-verification/arm-storage`, `/tmp/nm33ar-isolated-verification/as-state`, the verified package directory, five named app IDs and version `1.1.0`. Authorization remains unused because the environment did not revalidate.

## Environment revalidation and access recovery

- Escalated process inspection was approved and executed (`ps -eo pid,ppid,user,args`). It returned system processes but no Supervisor/management process. PID `52820` was not assumed current.
- Escalated listener inspection was approved and executed (`ss -ltnp`). No listener was present on port `3300`; no application ports `3000`, `3001`, `3002`, `3012`, or `3003` appeared. Other unrelated listeners were left untouched.
- Escalated unauthenticated loopback probe: `curl --max-time 3 -sS -o /dev/null -w 'unauthenticated_http=%{http_code}\n' http://127.0.0.1:3300/applications`; result: connection refused, HTTP `000`. Authenticated inventory could not be queried.
- `/tmp/nm33ar-isolated-verification`, `arm-storage`, `as-state`, task/selection directories, and `secrets` were confirmed missing. Therefore Supervisor identity/storage ownership, empty app/release inventories, secret existence/permissions, writable fresh state, and startup credentials cannot be verified.
- ARM `package.json` confirms `dev:management` maps to `tsx examples/supervisor/src/management-api.ts`; `dev:supervisor` maps to the example ProcessManager at `tsx examples/supervisor/src/index.ts`. No startup attempted because the protected management token is missing and recreating secrets or storage would not revalidate the existing approved environment.
- Earlier sandbox listener inspection failed with `Cannot open netlink socket: Operation not permitted`. Authorized inspection was subsequently requested and granted for local process/listener checks. An attempt to use local curl under the ordinary sandbox also failed with `Operation not permitted`; escalated curl reached the host and reported connection refused.

## Artifacts and remaining preflight

- Package directory `arm-packages/nm33ar-v1.1.0-verified/` exists. `sha256sum -c SHA256SUMS` passed all five: `as-1.1.0.zip`, `cdc-1.1.0.zip`, `eserver-1-1.1.0.zip`, `eserver-2-1.1.0.zip`, `spa-1.1.0.zip`.
- Artifact checksum results establish local file integrity only. Approved manifest history is available in the NM.3.3.A-R report; package identity/version was not re-opened because environment revalidation halted before deployment.
- No configuration files, installations, release activations, processes, logs, sessions, peer registrations, synthetic operations, or fresh state were created by NM.3.3.B.

## Deployment, runtime, and lifecycle results

Not run: authenticated installation receipts; configuration injection; activation/process specs; CDC/AS/EServer/SPA startup; authentication behavior; supervision/log/diagnostic APIs; lifecycle stop/start/restart; runtime interoperability, synthetic business flows, or state isolation checks. AA-dependent flows remain deferred to NM.4.

## Failures, classification, and minimal operator action

Blocking condition is environment restoration, not a demonstrated AS/ARM implementation defect. The management endpoint is down and the documented isolated root and protected credentials are absent. Do not substitute another storage root, recreate credentials, regenerate packages, or start a Supervisor against another deployment.

Minimal action: restore the approved isolated runtime and its existing protected token/API-key files at the exact approved paths (or explicitly provide a newly approved isolated baseline). Then rerun mandatory inventory, port, credential, and state checks. No deployment authorization is needed again if the exact approved environment is restored unchanged.

No releases were installed and no unexpected process was started; there is no NM.3.3.B process to stop. No runtime state or artifacts were cleaned up. No NM.4 work was started.


# Recovery continuation — NM-D05 persistent environment (2026-11-26)

## Outcome: PARTIAL; deployment contained after runtime safety findings

Operator explicitly approved NM-D05 and the new root `/home/parker/nm-verification/naming-migration-v1.1.0/`. A persistent isolated environment was prepared and the five version `1.1.0` releases were installed, configured, activated, and started for runtime verification. Runtime interoperability passed for AS/CDC/EServer/SPA registration and welcome/ping handshakes. However, the AS process bound to all interfaces, and configured EServer port values were not reflected by actual listeners; all five apps were stopped for containment. Only the isolated management Supervisor remains running on loopback. Recommendation: **PARTIAL**; do not accept as deployment-ready until bind and port configuration discrepancies are resolved in an approved future remediation scope.

## RF-21 disposition

RF-21 (ephemeral isolated environment disappears before deployment verification) is **RESOLVED for durability**: a new persistent root now exists at `/home/parker/nm-verification/naming-migration-v1.1.0/`, with canonical subdirectories `arm-storage`, `as-state/tasks`, `as-state/resource-selections`, `secrets`, and `logs`. Root and directories are mode `0700`; management token and shared application key files are mode `0600`. Secrets were generated locally using Python `secrets.token_urlsafe(48)`; values are never recorded. The newly approved environment is distinct from the former `/tmp` paths and existing ARM `supervisor-data`/AS `data`.

## Revalidation and repositories

- AS `main`: `72b31e54e266743fbfd18b6169e4a85c843ddeb7`; pre-existing migration dirty worktree preserved.
- ARM `arm-supervisor`: `4e887715d4576e6fa64644778f0072bc94c018b4`; pre-existing `docs/Note.txt` modification preserved.
- Node/npm used for ARM Supervisor and children: `v22.23.5` / `10.9.9`.
- ARM `package.json` mapping rechecked: `dev:management` → `tsx examples/supervisor/src/management-api.ts`; `dev:supervisor` → `tsx examples/supervisor/src/index.ts` (example-only, not run).
- Management listener was verified on `127.0.0.1:3300`, process PID `81410`; unauthenticated and invalid bearer requests returned HTTP 401; authenticated `/applications` returned `[]` before installation. Each of five release inventories was empty. No other required listener was present before startup.
- Approved package directory was reused without regeneration. `sha256sum -c SHA256SUMS` passed 5/5 and individual hashes matched the accepted NM.3.3.A-R report exactly. All release uploads returned HTTP 201, each ARM receipt reported expected ID/version, immutable release directory and matching SHA-256; all said `alreadyInstalled:false`, and each manifest had `autoStart:false`, `npm-ci`, `arm.enabled:false`. Dependency installation ran as part of ARM upload; no install error was reported.

## Configuration, activation, startup evidence

Owner-only configs were written to the approved path `<root>/arm-storage/applications/<id>/application-config.json`. AS contains `PORT=3000`, `ENABLE_TEST_PEERS=1`, `ENABLE_SQLITE=0`, `CDC_URL=http://127.0.0.1:3001`, `CDC_SOCKET_PATH=/ws`, and the two persistent state paths. CDC has the shared key. EServer configs contain intended AS URL, ports `3002`/`3012` and IDs `e-1`/`e-2`; SPA targets AS. All five include the same protected API key. Config file permissions are `0600`; key values are redacted. No DB_PATH or unsupported variable was configured.

All five activation calls returned HTTP 200. Each selected `1.1.0`, had a STOPPED process, and remained stopped until explicit start. Dependency ordered starts (CDC, AS, EServer 1, EServer 2, SPA) all returned HTTP 200 and ARM reported RUNNING. ARM logs showed:

- CDC listening at `127.0.0.1:3001`, accepting AS Socket.IO sessions and returning `SESSION READY` acknowledgements.
- AS used the configured CDC URL and `/ws`, initialized the synthetic VM `as-demo-vm`, and logged a session UUID/ready response.
- EServers identified as `e-1` and `e-2`, connected to AS, received `as:welcome`, and received successful `peer:ping ACK` responses.
- SPA connected to AS, received `as:welcome` and successful ping ACK. AS health returned HTTP 200.

Authentication remained enabled: bad management bearer returned 401. Application key injection was redacted and processes connected successfully, but a negative app-auth request was not exercised. No API key was exposed.

## Bind, ports, process supervision and lifecycle

Observed actual listeners while apps were running:

- CDC: `127.0.0.1:3001` (expected).
- SPA: `127.0.0.1:3003` (expected).
- AS: `*:3000` (unexpected non-loopback bind; safety containment required).
- EServer listeners were dynamic ports `33361` and `40997` initially (later `42005` and `40997`), rather than configured `3002`/`3012`. ARM `process.port` values for CDC/EServers/SPA also reflected dynamic child ports, not their source-fixed/configured HTTP ports.
- No listener on 3002 or 3012 was observed. No port collision was observed.

The AS all-interface bind is confirmed by `ss`, despite loopback CDC target and successful local health. AS was explicitly stopped during inspection then restarted for lifecycle verification; since it remained all-interface bound, it was stopped again. EServer 1 was stopped and started successfully; EServer 1 and AS restart produced fresh PIDs, and CDC/EServer/SPA logs confirmed reconnection and new session/welcome/ping handshakes. No arbitrary crashes or in-flight business operations were introduced.

Management APIs returned process status, stdout, stderr and diagnostics; log responses are retained in the persistent `logs/` directory. ARM `readiness` was `NOT_CONFIGURED`, so application readiness was inferred from logs, health and listeners, not the ARM readiness field.

## State and synthetic-flow scope

AS created only expected lock/quarantine directories below the two approved state directories, with owner-only permissions. SQLite remained disabled; no DB_PATH or legacy state was used. No persistent task/selection business operation was synthesized because AS is a demo VM process and no AA client was started. SPA registration, AS/CDC VM session, EServer registration, welcome and ping handshake are verified. EServer/SPA scheduled messages targeting AA were rejected with `DESTINATION_OFFLINE`, as expected with standalone AA deferred; no AA-dependent task/result/resource-selection flow is claimed.

## Final process ownership and instructions

At report time, only the isolated management Supervisor remained listening: PID `81410`, owned by `parker`, bound `127.0.0.1:3300`, root `/home/parker/nm-verification/naming-migration-v1.1.0/arm-storage`. All five app processes were explicitly stopped via authenticated ARM API. Persistent releases, logs, credentials and isolated state remain in place; nothing was deleted. Current management process was started in this execution session and is not guaranteed to survive session end.

For operator-managed foreground restart, from ARM checkout `/home/parker/Working/Local_localProjects/external-git/base-arm-app`, use Node/npm 22.23.5/10.9.9, read token from the protected file into a non-echoed environment, set `ARM_DEPLOYMENT_ROOT=/home/parker/nm-verification/naming-migration-v1.1.0/arm-storage`, `ARM_MANAGEMENT_PORT=3300`, `ARM_MANAGEMENT_TOKEN` from `secrets/management-token`, `ARM_CHILD_LOGGING=1`, `DOTENV_CONFIG_PATH=/dev/null`, then run `npm run dev:management` in the foreground. Stop with Ctrl-C or SIGTERM only after confirming PID/command identity. Do not use `dev:supervisor`. Existing app releases/configs remain; do not restart AS until its non-loopback bind is resolved.

## Remaining limitations and classification

- **AS implementation/configuration remediation required:** runtime binds wildcard despite the expected isolated loopback exposure. Stop remains in effect.
- **Packaging/configuration remediation required:** EServer configured ports did not match actual child listeners; root cause cannot be classified more narrowly from existing evidence. No source/package edits were made.
- **Configuration correction not attempted:** no undocumented override or source change was introduced.
- Full AA-dependent workflows, application-auth negative test, dedicated task/result/selection persistence, and standalone AA GUI remain unverified and deferred to later authorized work (including NM.4 where applicable).
- Historical RF-20 execution deviation remains accepted as instructed. NM-D05 persistent environment is accepted by operator. No source/test/ARM checkout changes, package regeneration, unrelated deployment modification, commit, or NM.4 execution occurred.
