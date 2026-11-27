# Five-server integration playground

This is a local integration environment, not a production deployment. AS is the routing and transformation hub. **The direction of the Socket.IO connection is different for CDC.**

| Application | Port | Socket.IO relationship |
|---|---:|---|
| AS | 3000 | **Client** connecting outward to CDC :3001 (path /ws, namespace /), server for EServer/SPA/AA (/peers) |
| CDC | 3001 | Express + Socket.IO **server** for AS connection (path /ws, namespace /); never connects to AS itself |
| EServer | 3002 | Express + Socket.IO server + client connecting to AS (/peers) |
| SPA | 3003 | Express + Socket.IO server + client connecting to AS (/peers) |
| AA | 3004 | Electron + HTTP + Socket.IO client connecting to AS (/peers) |

## Start (five terminals)

```sh
npm install
npm install --prefix testing
```

Terminal 1 (CDC first is convenient, but AS reconnects if it starts first):
```sh
npm --prefix testing run cdc
```

Terminal 2 (AS):
```sh
ENABLE_TEST_PEERS=1 npm run dev
```

Terminals 3–5:
```sh
npm --prefix testing run eserver
npm --prefix testing run spa
npm --prefix testing run aa
```

PowerShell: `$env:ENABLE_TEST_PEERS = '1'` before `npm run dev`. Electron needs a graphical desktop session. Peer authentication identities are AS `as`, CDC `cdc`, EServer `eserver`, SPA `spa`, and AA `aa`; CDC is the only peer outside AS's `/peers` namespace because AS initiates its root-namespace connection to CDC.

AS may be configured with `CDC_URL` and `CDC_SOCKET_PATH` (Engine.IO path, default `/ws`); the standalone consumers use `AS_URL` (default `http://127.0.0.1:3000`). Durable task and selection paths are controlled by `AS_TASK_STORE_DIR` and `AS_SELECTION_STORE_DIR`. Environment overrides are opt-in; no existing runtime state is deleted automatically.

NM.2.2 automated integration and Electron unit tests passed. Actual separate-process playground startup and graphical Electron startup remain pending. ARM package names/application IDs and deployment instructions are pending NM.3; this local guide does not claim migrated ARM packages.

The AS client connects to `CDC_URL` (default `http://127.0.0.1:3001`) using Socket.IO `path: '/ws'` and namespace `/`. The connection is bidirectional: CDC may send `peer:message` over the accepted socket, and AS may deliver `peer:message` to CDC on that same connection. The gateway checks the `from` property against the authenticated CDC transport. AS authenticates to CDC as `peerId=as`, using `API_KEY` when provided. On each connection AS emits `automation_vm:session:connect`; after the server acknowledges a session, the peer messaging transport is ready. AS listens for `activity:task:dispatch` and validates `session_id` / `vm_udid` against the registered session. Other peers authenticate as before.

## HTTP test endpoints

- CDC: `GET http://127.0.0.1:3001/health`, `POST /messages`, `POST /demo/send-to-aa`, `POST /demo/dispatch-task`
- EServer / SPA: `GET /health`, `POST /messages`
- AA: `GET /health`, `POST /messages`
- AS: `GET http://127.0.0.1:3000/health`

Health endpoint on CDC exposes `asConnected`. CDC no longer runs a Socket.IO client; it waits for AS to connect.

## Demo CDC -> AS -> AA

```sh
curl -X POST http://127.0.0.1:3001/demo/send-to-aa \
  -H 'content-type: application/json' \
  -d '{"originalParam":"hello"}'
```

CDC emits `peer:message` to the connected AS client. AS adds `payload.data.modifiedParam = "AS modified: hello"`, sends the transformed envelope to AA, and awaits its receipt acknowledgment. Logs appear at each server and inside Electron.

## Demo AA -> AS -> CDC (reverse message path)

```sh
curl -X POST http://127.0.0.1:3004/messages \
  -H 'content-type: application/json' \
  -d '{"kind":"event","from":"aa","to":"cdc","payload":{"type":"demo.reply","data":{"ok":true}}}'
```

