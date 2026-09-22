import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import type { Store } from '../db/store';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { ah, authed } from './helpers';

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export function createUsageRouter(store: Store): Router {
  const r = Router();

  r.get(
    '/summary',
    requireAuth,
    validateQuery(querySchema),
    ah(async (req, res) => {
      const user = authed(req);
      const { days } = req.query as unknown as z.infer<typeof querySchema>;
      res.json(await store.usageSummary(user.id, days, config.dailyTokenQuota));
    }),
  );

  return r;
}
