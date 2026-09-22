import { Router } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { getRequestId } from '../middleware/requestId';
import { logger } from '../logger';
import { assertModelAllowed } from '../services/modelsRegistry';
import { getStorage } from '../services/storage';
import { ah, authed } from './helpers';

const putSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  defaultModel: z.string().trim().min(1).max(80),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(8192),
  emailNotifs: z.boolean(),
});

const deleteSchema = z.object({
  confirm: z.literal('DELETE'),
});

export function createSettingsRouter(store: Store): Router {
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/',
    ah(async (req, res) => {
      const user = authed(req);
      res.json(await store.getSettings(user.id));
    }),
  );

  r.put(
    '/',
    validateBody(putSchema),
    ah(async (req, res) => {
      const user = authed(req);
      const body = req.body as z.infer<typeof putSchema>;
      assertModelAllowed(body.defaultModel); // forged default model reject (cost guard)
      res.json(await store.putSettings(user.id, body));
    }),
  );

  // Danger zone: poora account + data + file-bytes delete (doc 06 §5)
  r.delete(
    '/account',
    validateBody(deleteSchema),
    ah(async (req, res) => {
      const user = authed(req);
      const files = await store.deleteUserCascade(user.id);
      const storage = getStorage();
      await Promise.all(files.map((f) => storage.remove(f.storageKey)));
      res.clearCookie('rt', { path: '/api/auth' });
      logger.info('account deleted', { userId: user.id, requestId: getRequestId(req) });
      res.json({ deleted: true });
    }),
  );

  return r;
}
