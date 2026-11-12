import { Router } from 'express';
import type { AaCatalogRepository } from '../../modules/aa-catalog/contracts.js';

/** Read-only HTTP contract sourced from api-data.json; no invented mutation endpoints. */
export function createAaCatalogRouter(repository: AaCatalogRepository): Router {
  const router = Router();

  router.get('/aa', (_req, res) => {
    const value = repository.currentAa();
    if (!value) { res.status(404).json({ error: 'aa_not_found' }); return; }
    res.json(value);
  });
  // Static route must come before /browser/:id
  router.get('/browser/all', (_req, res) => { res.json(repository.allBrowsers()); });
  router.get('/browser/:id', (req, res) => {
    const value = repository.browserById(String(req.params.id));
    if (!value) { res.status(404).json({ error: 'browser_not_found' }); return; }
    res.json(value);
  });
  router.get('/extension/:id/activities', (req, res) => {
    const id = String(req.params.id);
    if (!repository.extensionById(id)) { res.status(404).json({ error: 'extension_not_found' }); return; }
    res.json(repository.activitiesByExtension(id));
  });
  router.get('/extension/:id/tasks', (req, res) => {
    const id = String(req.params.id);
    if (!repository.extensionById(id)) { res.status(404).json({ error: 'extension_not_found' }); return; }
    res.json(repository.tasksByExtension(id));
  });
  router.get('/extension/:id', (req, res) => {
    const value = repository.extensionById(String(req.params.id));
    if (!value) { res.status(404).json({ error: 'extension_not_found' }); return; }
    res.json(value);
  });
  return router;
}
