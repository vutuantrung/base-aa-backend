import { createServer } from 'node:http';
import { openDatabase } from '../infrastructure/database/sqlite.js';
import { SqliteSessionRepository } from '../modules/session/session.js';
import { SqliteProcessUsageRepository } from '../modules/process-usage/process-usage.js';
import { SendMessage } from '../modules/messaging/messaging.js';
import { MessageRouter } from '../modules/messaging/message-router.js';
import { RouteRegistry, defaultRoutes, type RouteRule } from '../modules/messaging/route-registry.js';
import { createHttpApp } from '../infrastructure/http/http-server.js';
import { HttpOutboundAdapter, type WebhookEndpoint } from '../infrastructure/http/http-outbound-adapter.js';
import { attachSocketServer } from '../infrastructure/socket/socket-server.js';
import { SocketOutboundAdapter } from '../infrastructure/socket/socket-outbound-adapter.js';

export type ApplicationConfig = {
  dbPath: string;
  corsOrigin: string;
  apiKey?: string;
  routes?: readonly RouteRule[];
  webhooks?: Readonly<Record<string, WebhookEndpoint>>;
};

export function createApplication(config: ApplicationConfig) {
  const db = openDatabase(config.dbPath);
  const routes = new RouteRegistry(config.routes ?? defaultRoutes());
  // HTTP server needs sender, and sender needs outbound socket hub: a narrow late-binding closure
  // resolves the composition cycle without leaking transport details to application use cases.
  let router: MessageRouter;
  const sender = new SendMessage({ publish: message => router.publish(message) });
  const sessions = new SqliteSessionRepository(db);
  const usage = new SqliteProcessUsageRepository(db);
  const httpServer = createServer(createHttpApp({ sessions, usage, sender, apiKey: config.apiKey }));
  const sockets = attachSocketServer(httpServer, { sender, corsOrigin: config.corsOrigin, apiKey: config.apiKey });
  router = new MessageRouter(routes, [
    new SocketOutboundAdapter(sockets),
    new HttpOutboundAdapter(config.webhooks ?? {})
  ]);
  return {
    httpServer, router, routes, sender, sessions, usage,
    listen: (port: number) => new Promise<number>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, () => { httpServer.off('error', reject); const address = httpServer.address(); resolve(typeof address === 'object' && address ? address.port : port); });
    }),
    close: async () => {
      await sockets.close();
      if (httpServer.listening) await new Promise<void>((resolve, reject) => httpServer.close(err => err ? reject(err) : resolve()));
      db.close();
    }
  };
}