AS forwards the message to the CDC socket that AS itself opened. There is no separate CDC client connection.

## Session protocol example

Start AS with `VM_UDID=vm-001 VM_SDK=33 VM_MODEL=Pixel VM_ABI=arm64-v8a VM_FOR_SEARCH=false VM_PLATFORMS=facebook,instagram ENABLE_TEST_PEERS=1 npm run dev`. AS sends the VM information to CDC on its initial connection, and `session_id` on reconnection. The test CDC generates a session ID and acknowledges it.

To simulate the source file's task dispatch, call:

```sh
curl -X POST http://127.0.0.1:3001/demo/dispatch-task \
  -H 'content-type: application/json' \
  -d '{"taskId":"task-1"}'
```

CDC fills `session_id` and `vm_udid` with the registered values and emits `activity:task:dispatch`. AS logs `ACTIVITY_TASK VALIDATED`. Mismatching values are logged and ignored, and the event is **not** forwarded automatically.

## Scope and security

No new database feature, Message Queue, external Processing Server or business message routes. CDC's test server binds to `127.0.0.1` by default, and shared environments should configure `API_KEY` for both sides. Do not expose testing endpoints publicly. Acknowledgment signals socket receipt, not business completion.

## EServer scheduled message -> AA (every 10 seconds)

When EServer starts, it schedules one `peer:message` to AA every `SCHEDULE_CALL_TIME = 10_000` milliseconds. Each message goes **EServer -> AS -> AA**, where AA receives and logs the event as usual.

- Source: `testing/eserver.mjs`
- Event: `peer:message`
- `from`: `eserver`, `to`: `aa`
- `payload.type`: `eserver.scheduled-update`
- `payload.data`: `sequence`, `sentAt`, `message`
- First send occurs after 10 seconds, not immediately.
- If disconnected from AS, a tick is skipped. If AA is disconnected, AS returns a negative ACK. No retry/queue is added.
- If a previous ACK is still pending, the next scheduled tick is skipped (no overlap).
- The scheduler stops on SIGINT/SIGTERM.

Run AS, EServer and AA:

```sh
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run eserver
npm --prefix testing run aa
```

Verify logs in EServer, AS and AA terminals. To run focused scheduler tests:

```sh
npm --prefix testing run test:scheduler
```


## Multiple EServer instances

AS now supports multiple concurrent EServer connections identified by `auth.instanceId`. Each sends a 10-second scheduled update to AA. EServer options: `ESERVER_INSTANCE_ID` and `ESERVER_PORT`. To address one EServer, specify `toInstanceId` in the message. See [multiple EServer guide](../docs/MULTIPLE_ESERVERS.md).


## EServer VM information -> AS -> AA (every 20 seconds)

Each connected EServer instance starts **two independent schedules**:

| Schedule | Interval | Payload type |
|---|---:|---|
| Existing status event | `SCHEDULE_CALL_TIME = 10_000` ms | `eserver.scheduled-update` |
| New VM information | `SEND_VM_INFO_TIME = 20_000` ms | `eserver.vm-info` |

The timers start when the EServer Socket.IO client connects to AS, are cancelled on disconnect, and restart on reconnection. The first VM info event is sent 20 seconds after connection. Both use the existing `peer:message` event and receive AS acknowledgment. Disconnected ticks are not queued or retried.

The VM info message uses the existing peer envelope with **`payload.data` as an array**:

```json
{
  "kind": "event",
  "from": "eserver",
  "to": "aa",
  "payload": {
    "type": "eserver.vm-info",
    "version": "1.0",
    "data": [
      {
        "id": "e-1-vm-1",
        "browserId": "e-1-browser-1",
        "version": "1.0.0",
        "supportingPlatforms": [
          {
            "platform": "facebook",
            "supportingFeatures": ["Automation 1", "Parser"],
            "parserInfo": {
              "version": "1.0.0",
              "type": ["Post", "Comment"]
            }
          },
          {
            "platform": "youtube",
            "supportingFeatures": ["Login Cookie"],
            "parserInfo": {
              "version": "1.0.0",
              "type": ["Profile"]
            }
          }
        ]
      }
    ]
  }
}
```

