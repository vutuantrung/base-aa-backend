import { createServer } from 'node:http';
import express from 'express';
import { connectToPServer, type PServerConnectionConfig } from '../infrastructure/socket/pserver-connector.js';

export type ApplicationConfig = {
  pserver: PServerConnectionConfig;
};

export function createApplication(config: ApplicationConfig) {
  const pserverConnector = connectToPServer(config.pserver);
  const http = express();
  http.use(express.json({ limit: '1mb' }));
  http.get('/health', (_req, res) => {
    res.json({ status: 'ok', pserverReady: pserverConnector.connected, sessionId: pserverConnector.sessionId ?? null });
  });
  http.post('/messages', async (req, res) => {
    if (!pserverConnector.connected) {
      res.status(503).json({ ok: false, error: 'PServer session not ready' });
      return;
    }
    try {
      await pserverConnector.sendMessage(req.body);
      res.json({ ok: true });
    } catch (error) {
      res.status(502).json({ ok: false, error: error instanceof Error ? error.message : 'Delivery failed' });
    }
  });
  const httpServer = createServer(http);

  return {
    httpServer,
    pserverConnector,
    listen: (port: number) => new Promise<number>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, '127.0.0.1', () => {
        httpServer.off('error', reject);
        const address = httpServer.address();
        pserverConnector.connect();
        resolve(address && typeof address === 'object' ? address.port : port);
      });
    }),
    close: async () => {
      pserverConnector.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
      }
    }
  };
}
