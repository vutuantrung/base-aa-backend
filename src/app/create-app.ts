import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { connectToPServer } from '../infrastructure/socket/pserver-connector.js';
import type { PServerConnectionConfig } from '../modules/pserver/contracts.js';
import { TransformationRegistry } from '../modules/peer-messaging/transformation-registry.js';
import { SqliteAaCatalogRepository } from '../modules/aa-catalog/sqlite-catalog.js';
import { openPersistence } from '../infrastructure/database/persistence.js';
import { SqliteSessionRepository } from '../modules/session/session.js';
import { SqliteProcessUsageRepository } from '../modules/process-usage/process-usage.js';
import { SendMessage } from '../modules/messaging/messaging.js';
import { MessageRouter } from '../modules/messaging/message-router.js';
import { RouteRegistry, defaultRoutes, type RouteRule } from '../modules/messaging/route-registry.js';
import { createHttpApp } from '../infrastructure/http/http-server.js';
import { HttpOutboundAdapter, type WebhookEndpoint } from '../infrastructure/http/http-outbound-adapter.js';
import { attachSocketServer } from '../infrastructure/socket/socket-server.js';
import { SocketOutboundAdapter } from '../infrastructure/socket/socket-outbound-adapter.js';
import type { Server as HttpServer } from 'node:http';
import type { ReliabilityRunnerPolicy } from '../shared/persistence/reliable-outbox-runner.js';
import { ApplicationCoordinator, MonotonicDeadline } from './application-coordinator.js';

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;
export const MAX_SHUTDOWN_TIMEOUT_MS = 120_000;

export type ApplicationInstance = {
  httpServer: HttpServer; router: MessageRouter; routes: RouteRegistry; transformations: TransformationRegistry;
  sender: SendMessage; sessions: SqliteSessionRepository | undefined; usage: SqliteProcessUsageRepository | undefined;
  catalog: SqliteAaCatalogRepository | undefined; pserverConnector: ReturnType<typeof connectToPServer> | undefined;
  listen: (port: number) => Promise<number>; close: () => Promise<void>;
};

export type ApplicationConfig = {
  dbPath: string;
  corsOrigin: string;
  apiKey?: string;
  enableSqlite?: boolean;
  enableTestPeers?: boolean;
  /** Total monotonic shutdown budget in milliseconds; default 15000, maximum 120000. */
  shutdownTimeoutMs?: number;
  /** Optional outbound Socket.IO connection using the PServer /ws session protocol. */
  pserver?: Omit<PServerConnectionConfig, 'apiKey'>;
  routes?: readonly RouteRule[];
  webhooks?: Readonly<Record<string, WebhookEndpoint>>;
  /** Optional, bounded outbox scan/retry policy; defaults to the approved R7.5 profile. */
  reliabilityPolicy?: ReliabilityRunnerPolicy;
};

type LifecycleState = 'created' | 'starting' | 'running' | 'draining' | 'stopping' | 'stopped' | 'failed';

export class ApplicationShutdownTimeoutError extends Error {
  constructor(readonly timeoutMs: number, readonly active: Readonly<Record<string, number>>) {
    super(`Application shutdown exceeded ${timeoutMs} ms`);
    this.name = 'ApplicationShutdownTimeoutError';
  }
}