The above is an illustrative example. At runtime, EServer mocks **two VM objects** per send, each with **two or three distinct platforms**. Supported values are limited to:

- `platform`: `facebook`, `tiktok`, `threads`, `youtube`.
- `supportingFeatures`: `Automation 1`, `Automation 2`, `Automation 3`, `Parser`, `Login Cookie`, `Other`.
- `parserInfo.type`: `Post`, `Comment`, `Follower`, `Following`, `Profile`.

The VM IDs, browser IDs, and versions are mock strings, not real browser or VM data. EServer instances have separate mock IDs derived from their `instanceId`. AS forwards `payload.data` unchanged and stamps `sourceInstanceId` on the envelope, allowing AA to identify which EServer sent each VM list. No queue, persistence, or business transform is added.

Start two instances for demonstration:

```sh
ESERVER_INSTANCE_ID=e-1 ESERVER_PORT=3002 npm --prefix testing run eserver
ESERVER_INSTANCE_ID=e-2 ESERVER_PORT=3012 npm --prefix testing run eserver
```

Run tests:

```sh
npm --prefix testing run test:vm-info
npm --prefix testing run test:playground
npm test
```


## AA telemetry dashboard

The Electron AA window now uses a structured responsive dashboard rather than a raw log-only screen.

- **Overview:** four metrics (observed EServer instances, current VMs, 10s status message count, 20s VM info count), last-arrival indicators, arrival charts, and per-instance health cards.
- **VM Inventory:** the latest `eserver.vm-info` array per EServer instance; search by VM ID, browser ID, platform, feature or parser type. Cards group supported platforms, supporting features and parser capabilities.
- **Event Activity:** the latest 200 messages and connection events, expandable JSON, filtering by event category and EServer instance.
- **Connection:** AS Socket.IO status in the sidebar, with a manual HTTP health check.
- **Instance selector:** filter all three views by authenticated `sourceInstanceId`.

AA counts *messages it actually receives* and shows "Waiting" before the first delivery. "Active stream" and "Receiving" mean that recent messages have arrived, **not** that AS has published a complete registry of connected EServer sockets. Stale status is based on the expected 10s/20s stream cadence. Latest VM info replaces the previous VM snapshot for that instance; historical logs remain bounded at 200 records.

Launch:

```sh
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run aa
ESERVER_INSTANCE_ID=e-1 ESERVER_PORT=3002 npm --prefix testing run eserver
ESERVER_INSTANCE_ID=e-2 ESERVER_PORT=3012 npm --prefix testing run eserver
```

Tests:

```sh
npm --prefix testing run test:aa
npm --prefix testing run test:playground
```

Implementation is vanilla HTML/CSS/JS in `testing/aa/`; no additional frontend framework, message queue, database integration or modified Socket.IO message contract is required.


## EServer presence (Socket.IO connection state) and per-instance logs

The AS `/peers` gateway now publishes **transport presence** independently of message activity:

- On a successful EServer connection, it emits `peer:status` with `peerId: "eserver"`, `instanceId`, `status: "online"`, `socketId` and `timestamp`.
- On that socket's disconnection, it emits `peer:status` with `status: "offline"` and the Socket.IO `reason`. An old socket cannot remove a replacement connection from the registry.
- When AA connects or reconnects, AS immediately sends `peer:status:snapshot` containing **all currently connected EServer instances**. No 10s/20s business message is required to discover a connection.
- Presence events are sent only to the connected AA socket; this does not change the `peer:message` contract or the EServer scheduled messages.

AA now shows an **Online EServers** count (from presence rather than observed messages) and online/offline/unknown badges in Overview. The 10s Status and 20s VM Info stream freshness indicators remain separate. When AA itself cannot reach AS, all instance connection states are displayed as **Unknown**, not as Offline. The last VM inventory is preserved while the EServer is offline, as a last-known snapshot.

