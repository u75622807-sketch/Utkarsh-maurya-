import { Router } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { notFound } from '../utils/errors';
import { paginate, parsePageParams } from '../utils/pagination';
import { ah, authed } from './helpers';

const listQuery = z.object({
  q: z.string().trim().max(100).default(''),
  tag: z.string().trim().max(30).default(''),
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
});

const tagSchema = z.string().trim().min(1).max(30);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(50000).default(''),
  tags: z.array(tagSchema).max(10).default([]),
  pinned: z.boolean().default(false),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(50000).optional(),
  tags: z.array(tagSchema).max(10).optional(),
  pinned: z.boolean().optional(),
});

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

export function createNotesRouter(store: Store): Router {
  const r = Router();
  r.use(requireAuth);

  r.get(
    '/',
    validateQuery(listQuery),
    ah(async (req, res) => {
      const user = authed(req);
      const q = req.query as unknown as z.infer<typeof listQuery>;
      const p = parsePageParams({ page: q.page, pageSize: q.pageSize });
      const { items, total } = await store.listNotes(user.id, { q: q.q, tag: q.tag, p });
      res.json(paginate(items, total, p));
    }),
  );

  r.post(
    '/',
    validateBody(createSchema),
    ah(async (req, res) => {
      const user = authed(req);
      const body = req.body as z.infer<typeof createSchema>;
      const note = await store.createNote(user.id, { ...body, tags: normalizeTags(body.tags) });
      res.status(201).json(note);
    }),
  );

  r.get(
    '/:id',
    ah(async (req, res) => {
      const user = authed(req);
      const note = await store.getNote(user.id, req.params.id);
      if (!note) throw notFound('Note');
      res.json(note);
    }),
  );

  r.patch(
    '/:id',
    validateBody(patchSchema),
    ah(async (req, res) => {
      const user = authed(req);
      const body = req.body as z.infer<typeof patchSchema>;
      const note = await store.updateNote(user.id, req.params.id, {
        ...body,
        tags: body.tags ? normalizeTags(body.tags) : undefined,
      });
      if (!note) throw notFound('Note');
      res.json(note);
    }),
  );

  r.delete(
    '/:id',
    ah(async (req, res) => {
      const user = authed(req);
      const ok = await store.deleteNote(user.id, req.params.id);
      if (!ok) throw notFound('Note');
      res.json({ deleted: true });
    }),
  );

  return r;
}
