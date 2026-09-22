import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config';
import type { Store } from '../db/store';
import type { FileMeta } from '../db/types';
import { requireAuth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimit';
import { validateQuery } from '../middleware/validate';
import { logger } from '../logger';
import { getStorage, validateUpload } from '../services/storage';
import { AppError, badRequest, notFound } from '../utils/errors';
import { paginate, parsePageParams } from '../utils/pagination';
import { ah, authed } from './helpers';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploadMaxMb * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (!config.uploadAllowedMime.includes(file.mimetype)) {
      cb(new AppError(415, 'UNSUPPORTED_FILE', `File type '${file.mimetype}' is not allowed`));
      return;
    }
    cb(null, true);
  },
});

const listQuery = z.object({
  page: z.coerce.number().default(1),
  pageSize: z.coerce.number().default(20),
});

/** storageKey internal hai — client ko kabhi nahi bhejte (path disclosure guard). */
function publicMeta(f: FileMeta): Omit<FileMeta, 'storageKey'> {
  const { storageKey: _omit, ...rest } = f;
  void _omit;
  return rest;
}

export function createFilesRouter(store: Store): Router {
  const r = Router();
  r.use(requireAuth);

  r.post(
    '/',
    uploadLimiter,
    upload.single('file'),
    ah(async (req, res) => {
      const user = authed(req);
      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) throw badRequest('No file uploaded (multipart field name must be "file")');

      // Defense in depth: multer MIME check ke baad magic-byte verify (doc 08-T4)
      const problem = validateUpload(file.mimetype, file.buffer, config.uploadAllowedMime);
      if (problem) throw new AppError(415, 'UNSUPPORTED_FILE', problem);

      // TODO(doc-08-A4): per-user storage quota check yahan (hook: store.storageUsedBytes)
      const stored = await getStorage().save({
        userId: user.id,
        originalName: file.originalname,
        mime: file.mimetype,
        buffer: file.buffer,
      });
      const meta = await store.saveFile({
        userId: user.id,
        name: file.originalname.slice(0, 200),
        mime: file.mimetype,
        sizeBytes: stored.sizeBytes,
        storageKey: stored.storageKey,
        sha256: stored.sha256,
      });
      logger.info('file uploaded', { userId: user.id, fileId: meta.id, size: meta.sizeBytes });
      res.status(201).json(publicMeta(meta));
    }),
  );

  r.get(
    '/',
    validateQuery(listQuery),
    ah(async (req, res) => {
      const user = authed(req);
      const q = req.query as unknown as z.infer<typeof listQuery>;
      const p = parsePageParams({ page: q.page, pageSize: q.pageSize });
      const { items, total } = await store.listFiles(user.id, p);
      res.json(paginate(items.map(publicMeta), total, p));
    }),
  );

  r.get(
    '/:id/download',
    ah(async (req, res, next) => {
      const user = authed(req);
      const f = await store.getFile(user.id, req.params.id);
      if (!f) throw notFound('File');
      try {
        const stream = await getStorage().readStream(f.storageKey);
        res.setHeader('Content-Type', f.mime);
        res.setHeader('Content-Length', String(f.sizeBytes));
        // attachment + RFC 5987 filename (SVG/HTML execution rokna, doc 06)
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        stream.on('error', (err) => {
          logger.error('file stream error', { fileId: f.id, err: String(err) });
          if (!res.headersSent) next(notFound('File content'));
          else res.destroy();
        });
        stream.pipe(res);
      } catch (err) {
        logger.error('file read failed', { fileId: f.id, err: String(err) });
        throw notFound('File content');
      }
    }),
  );

  r.delete(
    '/:id',
    ah(async (req, res) => {
      const user = authed(req);
      const f = await store.deleteFile(user.id, req.params.id);
      if (!f) throw notFound('File');
      await getStorage().remove(f.storageKey);
      res.json({ deleted: true });
    }),
  );

  return r;
}