The new **Instance Logs** page shows a separate real-time event history for each EServer instance, including connection changes, 10s status messages and 20s VM-info payloads. These are *events observed at AA*, not the EServer process's stdout/stderr. Up to 10 most recent records are retained per instance in UI memory; the global **Event Activity** retains 200 records. Use the existing instance selector to filter both pages. You can expand a log row to inspect its payload. Logs remain visible after an EServer disconnects.

The presence lifecycle is in-memory and not persisted. Socket.IO unexpected network failure detection depends on its heartbeat timeout, so offline notification may not be instantaneous. After AS restarts, AA reconnects and receives a fresh snapshot.

Tests:

```sh
npm test
npm --prefix testing run test:aa
```

To observe an offline event, launch AS, AA and at least two EServers, then stop one EServer process with Ctrl+C. Only that instance should switch to Offline and receive a disconnect log. Restart it with the same `ESERVER_INSTANCE_ID` to see Online again.


## CDC task roundtrip — curl → AS → AA → AS → CDC

Start CDC, AS and AA (the EServers are not required for this demo):

```sh
npm --prefix testing run cdc
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run aa
```

Trigger a new mock task using curl:

```sh
curl -X POST http://127.0.0.1:3001/demo/tasks \
  -H 'Content-Type: application/json' \
  -d '{"config":"mock automation configuration"}'
```

CDC responds HTTP **202 Accepted** with the task in `inProgress` state. This indicates **delivery to AA**, not completion of processing. To inspect completion:

```sh
curl http://127.0.0.1:3001/demo/tasks
curl http://127.0.0.1:3001/demo/tasks/task-<uuid>
```

Each task follows this exact data shape (embedded in `peer:message.payload.data`):

```json
{
  "id": "task-681bac01-6e86-47d8-b4eb-b6cd0e3c3d11",
  "status": "inProgress",
  "config": "mock automation configuration",
  "createdTime": 1794500000000,
  "updatedTime": 1794500000000
}
```

Events and lifecycle:

1. `POST /demo/tasks` creates a unique task with `status: "inProgress"`. CDC logs and stores it in memory.
2. CDC sends a `peer:message` with `payload.type: "automation.task.request"`, `from: "cdc"`, `to: "aa"` through its existing Socket.IO connection initiated by AS.
3. (Historical behavior, removed) AA previously acknowledged receipt and displayed a 5-second progress bar.
4. (Historical behavior, removed) AA previously auto-completed tasks after 5 seconds. It now only observes lifecycle events.
5. CDC validates the returned task against the original (ID, config, createdTime, and status transition), logs `TASK FINISHED RECEIVED FROM AA`, and updates its in-memory task record. AA shows `Result delivered to CDC` after receiving the delivery acknowledgment.

AA's **Task Processing** page stores the most recent 50 tasks. This is independent of the 10-log-per-EServer limit and existing scheduled streams. CDC keeps the most recent 100 tasks, in memory only.

If the AA process quits while a task is running, its timer is cancelled. If a connection goes offline during result delivery, AA shows a delivery error; **no automatic retry or persistence** is added in the playground.

Tests:

```sh
npm --prefix testing run test:aa
npm test
```

The task flow uses the existing message router, without changing the CDC `/ws` session protocol, the EServer 10s/20s streams, or the AA connection-presence implementation.


## Task receipt flow — CDC → AS → EServer (AA observes)

This flow supersedes the earlier CDC → AS → AA task execution demo. **The `received` ACK means AS has accepted and saved the task, not that EServer has received it.** AA is an observer. EServer now only acknowledges task receipt; automatic task completion after 5 seconds has been removed.

When CDC sends a `automation.task.request` to AS, the receipt sequence is:

1. AS validates the task shape (`id`, `status: "inProgress"`, `config`, `createdTime`, `updatedTime`) and the peer envelope.
2. AS persists the task in `data/tasks/<task-id>.json` (or `AS_TASK_STORE_DIR`), using exclusive creation to prevent overwrites.
3. AS publishes `task:lifecycle` with `status: "received"` to AA. The UI shows **Received** immediately, without a progress bar.
4. AS returns `{ok: true, status: "received", data: ...}` as the Socket.IO ACK to CDC, so the curl endpoint responds HTTP **202 Accepted**.

