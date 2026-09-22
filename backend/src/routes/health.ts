import { Router } from 'express';
import { config } from '../config';
import { getProvider } from '../services/aiProvider';
import { ah } from './helpers';

export function createHealthRouter(): Router {
  const r = Router();
  const startedAt = Date.now();

  r.get(
    '/',
    ah(async (_req, res) => {
      res.json({
        status: 'ok',
        version: config.version,
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
        provider: getProvider().id,
        db: config.databaseUrl ? 'postgres' : 'memory',
      });
    }),
  );

  return r;
}
