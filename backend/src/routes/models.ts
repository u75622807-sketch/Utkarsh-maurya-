import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { listModels } from '../services/modelsRegistry';
import { ah } from './helpers';

export function createModelsRouter(): Router {
  const r = Router();

  r.get(
    '/',
    requireAuth,
    ah(async (_req, res) => {
      res.json({ data: listModels() });
    }),
  );

  return r;
}
