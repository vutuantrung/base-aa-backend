import { createApplication } from './app/create-app.js';
import { registerPServerToAauiDemo } from './examples/pserver-to-aaui.js';
import type { VmInfo } from './infrastructure/socket/pserver-connector.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
const vmInfo: VmInfo = {
  udid: process.env.VM_UDID ?? 'aab-demo-vm',
  sdk: process.env.VM_SDK ?? '',
  model: process.env.VM_MODEL ?? '',
  abi: process.env.VM_ABI ?? '',
  forSearch: process.env.VM_FOR_SEARCH === 'true',
  platforms: (process.env.VM_PLATFORMS ?? '').split(',').map(value => value.trim()).filter(Boolean)
};
const app = createApplication({ dbPath: process.env.DB_PATH ?? './data/app.db', corsOrigin: process.env.SOCKET_CORS_ORIGIN ?? 'http://localhost:5173', apiKey: process.env.API_KEY, enableTestPeers: process.env.ENABLE_TEST_PEERS === '1', pserver: process.env.ENABLE_TEST_PEERS === '1' ? {
  url: process.env.PSERVER_URL ?? 'http://127.0.0.1:3001',
  path: process.env.PSERVER_SOCKET_PATH ?? '/ws',
  vmInfo
} : undefined });
if (process.env.ENABLE_TEST_PEERS === '1') registerPServerToAauiDemo(app.transformations);
await app.listen(port);
console.log(`Server listening on http://localhost:${port}`);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  void app.close().then(() => process.exit(0), err => { console.error(err); process.exit(1); });
});
