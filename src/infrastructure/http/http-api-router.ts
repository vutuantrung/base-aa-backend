import { Router } from 'express';
import { z } from 'zod';
import { createAaCatalogRouter } from './aa-catalog-router.js';
import type { AaCatalogRepository } from '../../modules/aa-catalog/contracts.js';
import type { SessionRepository } from '../../modules/session/contracts.js';
import type { ProcessUsageRepository } from '../../modules/process-usage/contracts.js';
import type { MessageEnvelope, NewMessage } from '../../shared/contracts/message.js';
import type { ApplicationAdmission } from '../../shared/contracts/application-admission.js';
import { runAdmittedHttpOperation } from './http-middleware.js';

export interface HttpMessageSender {
  execute(message: NewMessage): Promise<MessageEnvelope>;
}

export interface HttpApiCapabilities {
  sessions?: SessionRepository;
  usage?: ProcessUsageRepository;
  catalog?: AaCatalogRepository;
  sender: HttpMessageSender;
  admission?: ApplicationAdmission;
}

const sessionBody = z.object({ name: z.string().trim().min(1).max(200) });
const usageBody = z.object({ pid: z.number().int().positive(), cpu: z.number().finite().nonnegative(), memory: z.number().int().nonnegative() });
const messageBody = z.object({ channel: z.enum(['session', 'worker']), event: z.string().min(1).max(100), payload: z.unknown(), correlationId: z.string().max(200).optional() });

/** Registers the existing API routes and keeps validation at the HTTP boundary. */
export function createHttpApiRouter(deps: HttpApiCapabilities): Router {
  const router = Router();
  if (deps.catalog) router.use(createAaCatalogRouter(deps.catalog, deps.admission));
  router.get('/sessions', async (_req, res, next) => {
    await runAdmittedHttpOperation(deps.admission, res, next, () => res.json(deps.sessions?.list()));
  });
  router.get('/sessions/:id', async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) { res.status(400).json({ error: 'invalid id' }); return; }
    await runAdmittedHttpOperation(deps.admission, res, next, () => {
      const session = deps.sessions?.get(id);
      if (!session) { res.status(404).json({ error: 'not found' }); return; }
      res.json(session);
    });
  });
  router.post('/sessions', async (req, res, next) => {
    const parsed = sessionBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    await runAdmittedHttpOperation(deps.admission, res, next, () => res.status(201).json(deps.sessions?.create(parsed.data.name)));
  });
  router.get('/process-usage', async (req, res, next) => {
    const pid = req.query.pid === undefined ? undefined : Number(req.query.pid);
    if (pid !== undefined && (!Number.isSafeInteger(pid) || pid <= 0)) { res.status(400).json({ error: 'invalid pid' }); return; }
    await runAdmittedHttpOperation(deps.admission, res, next, () => res.json(deps.usage?.list(pid)));
  });
  router.post('/process-usage', async (req, res, next) => {
    const parsed = usageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    await runAdmittedHttpOperation(deps.admission, res, next, () => res.status(201).json(deps.usage?.create(parsed.data)));
  });
  router.post('/messages', async (req, res, next) => {
    const parsed = messageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    await runAdmittedHttpOperation(deps.admission, res, next, async () => res.status(202).json(await deps.sender.execute(parsed.data)));
  });
  return router;
}
