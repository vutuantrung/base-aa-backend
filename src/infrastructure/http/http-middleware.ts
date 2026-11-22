import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Response, NextFunction } from 'express';
import type { ApplicationAdmission } from '../../shared/contracts/application-admission.js';

export async function runAdmittedHttpOperation<T>(
  admission: ApplicationAdmission | undefined, res: Response, next: NextFunction,
  operation: () => T | Promise<T>
): Promise<void> {
  try {
    if (admission) await admission.run('http', operation);
    else await operation();
  } catch (error) {
    if (error instanceof Error && error.message === 'APPLICATION_DRAINING') {
      res.status(503).json({ error: 'APPLICATION_DRAINING' });
      return;
    }
    next(error);
  }
}

export function createApiAccessMiddleware(apiKey: string | undefined, sqliteEnabled: boolean | undefined): RequestHandler {
  return (req, res, next) => {
    if (apiKey && req.header('x-api-key') !== apiKey) { res.status(401).json({ error: 'unauthorized' }); return; }
    const sqlitePath = req.path === '/sessions' || req.path.startsWith('/sessions/') || req.path === '/process-usage' || req.path === '/aa' || req.path.startsWith('/browser/') || req.path === '/browser' || req.path.startsWith('/extension/');
    if (sqliteEnabled === false && sqlitePath) { res.status(503).json({ error: 'SQLITE_DISABLED' }); return; }
    next();
  };
}

export const httpErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('HTTP handler failure:', err);
  res.status(500).json({ error: 'internal server error' });
};
