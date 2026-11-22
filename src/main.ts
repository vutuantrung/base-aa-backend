import { resolveConfiguration } from './config/configuration.js';
import { startApplication, stopApplication } from './app/lifecycle.js';
import { consoleDiagnostics } from './observability/diagnostics.js';
import { installShutdownSignalHandlers } from './app/shutdown-signals.js';

const signals = installShutdownSignalHandlers(process, application => stopApplication(application, consoleDiagnostics),
  code => process.exit(code), consoleDiagnostics);
try {
  const startup = startApplication(resolveConfiguration(process.env), consoleDiagnostics,
    application => signals.setApplication(application));
  await startup;
  if (signals.isStopping()) await signals.waitForShutdown();
} catch (error) {
  if (signals.isStopping()) await signals.waitForShutdown();
  else {
    consoleDiagnostics.error('Application startup failed:', error);
    process.exitCode = 1;
  }
}
