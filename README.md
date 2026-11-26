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

For local environment configuration, export the values in `.env` using your shell or use Node's `--env-file=.env` when launching the compiled app. Default HTTP port is `3000` and default database is `./data/app.db`. Optional `HOST` accepts an IPv4 or IPv6 literal and binds the shared HTTP/Socket.IO listener to that address; unset `HOST` preserves Node's prior unspecified-host behavior. Empty, whitespace-only, non-IP, or padded values are rejected. For standalone loopback-only use, set `HOST=127.0.0.1`.

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
import { HttpMessageClient, SocketMessageClient } from './src/infrastructure/integration-clients/index.js';

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

## AA / Browser / Extension read API

Added the six GET endpoints specified in `api-data.json`. See [HTTP API design](docs/HTTP_API_DESIGN.md) for contracts and limitations. Records are stored locally in SQLite and can be populated via the internal `app.catalog.upsert*` repository methods; no additional public write API or mock records have been introduced.


## Local integration playground

The playground uses AS (:3000), CDC (:3001), EServer (:3002), SPA (:3003), and Electron AA (:3004). AS connects outbound to CDC over Socket.IO Engine.IO path `/ws` in the root namespace `/`. EServer, SPA, and AA connect to AS's `/peers` namespace. AA also calls AS's HTTP health API. These are local demo endpoints, not production deployment instructions.

See [testing/README.md](testing/README.md) for prerequisites and terminals. Start AS with `ENABLE_TEST_PEERS=1 npm run dev`, then start CDC, EServer, SPA, and AA with `npm --prefix testing run cdc`, `eserver`, `spa`, and `aa`. Electron requires a graphical desktop session. Keep this playground on localhost; use API_KEY for shared environments.


## Peer message transformation (new)

The opt-in `/peers` test gateway accepts `peer:message` with `from`, `to`, `kind`, `payload.type` and `payload.data`. AS validates FROM against the authenticated connection, runs optional business transforms selected by FROM/TO/type, then forwards the transformed envelope to TO. Peer receives/logs and acknowledges. This contract is separate from the legacy Phase 2 channels. See [peer message design](docs/PEER_MESSAGE_TRANSFORMATION.md).


### End-to-end demonstration

For a concrete CDC → AS → transformed payload → AA example, run the testing environment and use `POST /demo/send-to-aa` on CDC. [Step-by-step guide](docs/DEMO_CDC_AA.md).


### CDC connection topology

AS initiates a Socket.IO client connection to `CDC_URL` (default `http://127.0.0.1:3001`) using Engine.IO path `CDC_SOCKET_PATH` (default `/ws`) and namespace `/`. CDC is a Socket.IO server and does not connect as a client to AS. Other peers use `/peers`. CDC can still send messages through AS and receive routed messages on the same AS-established socket. See [testing guide](testing/README.md).


### CDC session registration

AS follows the connection protocol from `connect-socket-example.js`: Socket.IO Engine.IO path `/ws`, namespace `/`, `automation_vm:session:connect` on connect, retained session ID on reconnect, and validation of incoming `activity:task:dispatch` by session and VM UDID. See [CDC protocol](docs/CDC_SESSION_PROTOCOL.md). The existing `peer:message` demo remains available after session registration.

The peer feature gate is enabled with `ENABLE_TEST_PEERS=1`. Current backend storage configuration includes `AS_TASK_STORE_DIR` (default `./data/tasks`) and `AS_SELECTION_STORE_DIR` (default `./data/resource-selections`); the CDC connection uses `CDC_URL` (default `http://127.0.0.1:3001`) and `CDC_SOCKET_PATH` (default `/ws`). Values in the environment override documented defaults. Automated integration tests passed in the NM.2.2 checkpoint; actual standalone process and graphical Electron startup remain pending.

### ARM packages

Generate local ARM ZIP packages with `bash scripts/package-for-arm.sh`. The script runs the backend typecheck and build, then writes `as-1.0.0.zip`, `cdc-1.0.0.zip`, `eserver-1-1.0.0.zip`, `eserver-2-1.0.0.zip`, and `spa-1.0.0.zip` under `arm-packages/`. Set `VERSION` to select the package version. To keep output isolated from existing releases, set `ARM_PACKAGE_OUTPUT` to a new empty directory, for example `ARM_PACKAGE_OUTPUT=/tmp/as-arm-packages VERSION=1.0.0 bash scripts/package-for-arm.sh`.

The AS package reads `HOST`, `CDC_URL`, `CDC_SOCKET_PATH`, `AS_TASK_STORE_DIR`, and `AS_SELECTION_STORE_DIR`; the two storage defaults are `./data/tasks` and `./data/resource-selections`, each with a `.r7.5-outbox` subdirectory. SQLite remains controlled by `ENABLE_SQLITE` and `DB_PATH` (default `./data/app.db`). For ARM-managed AS, omit application-config `HOST`; ARM supplies trusted `HOST=127.0.0.1`. Configure `PORT=3000` for AS, `PORT=3001` for CDC, `PORT=3002` and `PORT=3012` for EServer 1/2, and `PORT=3003` for SPA. EServers preserve `PORT`-first source precedence; their ARM templates should not use redundant `ESERVER_PORT`. ARM's `process.port` is assigned metadata, not proof of a bound listener; verify actual addresses and ports from the operating system. The package script does not package AA Electron.

Package generation verifies local artifacts only. Before any fresh ARM installation, an operator must prepare new isolated state directories and update deployment configuration; no existing state is automatically removed or migrated. ARM installation/activation and supervisor cross-repository compatibility remain pending NM.3.3 verification. Do not install or activate these packages as part of NM.3.1.
