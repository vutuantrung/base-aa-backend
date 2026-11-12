import { createApplication } from './app/create-app.js';
import { registerPServerToAauiDemo } from './examples/pserver-to-aaui.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
const app = createApplication({ dbPath: process.env.DB_PATH ?? './data/app.db', corsOrigin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:5173', apiKey: process.env.API_KEY, enableTestPeers: process.env.ENABLE_TEST_PEERS === '1', pserverUrl: process.env.ENABLE_TEST_PEERS === '1' ? (process.env.PSERVER_URL ?? 'http://127.0.0.1:3001') : undefined });
if (process.env.ENABLE_TEST_PEERS === '1') registerPServerToAauiDemo(app.transformations);
await app.listen(port);
console.log(`Server listening on http://localhost:${port}`);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  void app.close().then(() => process.exit(0), err => { console.error(err); process.exit(1); });
});
