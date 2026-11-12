# Phase 2 — Message Routing & Forwarding

## Architecture

```text
HTTP POST /api/messages -----> SendMessage -----> MessageRouter -----> RouteRegistry
Socket.IO /session /worker --/                         |
                                                     |    one envelope ID
                                           +---------+----------+
                                           |                    |
                                 SocketOutboundAdapter   HttpOutboundAdapter
                                           |                    |
                                   Socket.IO namespaces   trusted webhook IDs
```

The **Messaging business boundary** owns `SendMessage`, `MessageRouter`, and `RouteRegistry`. Infrastructure owns Socket.IO, Express, and outbound HTTP delivery. No business use case knows about Socket.IO, Express or fetch.

### Explicit route rules

```ts
{
  id: 'worker-to-session',
  source: 'worker',
  event: 'usage',
  destinations: [
    { transport: 'socket', channel: 'worker' },
    { transport: 'socket', channel: 'session' },
    { transport: 'http', endpointId: 'collector' }
  ]
}
```

- Default rules deliver incoming session events to the session namespace; worker events to the worker namespace.
- Routes can be added with `app.routes.register(rule)`, listed with `app.routes.list()`, or removed with `app.routes.unregister(id)`.
- Route IDs must be unique; event matching is exact or `*`; matching destinations are deduplicated.
- If custom `routes` are passed to `createApplication`, they replace defaults. Use `[...defaultRoutes(), ...customRules]` to extend.
- Route changes are in-memory, not persisted. Only trusted application code should modify them.
- No route matches: publish returns an envelope but no targets receive it.

### HTTP webhook targets

The reverse Socket.IO -> HTTP direction uses a **server-initiated POST to a configured webhook endpoint**, not a response pushed into a past HTTP request.

```ts
createApplication({
  dbPath: './data/app.db', corsOrigin: '*',
  webhooks: { collector: { url: 'http://127.0.0.1:4000/events', apiKey: 'private-key' } },
  routes: [...defaultRoutes(), {
    id: 'usage-to-collector',
    source: 'worker', event: 'usage',
    destinations: [{ transport: 'http', endpointId: 'collector' }]
  }]
});
```

The webhook receives the full JSON envelope by POST, with `x-message-id` and optional `x-api-key`. Only server-configured endpoint IDs can be targeted; clients cannot supply arbitrary URLs. Outbound requests have a 5-second timeout and redirects are rejected.

**Security:** Webhook endpoints must be trusted and configured by operators. For deployments accepting untrusted configuration, additionally restrict hostnames/IP ranges to avoid SSRF, use HTTPS, and do not expose configuration over public APIs.

### Semantics and limits

- One ingress creates exactly one message ID and timestamp, reused across transports.
- Outbound delivery **never republishes** into the routing pipeline: no forwarding loops.
- Socket.IO broadcasts to all clients in the destination namespace, including sender when applicable.
- Request success means all configured adapter calls completed successfully, not that every remote socket consumer processed an event.
- HTTP outbound deliveries are immediate and best-effort. Failed delivery results in an error; previous destinations may already have received a message.
- Phase 5 should introduce durable outbox + retry + delivery receipts and idempotent receivers.
- Routes and webhook configuration should be secured before runtime management APIs are introduced.
- All Phase 1 endpoints, inbound payloads and socket namespace contracts remain unchanged.

## Validation

```sh
npm install
npm run typecheck
npm run build
npm test
```