export function createApplication(config: ApplicationConfig & { enableSqlite?: true }): ApplicationInstance & { sessions: SqliteSessionRepository; usage: SqliteProcessUsageRepository; catalog: SqliteAaCatalogRepository };
export function createApplication(config: ApplicationConfig & { enableSqlite: false }): ApplicationInstance;
export function createApplication(config: ApplicationConfig): ApplicationInstance;
export function createApplication(config: ApplicationConfig): ApplicationInstance {
  const shutdownTimeoutMs = config.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  validateShutdownTimeout(shutdownTimeoutMs);
  const sqliteEnabled = config.enableSqlite ?? true;
  const coordinator = new ApplicationCoordinator();
  const persistence = openPersistence(config.dbPath, sqliteEnabled);
  let cleanupPromise: Promise<void> | undefined;
  let acquiredSockets: ReturnType<typeof attachSocketServer> | undefined;
  let acquiredPServer: ReturnType<typeof connectToPServer> | undefined;

  try {
    const db = persistence.database;
    const routes = new RouteRegistry(config.routes ?? defaultRoutes());
    const transformations = new TransformationRegistry();
    const httpOutbound = new HttpOutboundAdapter(config.webhooks ?? {});
    let router: MessageRouter;
    const sender = new SendMessage({ publish: message => router.publish(message) });
    const sessions = db ? new SqliteSessionRepository(db) : undefined;
    const usage = db ? new SqliteProcessUsageRepository(db) : undefined;
    const catalog = db ? new SqliteAaCatalogRepository(db) : undefined;
    const httpServer = createServer(createHttpApp({ sessions, usage, catalog, sqliteEnabled, sender,
      apiKey: config.apiKey, admission: coordinator }));
    const sockets = attachSocketServer(httpServer, {
      sender, corsOrigin: config.corsOrigin, apiKey: config.apiKey,
      enableTestPeers: config.enableTestPeers, transformations,
      reliabilityPolicy: config.reliabilityPolicy, admission: coordinator
    });
    acquiredSockets = sockets;
    const pserverConnector = sockets.peerGateway && config.pserver
      ? connectToPServer({ ...config.pserver, apiKey: config.apiKey }, sockets.peerGateway)
      : undefined;
    acquiredPServer = pserverConnector;
    router = new MessageRouter(routes, [new SocketOutboundAdapter(sockets), httpOutbound], coordinator);

    let lifecycleState: LifecycleState = 'created';
    let requestedPort: number | undefined;
    let boundPort: number | undefined;
    let startupPromise: Promise<number> | undefined;
    let closePromise: Promise<void> | undefined;

    const app: ApplicationInstance = {
      httpServer, router, routes, transformations, sender, sessions, usage, catalog, pserverConnector,
      listen(port: number): Promise<number> {
        if (!Number.isInteger(port) || port < 0 || port > 65535)
          return Promise.reject(new RangeError('Port must be an integer from 0 to 65535'));
        if (lifecycleState === 'starting') {
          if (requestedPort !== port) return Promise.reject(new Error('Application is starting on a different port'));
          return startupPromise!;
        }
        if (lifecycleState === 'running') {
          if (requestedPort !== port) return Promise.reject(new Error('Application is already running on a different port'));
          return Promise.resolve(boundPort!);
        }
        if (lifecycleState !== 'created') return Promise.reject(new Error(`Application cannot listen while ${lifecycleState}`));
        requestedPort = port;
        lifecycleState = 'starting';
        startupPromise = startApplicationResources(port, httpServer, sockets.peerGateway, pserverConnector,
          () => lifecycleState === 'starting', () => coordinator.setReady(), actualPort => {
            boundPort = actualPort;
            lifecycleState = 'running';
            coordinator.setReady();
          });
        startupPromise = startupPromise.catch(async error => {
          if (lifecycleState === 'starting') lifecycleState = 'failed';
          coordinator.beginDrain();
          try { await cleanupResources(); }
          catch (cleanupError) { throw combineLifecycleErrors(error, [cleanupError], 'Application startup and rollback failed'); }
          throw error;
        });
        return startupPromise;
      },
      close(): Promise<void> {
        if (closePromise) return closePromise;
        if (lifecycleState === 'failed') return cleanupPromise ?? Promise.resolve();
        if (lifecycleState === 'stopped') return Promise.resolve();
        lifecycleState = 'draining';
        coordinator.beginDrain();
        sockets.peerGateway?.beginDrain();
        const deadline = new MonotonicDeadline(shutdownTimeoutMs, () => performance.now());
        let shutdownTimedOut = false;
        const collectWorkCounts = () => ({ ...coordinator.counts(),
          taskRunnerPending: sockets.peerGateway?.workCounts().task.pending ?? 0,
          taskRunnerActive: sockets.peerGateway?.workCounts().task.active ?? 0,
          taskRunnerExecuting: sockets.peerGateway?.workCounts().task.executing ?? 0,
          taskRunnerSlotWaiters: sockets.peerGateway?.workCounts().task.slotWaiters ?? 0,
          selectionRunnerPending: sockets.peerGateway?.workCounts().selection.pending ?? 0,
          selectionRunnerActive: sockets.peerGateway?.workCounts().selection.active ?? 0,
          selectionRunnerExecuting: sockets.peerGateway?.workCounts().selection.executing ?? 0,
          selectionRunnerSlotWaiters: sockets.peerGateway?.workCounts().selection.slotWaiters ?? 0 });
        console.info('[AAB] LIFECYCLE DRAIN STARTED', JSON.stringify({ ready: false, timeoutMs: shutdownTimeoutMs, work: collectWorkCounts() }));
        closePromise = closeBeforeDeadline(shutdownTimeoutMs, deadline, collectWorkCounts, async () => {
          if (startupPromise) await startupPromise.catch(() => undefined);
          if (sockets.peerGateway) await sockets.peerGateway.waitForIdle();
          await coordinator.waitForIdle();
          if (!shutdownTimedOut) lifecycleState = 'stopping';
          await cleanupResources();
          if (!shutdownTimedOut) {
            lifecycleState = 'stopped';
            console.info('[AAB] LIFECYCLE CLEANUP COMPLETE', JSON.stringify({ state: lifecycleState, ready: false, work: collectWorkCounts() }));
          }
        }, () => { shutdownTimedOut = true; }).catch(error => {
          lifecycleState = 'failed';
          console.error('[AAB] LIFECYCLE SHUTDOWN FAILED', JSON.stringify({ state: lifecycleState,
            ready: coordinator.ready, preserveWriterLocks: true, work: collectWorkCounts(),
            error: error instanceof Error ? error.message : 'unknown' }));
          throw error;
        });
        return closePromise;
      }
    };

    async function cleanupResources(): Promise<void> {
      if (cleanupPromise) return cleanupPromise;
      cleanupPromise = (async () => {
        const errors: unknown[] = [];
        try { pserverConnector?.close(); } catch (error) { errors.push(error); }
        try { await sockets.peerGateway?.close(); } catch (error) { errors.push(error); }
        try { await sockets.close(); } catch (error) { errors.push(error); }
        if (httpServer.listening) {
          try { await closeHttpServer(httpServer); } catch (error) { errors.push(error); }
        }
        try { persistence.close(); } catch (error) { errors.push(error); }
        if (errors.length) throw new AggregateError(errors, 'Application resource cleanup failed');
      })();
      return cleanupPromise;
    }

    return app;
  } catch (error) {
    try { acquiredPServer?.close(); } catch (cleanupError) {
      console.error('[AAB] CONSTRUCTION CLEANUP FAILED', cleanupError instanceof Error ? cleanupError.message : 'unknown');
    }
    if (acquiredSockets) {
      void acquiredSockets.close().catch(cleanupError => {
        console.error('[AAB] ASYNC CONSTRUCTION CLEANUP FAILED', cleanupError instanceof Error ? cleanupError.message : 'unknown');
      });
    }
    try { persistence.close(); } catch (cleanupError) {
      throw combineLifecycleErrors(error, [cleanupError], 'Application construction and cleanup failed');
    }
    throw error;
  }
}

function validateShutdownTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_SHUTDOWN_TIMEOUT_MS)
    throw new RangeError(`Shutdown timeout must be an integer from 1 to ${MAX_SHUTDOWN_TIMEOUT_MS} milliseconds`);
}

async function startApplicationResources(
  port: number, httpServer: HttpServer, peerGateway: ReturnType<typeof attachSocketServer>['peerGateway'],
  pserverConnector: ReturnType<typeof connectToPServer> | undefined,
  isStarting: () => boolean, markReady: () => void, markRunning: (port: number) => void
): Promise<number> {
  await peerGateway?.start(true);
  if (!isStarting()) throw new Error('Application startup was interrupted by shutdown');
  const actualPort = await listenHttpServer(httpServer, port);
  if (!isStarting()) throw new Error('Application startup was interrupted by shutdown');
  markReady();
  await peerGateway?.activate();
  if (!isStarting()) throw new Error('Application startup was interrupted by shutdown');
  pserverConnector?.connect();
  markRunning(actualPort);
  return actualPort;
}

function listenHttpServer(server: HttpServer, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port);
  });
}

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function closeBeforeDeadline(timeoutMs: number, deadline: MonotonicDeadline, collectWorkCounts: () => Readonly<Record<string, number>>,
  operation: () => Promise<void>, onTimeout: () => void): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const remaining = deadline.remainingMs();
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new ApplicationShutdownTimeoutError(timeoutMs, collectWorkCounts()));
    }, remaining);
  });
  try { await Promise.race([operation(), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}

function combineLifecycleErrors(primary: unknown, cleanupErrors: readonly unknown[], message: string): AggregateError {
  return new AggregateError([primary, ...cleanupErrors], message, { cause: primary });
}
