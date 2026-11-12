# base-aa-backend

Extendable **TypeScript + Express + Socket.IO + SQLite** backend using business-boundary-first modular monolith architecture.

## Getting started

Requires Node.js 22+ and build tooling for native `better-sqlite3`.

```bash
npm install
cp .env.example .env  # reference only: environment variables are not auto-loaded
npm run dev
npm run build
npm test
```

For local environment configuration, export the values in `.env` using your shell or use Node's `--env-file=.env` when launching the compiled app. Default HTTP port is `3000` and default database is `./data/app.db`.

## Business boundaries

- **Session** (`src/modules/session`): `Session(id, name)` repository abstraction and SQLite implementation.
- **Process Usage** (`src/modules/process-usage`): `ProcessUsage(id, pid, cpu, memory)` repository abstraction and SQLite implementation.
- **Messaging** (`src/modules/messaging`): `SendMessage` use case using only transport-agnostic `MessagePublisher`.
- **Infrastructure** (`src/infrastructure`): Express/Socket.IO adapters and database bootstrap.
- **Shared contracts** (`src/shared`): message envelopes, channels, publisher/consumer interfaces, and connectable HTTP/Socket clients.

Composition root is `src/app/create-app.ts`. Keep business code independent of transport and database libraries as features grow. SQLite is an embedded local database, **not a separate DB server**.

## Endpoints

| Method | URL | Description |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Find session |
| POST | `/api/sessions` | `{ "name": "demo" }` |
| GET | `/api/process-usage?pid=123` | List process usage, optional PID filter |
| POST | `/api/process-usage` | `{ "pid": 123, "cpu": 12.5, "memory": 1024 }` |
| POST | `/api/messages` | `{ "channel": "session", "event": "updated", "payload": {} }` |

Socket.IO namespaces are `/session` and `/worker`. Send and receive the `message` event. The inbound socket message is `{ event, payload, correlationId? }`, while the outbound event is `{ id, channel, event, payload, timestamp, correlationId? }`.

**HTTP to Socket:** POST `/api/messages` validates and publishes to a local bus, which broadcasts to all clients of the specified namespace.

**Socket to Socket:** emitting `message` on a namespace publishes to the same bus and broadcasts to all clients in that namespace, including the sender. Client receives an optional acknowledgment `{ok, data}`.

**Socket to HTTP clients:** HTTP is request/response, not a push channel. Connected HTTP clients can *send* using `HttpMessageClient`; reverse real-time delivery to an HTTP-only client requires polling, SSE or a webhook, not an ordinary pending HTTP response. Add an outbound `HttpWebhookAdapter` later if remote HTTP notifications are required.

### Connectable interface

```ts
import { HttpMessageClient, SocketMessageClient } from './src/shared/transport/connectable-client.js';

const http = new HttpMessageClient('http://localhost:3000');
const socket = new SocketMessageClient('http://localhost:3000');
await http.send({ channel: 'worker', event: 'started', payload: { pid: 123 } });
await socket.send({ channel: 'session', event: 'created', payload: { name: 'x' } });
await socket.close();
```

## Design and safety notes

- The envelope is created once by the bus to prevent transport-forwarding loops. Only **inbound** requests publish; Socket.IO outbound events do not automatically republish.
- Validation applies to HTTP requests and incoming socket messages. Payloads must be JSON serializable.
- Set `API_KEY` to require `x-api-key` on `/api/*` and `auth.token` on socket connections. Production needs TLS, scoped credentials/authorization and rate limiting.
- Message delivery is in-memory, best-effort and **not persistent**. Future durable delivery can use outbox, queue, or broker without changing publisher consumers.
- Both namespaces use the same local bus but are isolated by channel. There is no automatic message cross-routing between `session` and `worker`; that should be an explicit business use case.
- Add DB migrations before changing the schema after production deployment.

## Phase 2 — Message Routing & Forwarding

The HTTP and Socket.IO ingress adapters now publish through the transport-independent `MessageRouter`. It selects outbound transports from `RouteRegistry` and keeps a single message ID across every destination.

Default routes preserve Phase 1 behavior: messages originating on `session` broadcast on `/session`, and messages originating on `worker` broadcast on `/worker`. Cross-channel forwarding and webhook delivery are **opt-in** through trusted application configuration.

Example for embedding the app with custom routing rules:

```ts
import { createApplication } from './src/app/create-app.js';
import { defaultRoutes } from './src/modules/messaging/route-registry.js';

const app = createApplication({
  dbPath: './data/app.db',
  corsOrigin: 'http://localhost:5173',
  webhooks: {
    collector: { url: 'http://127.0.0.1:4000/events' }
  },
  routes: [
    ...defaultRoutes(),
    {
      id: 'worker-usage-forward',
      source: 'worker',
      event: 'usage',
      destinations: [
        { transport: 'socket', channel: 'session' },
        { transport: 'http', endpointId: 'collector' }
      ]
    }
  ]
});
await app.listen(3000);
```

See [Phase 2 design and test guide](docs/PHASE_2_MESSAGE_ROUTING.md) for routing semantics, failure cases, security and limitations.

**Delivery guarantees:** best-effort only; webhook POST is not the same as delivering a reverse response to an HTTP-only browser client. There is no durable retry, no route persistence and no remote subscriber acknowledgment yet.
