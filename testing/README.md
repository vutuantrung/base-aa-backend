# Five-server integration playground

This is a local integration environment, not a production deployment. AAB is the routing and transformation hub. **The direction of the Socket.IO connection is different for PServer.**

| Application | Port | Socket.IO relationship |
|---|---:|---|
| AAB | 3000 | **Client** connecting outward to PServer :3001 (path /ws, namespace /), server for EServer/SServer/AAUI (/peers) |
| PServer | 3001 | Express + Socket.IO **server** for AAB connection (path /ws, namespace /); never connects to AAB itself |
| EServer | 3002 | Express + Socket.IO server + client connecting to AAB (/peers) |
| SServer | 3003 | Express + Socket.IO server + client connecting to AAB (/peers) |
| AAUI | 3004 | Electron + HTTP + Socket.IO client connecting to AAB (/peers) |

## Start (five terminals)

```sh
npm install
npm install --prefix testing
```

Terminal 1 (PServer first is convenient, but AAB reconnects if it starts first):
```sh
npm --prefix testing run pserver
```

Terminal 2 (AAB):
```sh
ENABLE_TEST_PEERS=1 npm run dev
```

Terminals 3–5:
```sh
npm --prefix testing run eserver
npm --prefix testing run sserver
npm --prefix testing run aaui
```

PowerShell: `$env:ENABLE_TEST_PEERS = '1'` before `npm run dev`. Electron needs a graphical desktop session.

The AAB client connects to `PSERVER_URL` (default `http://127.0.0.1:3001`) using Socket.IO `path: '/ws'` and namespace `/`. The connection is bidirectional: PServer may send `peer:message` over the accepted socket, and AAB may deliver `peer:message` to PServer on that same connection. The gateway checks the `from` property against the authenticated PServer transport. AAB authenticates to PServer as `peerId=aab`, using `API_KEY` when provided. On each connection AAB emits `automation_vm:session:connect`; after the server acknowledges a session, the peer messaging transport is ready. AAB listens for `activity:task:dispatch` and validates `session_id` / `vm_udid` against the registered session. Other peers authenticate as before.

## HTTP test endpoints

- PServer: `GET http://127.0.0.1:3001/health`, `POST /messages`, `POST /demo/send-to-aaui`, `POST /demo/dispatch-task`
- EServer / SServer: `GET /health`, `POST /messages`
- AAUI: `GET /health`, `POST /messages`
- AAB: `GET http://127.0.0.1:3000/health`

Health endpoint on PServer exposes `aabConnected`. PServer no longer runs a Socket.IO client; it waits for AAB to connect.

## Demo PServer -> AAB -> AAUI

```sh
curl -X POST http://127.0.0.1:3001/demo/send-to-aaui \
  -H 'content-type: application/json' \
  -d '{"originalParam":"hello"}'
```

PServer emits `peer:message` to the connected AAB client. AAB adds `payload.data.modifiedParam = "AAB modified: hello"`, sends the transformed envelope to AAUI, and awaits its receipt acknowledgment. Logs appear at each server and inside Electron.

## Demo AAUI -> AAB -> PServer (reverse message path)

```sh
curl -X POST http://127.0.0.1:3004/messages \
  -H 'content-type: application/json' \
  -d '{"kind":"event","from":"aaui","to":"pserver","payload":{"type":"demo.reply","data":{"ok":true}}}'
```

AAB forwards the message to the PServer socket that AAB itself opened. There is no separate PServer client connection.

## Session protocol example\n\nStart AAB with `VM_UDID=vm-001 VM_SDK=33 VM_MODEL=Pixel VM_ABI=arm64-v8a VM_FOR_SEARCH=false VM_PLATFORMS=facebook,instagram ENABLE_TEST_PEERS=1 npm run dev`. AAB sends the VM information to PServer on its initial connection, and `session_id` on reconnection. The test PServer generates a session ID and acknowledges it.\n\nTo simulate the source file's task dispatch, call:\n\n```sh\ncurl -X POST http://127.0.0.1:3001/demo/dispatch-task \\\n  -H 'content-type: application/json' \\\n  -d '{"taskId":"task-1"}'\n```\n\nPServer fills `session_id` and `vm_udid` with the registered values and emits `activity:task:dispatch`. AAB logs `ACTIVITY_TASK VALIDATED`. Mismatching values are logged and ignored, and the event is **not** forwarded automatically.\n\n## Scope and security

No new database feature, Message Queue, external Processing Server or business message routes. PServer's test server binds to `127.0.0.1` by default, and shared environments should configure `API_KEY` for both sides. Do not expose testing endpoints publicly. Acknowledgment signals socket receipt, not business completion.

## EServer scheduled message -> AAUI (every 10 seconds)

When EServer starts, it schedules one `peer:message` to AAUI every `SCHEDULE_CALL_TIME = 10_000` milliseconds. Each message goes **EServer -> AAB -> AAUI**, where AAUI receives and logs the event as usual.

- Source: `testing/eserver.mjs`
- Event: `peer:message`
- `from`: `eserver`, `to`: `aaui`
- `payload.type`: `eserver.scheduled-update`
- `payload.data`: `sequence`, `sentAt`, `message`
- First send occurs after 10 seconds, not immediately.
- If disconnected from AAB, a tick is skipped. If AAUI is disconnected, AAB returns a negative ACK. No retry/queue is added.
- If a previous ACK is still pending, the next scheduled tick is skipped (no overlap).
- The scheduler stops on SIGINT/SIGTERM.

