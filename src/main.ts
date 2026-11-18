import { createApplication } from './app/create-app.js';
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

const app = createApplication({
  pserver: {
    url: process.env.PSERVER_URL ?? 'http://127.0.0.1:3001',
    path: process.env.PSERVER_SOCKET_PATH ?? '/ws',
    apiKey: process.env.API_KEY,
    vmInfo
  }
});
const listeningPort = await app.listen(port);
console.log(`AAB listening on http://127.0.0.1:${listeningPort}`);

let stopping = false;
function shutdown(): void {
  if (stopping) return;
  stopping = true;
  void app.close().then(() => process.exit(0), error => {
    console.error(error);
    process.exit(1);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
