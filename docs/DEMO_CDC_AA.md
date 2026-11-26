# Working example: CDC -> AS -> modifiedParam -> AA

This example is enabled ONLY when `ENABLE_TEST_PEERS=1`. AS registers an exact transformer for `from=cdc`, `to=aa`, and `payload.type=demo.modified-param`. Other messages are not transformed by this example.

## Run

From repository root:

```sh
npm install
npm install --prefix testing
ENABLE_TEST_PEERS=1 npm run dev
```

**CDC must expose its Socket.IO server first. AS connects to CDC's Socket.IO path /ws, default namespace (not the reverse).**

In separate terminals:

```sh
npm --prefix testing run cdc
npm --prefix testing run aa
```

Electron needs a desktop graphical session.

## Send

From another terminal:

```sh
curl -X POST http://127.0.0.1:3001/demo/send-to-aa \
  -H 'content-type: application/json' \
  -d '{"originalParam":"hello"}'
```

The CDC Express endpoint constructs the normal peer envelope and emits `peer:message` to **AS's outbound Socket.IO client**, which is connected to CDC's `/ws` Socket.IO path (default namespace):

```json
{
  "version": "1.0",
  "kind": "event",
  "from": "cdc",
  "to": "aa",
  "channel": "worker",
  "event": "message",
  "payload": {
    "type": "demo.modified-param",
    "version": "1.0",
    "data": { "originalParam": "hello" }
  }
}
```

AS verifies the peer identity and destination connection, then runs `registerCdcToAaDemo`. The transformer returns:

```json
{
  "type": "demo.modified-param",
  "version": "1.0",
  "data": {
    "originalParam": "hello",
    "modifiedParam": "AS modified: hello"
  }
}
```

The gateway adds `id`, `timestamp`, and `processing` metadata, retaining `from` and `to`. AA logs the entire transformed message in its Electron window and terminal, acknowledges receipt, and CDC's HTTP endpoint responds with the processed envelope.

**Expected processing metadata:**

```json
{
  "transformed": true,
  "processedBy": ["demo-cdc-to-aa-modified-param"]
}
```

The `timestamp` field is generated at runtime.

This demonstration uses no new database feature or message queue. It does not introduce a separate Processing Server or any retry behavior. When AA is disconnected, AS returns `DESTINATION_OFFLINE`.