**EServer forwarding is separate and asynchronous.** AS attempts `peer:message` forwarding to the requested `toInstanceId` (or the sole connected EServer if unambiguous). After receiving the EServer ACK, AS publishes `task.forwarded`. If it cannot select or reach EServer, or EServer rejects the message, it publishes `task.forwardFailed` with a reason. AA keeps the task status **received** and displays the forwarding outcome separately. Failed forwarding does not undo the receipt ACK or delete the stored file. There is currently no queue/retry scheduler; failed tasks require explicit operator recovery.

EServer no longer sends `automation.task.result` automatically. Tasks remain `received` on AA until EServer explicitly sends a result with `status: "finished"` through AS to CDC. That explicit result is stored at `data/tasks/<task-id>.result.json`, forwarded to CDC, and published as `task.finished` to AA after CDC accepts it.

To run the demonstration (separate terminals):

```sh
npm --prefix testing run cdc
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run aa
ESERVER_INSTANCE_ID=e-1 ESERVER_PORT=3002 npm --prefix testing run eserver
ESERVER_INSTANCE_ID=e-2 ESERVER_PORT=3012 npm --prefix testing run eserver
```

Trigger with the **exact task body** and choose EServer using the query parameter:

```sh
curl -X POST "http://127.0.0.1:3001/demo/tasks?toInstanceId=e-1" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "task-demo-001",
    "status": "inProgress",
    "config": "test-config",
    "createdTime": 19126349235123,
    "updatedTime": 19126349235223
  }'
```

The earlier config-only shorthand is also supported. Timestamp values must be safe nonnegative integers with `updatedTime >= createdTime` (the reversed example timestamp ordering would otherwise be invalid).

The resulting task payload keeps the original business shape; `toInstanceId` is a routing parameter in the request wrapper, **not** part of the task data:

```json
{
  "id": "task-681bac01-6e86-47d8-b4eb-b6cd0e3c3d11",
  "status": "inProgress",
  "config": "test-config",
  "createdTime": 1794500000000,
  "updatedTime": 1794500000000
}
```

Inspect `data/tasks/` on AS and the Task Monitoring screen on AA. CDC's terminal logs the later `finished` result. Keep in mind AA lifecycle notifications are in-memory and are not replayed if AA disconnects.

Tests:

```sh
npm test
npm --prefix testing run test:aa
```

The EServer 10s/20s scheduled streams and the 10-log-per-instance AA limit are unchanged.


### Task Monitoring recovery on AA reconnect

AS persists accepted tasks as JSON files. When AA connects or reconnects, AS sends a `task:lifecycle:snapshot` event containing up to 50 most-recent persisted tasks, including finished result snapshots when present. This is independent of the live `task:lifecycle` stream. AA merges the snapshot without overwriting newer live events. Task Monitoring no longer depends on AA already being online at the moment CDC sends the request.

To verify the complete flow:

```sh
# Check CDC's actual HTTP response (should be 202 and status received)
curl -i -X POST "http://127.0.0.1:3001/demo/tasks?toInstanceId=e-1" \
  -H "Content-Type: application/json" \
  -d '{"config":"test as receipt snapshot"}'

# Confirm CDC -> AS Socket.IO session:
curl http://127.0.0.1:3001/health

# Confirm AA -> AS Socket.IO connection:
curl http://127.0.0.1:3004/health
```

Open AA **Task Monitoring**. The task list is restored automatically on AA connect/reconnect. Use **Refresh Tasks** to request an on-demand snapshot from AS without restarting Electron. The AS task data is stored in `./data/tasks/` relative to AS's working directory unless `AS_TASK_STORE_DIR` is configured. Each task ID must be unique because files are created exclusively. If `curl` returns 400, verify the task JSON; if 422, check the CDC response and AS file persistence logs; if 503, check the CDC↔AS connection.

The previous implementation delivered `task:lifecycle` events only when AA happened to be connected and therefore could leave Task Monitoring empty after late connection or reconnect. This recovery behavior fixes that limitation. The snapshot is a recent-history view, not a durable delivery queue or replay of every monitoring event.


