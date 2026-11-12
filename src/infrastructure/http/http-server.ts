import { createAaCatalogRouter } from './aa-catalog-router.js';
import type { AaCatalogRepository } from '../../modules/aa-catalog/contracts.js';
import express, { type ErrorRequestHandler, type Express } from 'express';
import { z } from 'zod';
import type { SessionRepository } from '../../modules/session/session.js';
import type { ProcessUsageRepository } from '../../modules/process-usage/process-usage.js';
import type { SendMessage } from '../../modules/messaging/messaging.js';
import { CHANNELS } from '../../shared/contracts/message.js';

const sessionBody = z.object({ name: z.string().trim().min(1).max(200) });
const usageBody = z.object({ pid: z.number().int().positive(), cpu: z.number().finite().nonnegative(), memory: z.number().int().nonnegative() });
const messageBody = z.object({ channel: z.enum(CHANNELS), event: z.string().min(1).max(100), payload: z.unknown(), correlationId: z.string().max(200).optional() });

export function createHttpApp(deps: { sessions: SessionRepository; usage: ProcessUsageRepository; catalog: AaCatalogRepository; sender: SendMessage; apiKey?: string }): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/api', (req, res, next) => {
    if (deps.apiKey && req.header('x-api-key') !== deps.apiKey) { res.status(401).json({ error: 'unauthorized' }); return; }
    next();
  });
  app.use('/api', createAaCatalogRouter(deps.catalog));
  app.get('/api/sessions', (_req, res) => { res.json(deps.sessions.list()); });
  app.get('/api/sessions/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: 'invalid id' }); return; }
    const session = deps.sessions.get(id);
    if (!session) { res.status(404).json({ error: 'not found' }); return; }
    res.json(session);
  });
  app.post('/api/sessions', (req, res) => {
    const parsed = sessionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    res.status(201).json(deps.sessions.create(parsed.data.name));
  });
  app.get('/api/process-usage', (req, res) => {
    const pid = req.query.pid === undefined ? undefined : Number(req.query.pid);
    if (pid !== undefined && (!Number.isSafeInteger(pid) || pid <= 0)) { res.status(400).json({ error: 'invalid pid' }); return; }
    res.json(deps.usage.list(pid));
  });
  app.post('/api/process-usage', (req, res) => {
    const parsed = usageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    res.status(201).json(deps.usage.create(parsed.data));
  });
  app.post('/api/messages', async (req, res, next) => {
    const parsed = messageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    try { res.status(202).json(await deps.sender.execute(parsed.data)); } catch (error) { next(error); }
  });
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error('HTTP handler failure:', err);
    res.status(500).json({ error: 'internal server error' });
  };
  app.use(errorHandler);
  return app;
}
