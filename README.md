# AAB – PServer connector playground

Isolated branch from main at 82b6cb68e2016594d42731c2ae022ce43b638557. Only AAB–PServer communication is retained. No multi-namespace implementation yet.

## Run (Node.js 22+)

```sh
npm install
npm run pserver
# separate terminal
npm run dev
```

The mock PServer listens at 127.0.0.1:3001. AAB listens locally at 127.0.0.1:3000 and connects as a Socket.IO client to the default namespace / using Engine.IO path /ws. No ENABLE_TEST_PEERS flag is needed. Environment variables are read from the process; .env.example is reference only.

## Try

```sh
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3001/health
curl -X POST http://127.0.0.1:3000/messages -H 'Content-Type: application/json' -d '{"hello":"PServer"}'
curl -X POST http://127.0.0.1:3001/messages -H 'Content-Type: application/json' -d '{"hello":"AAB"}'
curl -X POST http://127.0.0.1:3001/demo/dispatch-task -H 'Content-Type: application/json' -d '{"task_id":"demo"}'
```

The /messages endpoints are local diagnostic triggers. The peer:message event is a direct test extension, no longer a peer-routing envelope or cross-peer workflow. Receipt is logged and acknowledged; no business execution or persistence. The existing session handshake and task session/VM validation are retained. Session state is in memory, and rejected session resume has no automatic fallback.

## Files

- src/main.ts: configuration and lifecycle.
- src/app/create-app.ts: application composition, local HTTP diagnostics, connector lifecycle.
- src/infrastructure/socket/pserver-connector.ts: Socket.IO client, session registration, task validation, direct messages.
- testing/pserver.mjs: mock PServer.
- tests/pserver-session.test.ts and tests/support/mock-pserver.ts: session protocol tests.
- AGENTS.md: code-generation rules.

Removed AAUI, EServer, SServer, peer routing, transformations, task and selection persistence, SQLite/catalog, and general channel/webhook routing. Main is not modified.

```sh
npm run typecheck
npm test
npm run build
npm start
```
