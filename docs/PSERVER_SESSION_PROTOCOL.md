# PServer Socket.IO Session Protocol

AAB is an outbound Socket.IO client, adapted from the user-provided `connect-socket-example.js`. The testing PServer is the Socket.IO server.

## Connection

- `PSERVER_URL`: defaults to `http://127.0.0.1:3001` (user's file used :3002 for a different server).
- `PSERVER_SOCKET_PATH`: defaults to `/ws`; **this is Engine.IO path, not a namespace**.
- Namespace: `/` (default).
- Transports: `['websocket', 'polling']` and reconnection enabled.
- Optional `API_KEY` is sent in Socket.IO `auth.token` for the test server.
- The client is constructed with `autoConnect: false`; the application starts it on listen and disconnects it during shutdown.

## Session lifecycle

On each Socket.IO `connect` event, AAB emits `automation_vm:session:connect` with a 10-second acknowledgment timeout.

On initial connect, the payload is configured from environment variables:

```json
{
  "udid": "vm-001",
  "sdk": "33",
  "model": "Pixel",
  "abi": "arm64-v8a",
  "forSearch": false,
  "platforms": ["facebook", "instagram"]
}
```

Environment variables: `VM_UDID`, `VM_SDK`, `VM_MODEL`, `VM_ABI`, `VM_FOR_SEARCH`, `VM_PLATFORMS`. For the playground only, `VM_UDID` defaults to `aab-demo-vm`. For production integration, provide a genuine UDID.

A successful ACK must contain `{ "ok": true, "session": { "id": "...", "vm_udid": "..." } }`. AAB stores `session.id` in memory and treats the connection as ready. On reconnection, it sends `{ "session_id": "<previous ID>" }`, matching the sample. Session state is not persisted; a process restart starts a new registration.

A session rejection is logged; no automatic reset or retry with full VM data occurs on a rejected resume. The example source did not define such a fallback.

## Task receiving

AAB listens for `activity:task:dispatch` and validates both:

- `data.session_id === current sessionId`
- `data.vm_udid === configured vmInfo.udid`

Valid tasks are logged as `ACTIVITY_TASK VALIDATED`. Invalid tasks are logged and ignored. **Task execution and routing are not defined**; no forwarding or database write is performed.

## Direct diagnostic messages

The test-only peer:message event is retained for direct AAB–PServer communication. It logs and acknowledges incoming messages after AAB session readiness; no peer gateway, routing, transformation or persistence is involved. Both local HTTP /messages endpoints trigger sends. See README for examples.

Run npm test for session protocol tests.
