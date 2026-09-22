import { Router } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { assertModelAllowed, getModel, listModels } from '../services/modelsRegistry';
import { notFound } from '../utils/errors';
import { paginate, parsePageParams } from '../utils/pagination';
import { ah, authed } from './helpers';

const listQuery = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().min(1).max(80).optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  model: z.string().trim().min(1).max(80).optional(),
});

const messagesQuery = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

async function resolveModel(store: Store, userId: string, requested?: string): Promise<string> {
  if (requested) return assertModelAllowed(requested).id;
  const settings = await store.getSettings(userId);
  const current = getModel(settings.defaultModel);
  if (current?.enabled) return current.id;
  const fallback = listModels().find((m) => m.enabled);
  if (!fallback) throw notFound('Enabled AI model');
  return fallback.id;
}

export function createConversationsRouter(store: Store): Router {
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/',
    validateQuery(listQuery),
    ah(async (req, res) => {
      const user = authed(req);
      const q = req.query as unknown as z.infer<typeof listQuery>;
      const p = parsePageParams({ page: q.page, pageSize: q.pageSize });
      const { items, total } = await store.listConversations(user.id, q.q, p);
      res.json(paginate(items, total, p));
    }),
  );

  r.post(
    '/',
    validateBody(createSchema),
    ah(async (req, res) => {
      const user = authed(req);
      const body = req.body as z.infer<typeof createSchema>;
      const model = await resolveModel(store, user.id, body.model);
      const conv = await store.createConversation(user.id, body.title ?? 'New chat', model);
      res.status(201).json(conv);
    }),
  );

  r.get(
    '/:id',
    validateQuery(messagesQuery),
    ah(async (req, res) => {
      const user = authed(req);
      const conv = await store.getConversation(user.id, req.params.id);
      if (!conv) throw notFound('Conversation');
      const q = req.query as unknown as z.infer<typeof messagesQuery>;
      const messages = await store.listMessages(conv.id, user.id, { before: q.before, limit: q.limit });
      res.json({ conversation: conv, messages });
    }),
  );

  r.patch(
    '/:id',
    validateBody(patchSchema),
    ah(async (req, res) => {
      const user = authed(req);
      const body = req.body as z.infer<typeof patchSchema>;
      if (body.model) assertModelAllowed(body.model);
      const conv = await store.updateConversation(user.id, req.params.id, body);
      if (!conv) throw notFound('Conversation');
      res.json(conv);
    }),
  );

  r.delete(
    '/:id',
    ah(async (req, res) => {
      const user = authed(req);
      const ok = await store.deleteConversation(user.id, req.params.id);
      if (!ok) throw notFound('Conversation');
      res.json({ deleted: true });
    }),
  );

  r.get(
    '/:id/messages',
    validateQuery(messagesQuery),
    ah(async (req, res) => {
      const user = authed(req);
      const conv = await store.getConversation(user.id, req.params.id);
      if (!conv) throw notFound('Conversation');
      const q = req.query as unknown as z.infer<typeof messagesQuery>;
      const messages = await store.listMessages(conv.id, user.id, { before: q.before, limit: q.limit });
      res.json({ messages, hasMore: messages.length === q.limit });
    }),
  );

  return r;
}
