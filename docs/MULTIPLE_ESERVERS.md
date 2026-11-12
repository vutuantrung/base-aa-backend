# Multiple EServer instances

AAB allows many Socket.IO clients with `auth.peerId = "eserver"` and unique `auth.instanceId`. `from` and `to` remain logical peer IDs. The AAB gateway stamps authenticated `sourceInstanceId` onto forwarded messages; the sender cannot forge that field.

## Running three instances

Start AAB and AAUI, then run three EServer processes in different terminals:

```sh
ENABLE_TEST_PEERS=1 npm run dev
npm --prefix testing run aaui

ESERVER_INSTANCE_ID=e-1 ESERVER_PORT=3002 npm --prefix testing run eserver
ESERVER_INSTANCE_ID=e-2 ESERVER_PORT=3012 npm --prefix testing run eserver
ESERVER_INSTANCE_ID=e-3 ESERVER_PORT=3022 npm --prefix testing run eserver
```

Each EServer sends an `eserver.scheduled-update` message every 10 seconds to AAUI through AAB. AAUI receives messages containing both `sourceInstanceId` (AAB-stamped) and `payload.data.instanceId` (reported by EServer).

Default configuration is `ESERVER_PORT=3002`, `ESERVER_INSTANCE_ID=eserver-3002`. Set different ports to host multiple Express/Socket.IO servers on one machine. When running on separate hosts, the local HTTP port can be reused, but each instance ID must still be unique within an AAB gateway.

## Reverse routing

When one EServer is connected, `to: "eserver"` works without a specific target, for compatibility.

With more than one EServer connected, reverse routing requires an explicit `toInstanceId`. For example:

```json
{
  "kind": "request",
  "from": "aaui",
  "to": "eserver",
  "toInstanceId": "e-2",
  "payload": {
    "type": "demo.targeted-command",
    "data": { "action": "ping" }
  }
}
```

AAB returns `AMBIGUOUS_DESTINATION` when more than one EServer is connected and `toInstanceId` is missing. Unknown or disconnected target IDs return `DESTINATION_OFFLINE`. Duplicate active IDs are rejected. AAB never silently broadcasts targeted commands or selects a random instance.

## Scope

EServer scheduling remains direct Socket.IO delivery every 10 seconds. No message queue, retries or persistent instance registry. EServer instance connections are kept in memory, and all clients must reconnect after AAB restart. This playground uses the same test-only `/peers` namespace.
