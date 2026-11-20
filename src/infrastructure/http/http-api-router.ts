import { Router } from 'express';
import { z } from 'zod';
import { createAaCatalogRouter } from './aa-catalog-router.js';
import type { AaCatalogRepository } from '../../modules/aa-catalog/contracts.js';
import type { SessionRepository } from '../../modules/session/session.js';
import type { ProcessUsageRepository } from '../../modules/process-usage/process-usage.js';
import type { MessageEnvelope, NewMessage } from '../../shared/contracts/message.js';

export interface HttpMessageSender {
  execute(message: NewMessage): Promise<MessageEnvelope>;
}

export interface HttpApiCapabilities {
  sessions?: SessionRepository;
  usage?: ProcessUsageRepository;
  catalog?: AaCatalogRepository;
  sender: HttpMessageSender;
}

const sessionBody = z.object({ name: z.string().trim().min(1).max(200) });
const usageBody = z.object({ pid: z.number().int().positive(), cpu: z.number().finite().nonnegative(), memory: z.number().int().nonnegative() });
const messageBody = z.object({ channel: z.enum(['session', 'worker']), event: z.string().min(1).max(100), payload: z.unknown(), correlationId: z.string().max(200).optional() });

/** Registers the existing API routes and keeps validation at the HTTP boundary. */
export function createHttpApiRouter(deps: HttpApiCapabilities): Router {
  const router = Router();
  if (deps.catalog) router.use(createAaCatalogRouter(deps.catalog));
  router.get('/sessions', (_req, res) => { res.json(deps.sessions?.list()); });
  router.get('/sessions/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: 'invalid id' }); return; }
    const session = deps.sessions?.get(id);
    if (!session) { res.status(404).json({ error: 'not found' }); return; }
    res.json(session);
  });
  router.post('/sessions', (req, res) => {
    const parsed = sessionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    res.status(201).json(deps.sessions?.create(parsed.data.name));
  });
  router.get('/process-usage', (req, res) => {
    const pid = req.query.pid === undefined ? undefined : Number(req.query.pid);
    if (pid !== undefined && (!Number.isSafeInteger(pid) || pid <= 0)) { res.status(400).json({ error: 'invalid pid' }); return; }
    res.json(deps.usage?.list(pid));
  });
  router.post('/process-usage', (req, res) => {
    const parsed = usageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    res.status(201).json(deps.usage?.create(parsed.data));
  });
  router.post('/messages', async (req, res, next) => {
    const parsed = messageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    try { res.status(202).json(await deps.sender.execute(parsed.data)); } catch (error) { next(error); }
  });
  return router;
}
