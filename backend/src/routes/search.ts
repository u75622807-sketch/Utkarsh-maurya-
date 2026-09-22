import { Router } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store';
import { requireAuth } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import { ah, authed } from './helpers';

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  types: z.string().trim().max(60).default('conversations,notes,files'),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const ALLOWED_TYPES = new Set(['conversations', 'notes', 'files']);

export function createSearchRouter(store: Store): Router {
  const r = Router();

  r.get(
    '/',
    requireAuth,
    validateQuery(querySchema),
    ah(async (req, res) => {
      const user = authed(req);
      const { q, types, limit } = req.query as unknown as z.infer<typeof querySchema>;
      const wanted = types.split(',').map((t) => t.trim()).filter((t) => ALLOWED_TYPES.has(t));
      const result = await store.search(user.id, q, wanted.length ? wanted : ['conversations', 'notes', 'files'], limit);
      res.json(result);
    }),
  );

  return r;
}
