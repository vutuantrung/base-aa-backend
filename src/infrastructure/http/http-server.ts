import express, { type Express } from 'express';
import type { AaCatalogRepository } from '../../modules/aa-catalog/contracts.js';
import type { SessionRepository } from '../../modules/session/contracts.js';
import type { ProcessUsageRepository } from '../../modules/process-usage/contracts.js';
import { createApiAccessMiddleware, httpErrorHandler } from './http-middleware.js';
import { createHttpApiRouter, type HttpMessageSender } from './http-api-router.js';
import type { ApplicationAdmission } from '../../shared/contracts/application-admission.js';

export interface HttpApplicationDependencies {
  sessions?: SessionRepository;
  usage?: ProcessUsageRepository;
  catalog?: AaCatalogRepository;
  sqliteEnabled?: boolean;
  sender: HttpMessageSender;
  apiKey?: string;
  admission?: ApplicationAdmission;
}

/** Compatibility entrypoint for constructing the inbound HTTP gateway. */
export function createHttpApp(deps: HttpApplicationDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/api', createApiAccessMiddleware(deps.apiKey, deps.sqliteEnabled));
  app.use('/api', createHttpApiRouter(deps));
  app.use(httpErrorHandler);
  return app;
}
