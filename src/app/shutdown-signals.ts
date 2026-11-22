import type { ApplicationInstance } from './create-app.js';
import type { Diagnostics } from '../observability/diagnostics.js';

type SignalName = 'SIGINT' | 'SIGTERM';
type SignalListener = () => void;
export interface SignalSource {
  on(signal: SignalName, listener: SignalListener): unknown;
  off(signal: SignalName, listener: SignalListener): unknown;
}

export type ShutdownSignalController = {
  setApplication(application: ApplicationInstance): void;
  isStopping(): boolean;
  waitForShutdown(): Promise<void>;
  dispose(): void;
};

/** Entrypoint-only signal wiring. Library/application instances never own process handlers. */
export function installShutdownSignalHandlers(
  signals: SignalSource,
  stop: (application: ApplicationInstance) => Promise<void>,
  exit: (code: number) => void,
  diagnostics: Diagnostics
): ShutdownSignalController {
  let application: ApplicationInstance | undefined;
  let stopping = false;
  let shutdownPromise: Promise<void> | undefined;
  const requestShutdown = () => {
    if (stopping) {
      exit(1);
      return;
    }
    stopping = true;
    if (!application) return;
    shutdownPromise = stop(application).then(() => exit(0), error => {
      diagnostics.error('Application shutdown failed:', error);
      exit(1);
      throw error;
    });
    void shutdownPromise.catch(() => undefined);
  };
  const onInterrupt = () => requestShutdown();
  const onTerminate = () => requestShutdown();
  signals.on('SIGINT', onInterrupt);
  signals.on('SIGTERM', onTerminate);

  return {
    setApplication(value) {
      application = value;
      if (stopping && !shutdownPromise) {
        shutdownPromise = stop(value).then(() => exit(0), error => {
          diagnostics.error('Application shutdown failed:', error);
          exit(1);
          throw error;
        });
        void shutdownPromise.catch(() => undefined);
      }
    },
    isStopping: () => stopping,
    async waitForShutdown() { if (shutdownPromise) await shutdownPromise; },
    dispose() {
      signals.off('SIGINT', onInterrupt);
      signals.off('SIGTERM', onTerminate);
    }
  };
}
