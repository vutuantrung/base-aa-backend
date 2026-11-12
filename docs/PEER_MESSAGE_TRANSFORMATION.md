# Peer Message Routing & Transformation

Applies only to opt-in `/peers` namespace, not the existing `/session`, `/worker` or `POST /api/messages` contract.

## Message contract

```json
{
  "version": "1.0",
  "kind": "request",
  "from": "pserver",
  "to": "eserver",
  "channel": "worker",
  "event": "message",
  "correlationId": "req-001",
  "payload": { "type": "demo.enrich", "version": "1.0", "data": { "profileId": "p-1" } }
}
```

AAB validates the message and stamps a UUID and Unix millisecond `timestamp`. If a client supplies `id`, it must be a valid UUID. `from` must match its authenticated Socket.IO peer identity. `to` must identify a connected peer, or `aab`.

Processing sequence:
1. Validate envelope and match FROM against the authenticated connection.
2. Check target connectivity before executing transformers (skip for local `aab`).
3. Resolve transformers from `TransformationRegistry` by FROM, TO, and `payload.type`.
4. Apply transformations sequentially in ascending priority (stable ID tie-break); transformer returns **payload only**.
5. AAB retains the original `id`, `from`, `to`, `kind`, `timestamp`, etc. and adds `processing` metadata.
6. Deliver transformed envelope to TO with `peer:message`; recipient must ACK `{ "ok": true }`.
7. Source receives `{ "ok": true, "data": <transformed envelope> }` only when destination acknowledges receipt.

Message transformations are optional; no matching transformer means payload passes through unchanged. AAB local `to: "aab"` messages are logged and acknowledged without peer forwarding.

## Register a transformer

```ts
app.transformations.register({
  id: 'enrich-browser',
  from: 'pserver', to: 'eserver', payloadType: 'browser.create', priority: 10,
  transformer: {
    transform(message) {
      return {
        ...message.payload,
        data: { ...(message.payload.data as object), browserId: 'browser-123' }
      };
    }
  }
});
```

The example ID is placeholder data. No business-specific transformer is installed by default; real flows will be configured later. `transformations.unregister(id)` removes a rule.

## Sending from P/E/S/AAUI

Each test server provides `POST http://127.0.0.1:300{1,2,3,4}/messages`. PServer emits over the Socket.IO connection initiated by AAB to PServer's `/aab` namespace; EServer, SServer and AAUI connect to AAB's `/peers` namespace. AAB receives a message only from a connected sender. Local HTTP routes are development-only and bound to loopback.

```sh
curl -X POST http://127.0.0.1:3001/messages -H 'content-type: application/json' \
  -d '{"kind":"request","from":"pserver","to":"eserver","payload":{"type":"demo.enrich","data":{"profileId":"p-1"}}}'
```

The above is forwarded unchanged by default. Add the transformer to AAB for payload enrichment.

## Delivery semantics / boundaries

- No peer-to-peer direct connections: all deliveries go through AAB.
- A successful ACK means destination Socket.IO listener received and acknowledged the message; it **does not** mean that any business operation completed.
- Offline destination, bad FROM, schema errors, timeout, transformation failure and rejection result in a negative ACK / 4xx or 502 from local test HTTP ingress.
- Only the test peer gateway uses this format. Phase 1–2 legacy routes continue unchanged.
- Security: test peers are intended for loopback. Set `API_KEY` on AAB and all peers. Do not expose the local test HTTP ingress publicly.
- No durable queue, no retries, no persistent service/route registry, no process-wide exactly-once guarantees, and no SQL changes.


## PServer reverse connection

For PServer, AAB is the Socket.IO client (`PSERVER_URL`, default `http://127.0.0.1:3001/aab`) and PServer is the Socket.IO server. Ingress messages from this authenticated connection are processed as `from=pserver`; messages addressed to `to=pserver` are delivered back over the same connection. PServer cannot connect inbound to AAB's `/peers`. The connection direction is independent of message direction.
