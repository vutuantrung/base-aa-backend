import { resolveConfiguration } from './config/configuration.js';
import { startApplication, stopApplication } from './app/lifecycle.js';
import { consoleDiagnostics } from './observability/diagnostics.js';

const application = await startApplication(resolveConfiguration(process.env), consoleDiagnostics);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  void stopApplication(application, consoleDiagnostics).then(() => process.exit(0), () => process.exit(1));
});