Run AAB, EServer and AAUI:

```sh
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run eserver
npm --prefix testing run aaui
```

Verify logs in EServer, AAB and AAUI terminals. To run focused scheduler tests:

```sh
npm --prefix testing run test:scheduler
```


## Multiple EServer instances

AAB now supports multiple concurrent EServer connections identified by `auth.instanceId`. Each sends a 10-second scheduled update to AAUI. EServer options: `ESERVER_INSTANCE_ID` and `ESERVER_PORT`. To address one EServer, specify `toInstanceId` in the message. See [multiple EServer guide](../docs/MULTIPLE_ESERVERS.md).


## EServer VM information -> AAB -> AAUI (every 20 seconds)

Each connected EServer instance starts **two independent schedules**:

| Schedule | Interval | Payload type |
|---|---:|---|
| Existing status event | `SCHEDULE_CALL_TIME = 10_000` ms | `eserver.scheduled-update` |
| New VM information | `SEND_VM_INFO_TIME = 20_000` ms | `eserver.vm-info` |

The timers start when the EServer Socket.IO client connects to AAB, are cancelled on disconnect, and restart on reconnection. The first VM info event is sent 20 seconds after connection. Both use the existing `peer:message` event and receive AAB acknowledgment. Disconnected ticks are not queued or retried.

The VM info message uses the existing peer envelope with **`payload.data` as an array**:

```json
{
  "kind": "event",
  "from": "eserver",
  "to": "aaui",
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

The VM IDs, browser IDs, and versions are mock strings, not real browser or VM data. EServer instances have separate mock IDs derived from their `instanceId`. AAB forwards `payload.data` unchanged and stamps `sourceInstanceId` on the envelope, allowing AAUI to identify which EServer sent each VM list. No queue, persistence, or business transform is added.

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


## AAUI telemetry dashboard

The Electron AAUI window now uses a structured responsive dashboard rather than a raw log-only screen.

- **Overview:** four metrics (observed EServer instances, current VMs, 10s status message count, 20s VM info count), last-arrival indicators, arrival charts, and per-instance health cards.
- **VM Inventory:** the latest `eserver.vm-info` array per EServer instance; search by VM ID, browser ID, platform, feature or parser type. Cards group supported platforms, supporting features and parser capabilities.
- **Event Activity:** the latest 200 messages and connection events, expandable JSON, filtering by event category and EServer instance.
- **Connection:** AAB Socket.IO status in the sidebar, with a manual HTTP health check.
- **Instance selector:** filter all three views by authenticated `sourceInstanceId`.

AAUI counts *messages it actually receives* and shows "Waiting" before the first delivery. "Active stream" and "Receiving" mean that recent messages have arrived, **not** that AAB has published a complete registry of connected EServer sockets. Stale status is based on the expected 10s/20s stream cadence. Latest VM info replaces the previous VM snapshot for that instance; historical logs remain bounded at 200 records.

Launch:

```sh
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run aaui
ESERVER_INSTANCE_ID=e-1 ESERVER_PORT=3002 npm --prefix testing run eserver
ESERVER_INSTANCE_ID=e-2 ESERVER_PORT=3012 npm --prefix testing run eserver
```

Tests:

```sh
npm --prefix testing run test:aaui
npm --prefix testing run test:playground
```

Implementation is vanilla HTML/CSS/JS in `testing/aaui/`; no additional frontend framework, message queue, database integration or modified Socket.IO message contract is required.


## EServer presence (Socket.IO connection state) and per-instance logs

The AAB `/peers` gateway now publishes **transport presence** independently of message activity:

- On a successful EServer connection, it emits `peer:status` with `peerId: "eserver"`, `instanceId`, `status: "online"`, `socketId` and `timestamp`.
- On that socket's disconnection, it emits `peer:status` with `status: "offline"` and the Socket.IO `reason`. An old socket cannot remove a replacement connection from the registry.
- When AAUI connects or reconnects, AAB immediately sends `peer:status:snapshot` containing **all currently connected EServer instances**. No 10s/20s business message is required to discover a connection.
- Presence events are sent only to the connected AAUI socket; this does not change the `peer:message` contract or the EServer scheduled messages.

AAUI now shows an **Online EServers** count (from presence rather than observed messages) and online/offline/unknown badges in Overview. The 10s Status and 20s VM Info stream freshness indicators remain separate. When AAUI itself cannot reach AAB, all instance connection states are displayed as **Unknown**, not as Offline. The last VM inventory is preserved while the EServer is offline, as a last-known snapshot.

The new **Instance Logs** page shows a separate real-time event history for each EServer instance, including connection changes, 10s status messages and 20s VM-info payloads. These are *events observed at AAUI*, not the EServer process's stdout/stderr. Up to 100 records are retained per instance in UI memory; the global **Event Activity** retains 200 records. Use the existing instance selector to filter both pages. You can expand a log row to inspect its payload. Logs remain visible after an EServer disconnects.

The presence lifecycle is in-memory and not persisted. Socket.IO unexpected network failure detection depends on its heartbeat timeout, so offline notification may not be instantaneous. After AAB restarts, AAUI reconnects and receives a fresh snapshot.

Tests:

```sh
npm test
npm --prefix testing run test:aaui
```

To observe an offline event, launch AAB, AAUI and at least two EServers, then stop one EServer process with Ctrl+C. Only that instance should switch to Offline and receive a disconnect log. Restart it with the same `ESERVER_INSTANCE_ID` to see Online again.
