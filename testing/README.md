# Five-server integration playground

These are **testing applications**, not new production business modules. All peers connect outward to AAB over Socket.IO. AAB is the sole hub. No peer-to-peer message forwarding rules have been defined.

| Application | Runtime | HTTP port | Socket.IO |
|---|---|---:|---|
| AAB | TypeScript / Express / Socket.IO | 3000 | Server `/peers` |
| PServer | Node.js / Express / Socket.IO | 3001 | Own local server + outbound client to AAB |
| EServer | Node.js / Express / Socket.IO | 3002 | Own local server + outbound client to AAB |
| SServer | Node.js / Express / Socket.IO | 3003 | Own local server + outbound client to AAB |
| AAUI | Electron / Express / Socket.IO client / HTTP client | 3004 | Outbound client to AAB |

## Run (five terminals)

Install the root AAB dependencies once and the testing dependencies once:

```sh
npm install
cd testing && npm install && cd ..
```

Terminal 1, from repository root:
```sh
ENABLE_TEST_PEERS=1 npm run dev
```

Terminals 2–5, from repository root:
```sh
npm --prefix testing run pserver
npm --prefix testing run eserver
npm --prefix testing run sserver
npm --prefix testing run aaui
```

For PowerShell, set `$env:ENABLE_TEST_PEERS = '1'` before `npm run dev`. Electron requires a desktop session and a graphical display; it is not designed for headless production or CI.

Each peer reports its local health:
```sh
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3002/health
curl http://127.0.0.1:3003/health
curl http://127.0.0.1:3004/health
```

AAB health: `http://127.0.0.1:3000/health`.

## Connection handshake (no routing)

1. Peer connects to `ws-like` Socket.IO namespace `http://127.0.0.1:3000/peers` using `auth.peerId` = `pserver`, `eserver`, `sserver`, or `aaui`.
2. AAB logs the connection and emits `aab:welcome` **only to that peer**.
3. Peer logs received `aab:welcome`, emits `peer:ping` to AAB, and logs the received acknowledgment. AAB logs inbound `peer:ping`.
4. AAB logs disconnections. Peers reconnect automatically when AAB restarts.
5. AAUI additionally requests `GET /health` over HTTP and displays status in Electron.

No business message routing or peer-to-peer broadcasting has been implemented. Avoid treating handshake as an application message protocol.

## Configuration and safety

- `AAB_URL` defaults to `http://127.0.0.1:3000` for peer clients.
- `PEER_HOST` defaults to `127.0.0.1` for P/E/S local HTTP servers.
- `ENABLE_TEST_PEERS=1` enables AAB's `/peers` namespace; it is disabled by default.
- `API_KEY` (if configured on AAB) must match on each peer for connection authorization.
- This is a development playground. Keep it on localhost, do not expose unprotected test listeners to external networks, and do not store credentials in source.
- Existing HTTP APIs, `/session`, `/worker` and Phase 2 routing are unchanged.
- SQLite remains an existing AAB implementation dependency; this playground adds no database feature.


## Message forwarding and transformation

The playground now supports optional FROM -> AAB -> TO messages, with transforms registered at AAB by authenticated FROM + TO + payload.type. Each test server has a localhost-only POST /messages endpoint that sends to AAB over Socket.IO, and receives/logs forwarded peer:message with an ACK. Detailed contract: [docs/PEER_MESSAGE_TRANSFORMATION.md](../docs/PEER_MESSAGE_TRANSFORMATION.md).

Example (start all five peers before sending):

```sh
curl -X POST http://127.0.0.1:3001/messages -H 'content-type: application/json' \\
 -d '{"kind":"request","from":"pserver","to":"eserver","payload":{"type":"demo.enrich","data":{"value":1}}}'
```

No application-specific forwarding flows or transformers are preconfigured. AAB can register business-specific transformers through `app.transformations.register(...)`; unhandled types are forwarded unchanged. This new workflow does not use SQLite.
