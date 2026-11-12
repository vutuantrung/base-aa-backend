# Working example: PServer -> AAB -> modifiedParam -> AAUI

This example is enabled ONLY when `ENABLE_TEST_PEERS=1`. AAB registers an exact transformer for `from=pserver`, `to=aaui`, and `payload.type=demo.modified-param`. Other messages are not transformed by this example.

## Run

From repository root:

```sh
npm install
npm install --prefix testing
ENABLE_TEST_PEERS=1 npm run dev
```

In separate terminals:

```sh
npm --prefix testing run pserver
npm --prefix testing run aaui
```

Electron needs a desktop graphical session.

## Send

From another terminal:

```sh
curl -X POST http://127.0.0.1:3001/demo/send-to-aaui \
  -H 'content-type: application/json' \
  -d '{"originalParam":"hello"}'
```

The PServer Express endpoint constructs the normal peer envelope and emits `peer:message` to AAB over Socket.IO:

```json
{
  "version": "1.0",
  "kind": "event",
  "from": "pserver",
  "to": "aaui",
  "channel": "worker",
  "event": "message",
  "payload": {
    "type": "demo.modified-param",
    "version": "1.0",
    "data": { "originalParam": "hello" }
  }
}
```

AAB verifies the peer identity and destination connection, then runs `registerPServerToAauiDemo`. The transformer returns:

```json
{
  "type": "demo.modified-param",
  "version": "1.0",
  "data": {
    "originalParam": "hello",
    "modifiedParam": "AAB modified: hello"
  }
}
```

The gateway adds `id`, `timestamp`, and `processing` metadata, retaining `from` and `to`. AAUI logs the entire transformed message in its Electron window and terminal, acknowledges receipt, and PServer's HTTP endpoint responds with the processed envelope.

**Expected processing metadata:**

```json
{
  "transformed": true,
  "processedBy": ["demo-pserver-to-aaui-modified-param"]
}
```

The `timestamp` field is generated at runtime.

This demonstration uses no new database feature or message queue. It does not introduce a separate Processing Server or any retry behavior. When AAUI is disconnected, AAB returns `DESTINATION_OFFLINE`.
