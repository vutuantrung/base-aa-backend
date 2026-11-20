import type { ApplicationInstance } from './create-app.js';
import type { ResolvedConfiguration } from '../config/configuration.js';
import { createApplication } from './create-app.js';
import { registerPServerToAauiDemo } from '../examples/pserver-to-aaui.js';
import { consoleDiagnostics, type Diagnostics } from '../observability/diagnostics.js';

export async function startApplication(configuration: ResolvedConfiguration, diagnostics: Diagnostics = consoleDiagnostics): Promise<ApplicationInstance> {
  const application = createApplication(configuration.application);
  if (configuration.enableTestPeers) registerPServerToAauiDemo(application.transformations);
  const port = await application.listen(configuration.port);
  diagnostics.info(`Server listening on http://localhost:${port}`);
  return application;
}

export async function stopApplication(application: Pick<ApplicationInstance, 'close'>, diagnostics: Diagnostics = consoleDiagnostics): Promise<void> {
  try {
    await application.close();
  } catch (error) {
    diagnostics.error('Application shutdown failed:', error);
    throw error;
  }
}
