import type { ApplicationInstance } from './create-app.js';
import type { ResolvedConfiguration } from '../config/configuration.js';
import { createApplication } from './create-app.js';
import { registerCdcToAaDemo } from '../examples/cdc-to-aa.js';
import { consoleDiagnostics, type Diagnostics } from '../observability/diagnostics.js';

export async function startApplication(configuration: ResolvedConfiguration, diagnostics: Diagnostics = consoleDiagnostics,
  onCreated?: (application: ApplicationInstance) => void): Promise<ApplicationInstance> {
  const application = createApplication(configuration.application);
  onCreated?.(application);
  if (configuration.enableTestPeers) registerCdcToAaDemo(application.transformations);
  try {
    const port = await application.listen(configuration.port, configuration.host);
    diagnostics.info(`Server listening on http://localhost:${port}`);
    return application;
  } catch (error) {
    diagnostics.error('Application startup failed:', error);
    throw error;
  }
}

export async function stopApplication(application: Pick<ApplicationInstance, 'close'>, diagnostics: Diagnostics = consoleDiagnostics): Promise<void> {
  try {
    await application.close();
  } catch (error) {
    diagnostics.error('Application shutdown failed:', error);
    throw error;
  }
}
