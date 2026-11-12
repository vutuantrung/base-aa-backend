import { createServer } from 'node:http';
import { openDatabase } from '../infrastructure/database/sqlite.js';
import { SqliteSessionRepository } from '../modules/session/session.js';
import { SqliteProcessUsageRepository } from '../modules/process-usage/process-usage.js';
import { SendMessage } from '../modules/messaging/messaging.js';
import { MessageBus } from '../shared/transport/message-bus.js';
import { createHttpApp } from '../infrastructure/http/http-server.js';
import { attachSocketServer } from '../infrastructure/socket/socket-server.js';

export function createApplication(config: { dbPath: string; corsOrigin: string; apiKey?: string }) {
  const db = openDatabase(config.dbPath);
  const bus = new MessageBus();
  const sender = new SendMessage(bus);
  const sessions = new SqliteSessionRepository(db);
  const usage = new SqliteProcessUsageRepository(db);
  const httpServer = createServer(createHttpApp({ sessions, usage, sender, apiKey: config.apiKey }));
  const sockets = attachSocketServer(httpServer, { sender, bus, corsOrigin: config.corsOrigin, apiKey: config.apiKey });
  return {
    httpServer, bus, sender, sessions, usage,
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