### Removed: automatic 5-second task completion

EServer mock task reception is acknowledgment-only. There is no task completion timer or automatic `finished` message. AS does not change task status after 5 seconds. The original task remains persisted, the AA displays `received` (with separate forwarding feedback), and CDC has no finished result unless EServer later explicitly sends one. Socket.IO ping timeouts and EServer status/VM telemetry schedules (10s and 20s) are unrelated and remain enabled.


## F03 migration — SPA → AS → AA (10 seconds)

**Current implementation:** F03 `spa.scheduled-update` is produced by SPA, not EServer. The original trigger mechanism is unchanged: the first event is sent 10 seconds after the SPA Socket.IO connection, the timer is stopped on disconnect, restarted after reconnect, and skips ticks during disconnection or while a previous ACK is pending. Failed sends are not queued or retried. Each event uses the existing `peer:message` route and `to: "aa"`. Its mock `payload.data` retains `instanceId`, `sequence`, `sentAt` and `message`; `instanceId` is `"spa"` rather than an EServer identity.

```text
F03: SPA --spa.scheduled-update (every 10s)--> AS --> AA
F04: EServer --eserver.vm-info (every 20s)-----------> AS --> AA
```

SPA starts on port 3003 with `npm --prefix testing run spa`. EServer remains on port 3002 with `npm --prefix testing run eserver`. AA's global Status Update metrics/chart now show SPA updates only, while EServer instance cards, per-instance 10-entry logs and VM Inventory remain EServer-only. The EServer filter does not filter SPA metrics, because F03 is system-wide.

Run these three peers with AS, then open **AA → System Overview** to observe the status chart after the first 10-second tick. **Event Activity → Status updates** shows the SPA message. F04 requires EServer and still starts after 20 seconds.

Verification:

```sh
npm --prefix testing run test:scheduler
npm --prefix testing run test:aa
npm test
```

Earlier sections of this README describe the historical F03 EServer origin; this section supersedes those descriptions. No changes were made to CDC task flows or the SPA/EServer Socket.IO connection topology.


## F09 — EServer → AS → CDC (mirror of F08)

The reverse path is now symmetrical to F08: **a successful `received` ACK confirms only that AS accepted and persisted the task result**. CDC delivery runs separately and does not delay the EServer ACK.

```text
EServer --automation.task.result (status=finished)--> AS
   ^                                         |
   | ACK {ok:true,status:"received"}        | 1. Validate against saved F08 task
   |                                         | 2. Save task-<id>.result.json
   |                                         | 3. Notify AA: result received
   |                                         +---- Async forward to CDC
   |                                                   |
   |                             CDC ACK success / error
   |                                                   |
   +------------------- AA: result forwarded / forwardFailed
```

On receipt AS validates `id`, `status: "finished"`, `config`, `createdTime` and `updatedTime`, and checks that the result matches the original F08 request in `data/tasks/task-<id>.json`. It saves the result exclusively as `data/tasks/task-<id>.result.json` before returning `{ok: true, status: "received", data: ...}` to EServer. Invalid, unknown or duplicate result files return a negative ACK and are not forwarded.

AS broadcasts `task:result:lifecycle` to AA with three stages:
- `task.result.received`: result persisted at AS; CDC delivery **not** confirmed
- `task.result.forwarded`: CDC acknowledged the forwarded result
- `task.result.forwardFailed`: offline CDC, negative ACK or delivery error; result remains persisted at AS

The AA **Task Monitoring** view displays this separate F09 result delivery state and does not confuse an AS receipt with CDC acknowledgment. Reconnect snapshots can restore a stored `finished` result, but do not claim CDC delivery unless a live `forwarded` event was observed. No auto-retry or 5-second timer is introduced.

### Manually trigger F09 (no automatic task completion)

Start CDC, AS, EServer and AA. First create an F08 task (do not reuse an existing task ID):

```sh
curl -X POST "http://127.0.0.1:3001/demo/tasks?toInstanceId=e-1" \
  -H "Content-Type: application/json" \
  -d '{"config":"f09-reverse-flow-demo"}'
```

