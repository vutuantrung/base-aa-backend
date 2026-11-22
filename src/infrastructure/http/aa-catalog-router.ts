import { Router } from 'express';
import type { AaCatalogRepository } from '../../modules/aa-catalog/contracts.js';
import type { ApplicationAdmission } from '../../shared/contracts/application-admission.js';
import { runAdmittedHttpOperation } from './http-middleware.js';

/** Read-only HTTP contract sourced from api-data.json; no invented mutation endpoints. */
export function createAaCatalogRouter(repository: AaCatalogRepository, admission?: ApplicationAdmission): Router {
  const router = Router();

  router.get('/aa', async (_req, res, next) => {
    await runAdmittedHttpOperation(admission, res, next, () => {
    const value = repository.currentAa();
    if (!value) { res.status(404).json({ error: 'aa_not_found' }); return; }
    res.json(value);
    });
  });
  // Static route must come before /browser/:id
  router.get('/browser/all', async (_req, res, next) => { await runAdmittedHttpOperation(admission, res, next, () => res.json(repository.allBrowsers())); });
  router.get('/browser/:id', async (req, res, next) => {
    await runAdmittedHttpOperation(admission, res, next, () => {
    const value = repository.browserById(String(req.params.id));
    if (!value) { res.status(404).json({ error: 'browser_not_found' }); return; }
    res.json(value);
    });
  });
  router.get('/extension/:id/activities', async (req, res, next) => {
    await runAdmittedHttpOperation(admission, res, next, () => {
    const id = String(req.params.id);
    if (!repository.extensionById(id)) { res.status(404).json({ error: 'extension_not_found' }); return; }
    res.json(repository.activitiesByExtension(id));
    });
  });
  router.get('/extension/:id/tasks', async (req, res, next) => {
    await runAdmittedHttpOperation(admission, res, next, () => {
    const id = String(req.params.id);
    if (!repository.extensionById(id)) { res.status(404).json({ error: 'extension_not_found' }); return; }
    res.json(repository.tasksByExtension(id));
    });
  });
  router.get('/extension/:id', async (req, res, next) => {
    await runAdmittedHttpOperation(admission, res, next, () => {
    const value = repository.extensionById(String(req.params.id));
    if (!value) { res.status(404).json({ error: 'extension_not_found' }); return; }
    res.json(value);
    });
  });
  return router;
}
