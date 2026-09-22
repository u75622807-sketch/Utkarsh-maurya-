// Rate limiting (doc 08-T3/T7/T10). Dev: in-memory store.
// Prod multi-replica: REDIS_URL set karo — TODO(doc-10): rate-limit-redis store wiring (~15 lines).
// NOTE: express-rate-limit v7 — `limit` option, `RateLimit-*` headers default me.

import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { getRequestId } from './requestId';

function handler(req: Request, res: Response): void {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests — please slow down and retry.',
      requestId: getRequestId(req),
    },
  });
}

function keyByUserOrIp(req: Request): string {
  const u = (req as Request & { user?: { id: string } }).user;
  return u ? `u:${u.id}` : `ip:${req.ip ?? 'unknown'}`;
}

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.rateGlobalPerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.rateAuthPerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

export const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.rateChatPerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp, // per-user (login) else per-IP — multi-IP bypass harder
  handler,
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: config.rateUploadPerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  handler,
});
