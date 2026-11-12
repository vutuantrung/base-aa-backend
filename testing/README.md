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