Take the generated `task.id` from CDC's response, confirm EServer received it:

```sh
curl http://127.0.0.1:3002/demo/tasks
```

Then explicitly complete that task on EServer (replace `<task-id>` with the full `task-...` value):

```sh
curl -X POST "http://127.0.0.1:3002/demo/tasks/<task-id>/finish"
```

EServer returns HTTP `202` with `status: "received"` after AS saves the result, **not** after CDC delivery. Later, CDC logs `TASK FINISHED RECEIVED FROM ESERVER`, AA shows F09 forwarding success, and AS retains both original `.json` and `.result.json` files. The raw `POST /messages` endpoint remains available for submitting a complete `automation.task.result` message manually.

Run:

```sh
npm --prefix testing run test:aa
npm test
```

F03 SPA scheduled status, F04 EServer VM telemetry, F08 CDC receipt and EServer acknowledgment, and the 10-entry per-EServer AA log limit remain unchanged.


## AA Resource Selection → AS → CDC

The **Resource Selection** page in Electron AA provides three independent single-choice record groups, backed by mock data in `testing/shared/resource-selection.cjs`:

- **Browser Profile:** `{ id, browserVersion, browserUserAgent }`
- **Proxy:** `{ id, http, https }`
- **Platform Account:** `{ accountId, platform }`, with `facebook`, `tiktok`, `threads`, `youtube`

Select **exactly one record from each group**. The Submit button remains disabled until all three are selected and is disabled while a request is pending. Only the following IDs are transmitted; neither proxy URLs nor browser user agents are sent:

```json
{
  "browserProfileId": "browser-profile-001",
  "proxyId": "proxy-002",
  "accountId": "account-tk-001"
}
```

AA emits `peer:message` via its existing Socket.IO connection to AS with `kind: "request"`, `from: "aa"`, `to: "cdc"`, and `payload.type: "demo.resource-selection"`. AS forwards the message through its existing CDC connector. The test CDC validates that all three IDs refer to known mock records, logs `[cdc] RESOURCE SELECTION RECEIVED` with the payload, and ACKs `{ok:true}`. AA displays delivery success or error and logs the outcome in Event Activity. No separate business request handler is added to AS.

Run:

```sh
npm --prefix testing run cdc
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run aa
```

Open AA → **Resource Selection**, choose one record in each column, review the three selected IDs and press **Submit to CDC**. Confirm receipt in the CDC console. The catalogs are demo-only, not backed by a database or a real browser/proxy service. The CDC currently logs accepted selections in memory/process output; it does not persist them.

Tests:

```sh
npm --prefix testing run test:aa
npm test
```


### Persisted Resource Selection history

Each click of **Submit to CDC** creates a unique durable record under AS's default
`./data/resource-selections/` directory (configurable with `AS_SELECTION_STORE_DIR`).
The receipt file `<uuid>.json` contains `id`, `createdTime`, and **only** the
selected `browserProfileId`, `proxyId`, `accountId`. The corresponding
`<uuid>.delivery.json` holds the forwarding outcome.

The new contract mirrors the existing durable task-receipt design: AS validates and
saves before ACKing `{ok:true,status:"received"}` to AA. AS then attempts CDC
delivery asynchronously. The separate `resource-selection:updated` event reports
`pending`, `forwarded` or `forwardFailed`; a CDC outage does not erase the
saved selection or undo the receipt ACK. There is no automatic retry yet.

The Resource Selection page shows a **Saved Selections** list below the Submit panel,
including selected IDs, time and delivery status. AS serves the latest 50 file-backed
records through `resource-selection:snapshot` on AA connect/reconnect, or on demand
via the **Refresh List** button (`resource-selection:refresh`). Existing resource
catalogs and CDC message payload are unchanged. This history is durable across AA
restarts as long as AS's data directory is preserved. No browser user agents or proxy
URLs are persisted in these submissions.

Run `npm test` to check routing and disk persistence, and
`npm --prefix testing run test:aa` for the UI selection contract tests.
