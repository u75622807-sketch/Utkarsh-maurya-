import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../config';
import type { Store } from '../db/store';
import { toPublicUser } from '../db/types';
import type { User } from '../db/types';
import {
  hashRefreshToken,
  newRefreshToken,
  refreshCookieOptions,
  requireAuth,
  signAccessToken,
} from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { getRequestId } from '../middleware/requestId';
import { logger } from '../logger';
import { getAuthProvider, hashPassword, verifyPassword } from '../services/authProviders';
import { conflict, unauthorized } from '../utils/errors';
import { ah, authed } from './helpers';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, 'Password must include a letter and a digit');

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().max(100).default(''),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const GENERIC_LOGIN_ERROR = 'Invalid email or password';

async function issuePair(store: Store, user: User, req: Request, res: Response): Promise<string> {
  const familyId = randomUUID();
  const raw = newRefreshToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 86400000).toISOString();
  await store.saveRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(raw),
    familyId,
    userAgent: req.header('user-agent')?.slice(0, 300) ?? null,
    ip: (req.ip ?? null)?.slice(0, 45) ?? null,
    expiresAt,
  });
  res.cookie('rt', raw, refreshCookieOptions());
  return signAccessToken({ id: user.id, email: user.email }, familyId);
}

export function createAuthRouter(store: Store): Router {
  const r = Router();

  r.post(
    '/register',
    authLimiter,
    validateBody(registerSchema),
    ah(async (req, res) => {
      const { email, password, name } = req.body as z.infer<typeof registerSchema>;
      const existing = await store.findUserByEmail(email);
      if (existing) throw conflict('Email already registered');
      const user = await store.createUser({
        email,
        passwordHash: await hashPassword(password),
        name,
        provider: 'local',
        providerSub: null,
      });
      const accessToken = await issuePair(store, user, req, res);
      logger.info('user registered', { userId: user.id, requestId: getRequestId(req) });
      res.status(201).json({ user: toPublicUser(user), accessToken });
    }),
  );

  r.post(
    '/login',
    authLimiter,
    validateBody(loginSchema),
    ah(async (req, res) => {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      const user = await store.findUserByEmail(email);
      // Generic error + same code path (enumeration/timing guard, doc 08-T11)
      const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
      if (!user || !ok) throw unauthorized(GENERIC_LOGIN_ERROR);
      await store.updateUserLogin(user.id);
      const accessToken = await issuePair(store, user, req, res);
      logger.info('user login', { userId: user.id, requestId: getRequestId(req) });
      res.json({ user: toPublicUser(user), accessToken });
    }),
  );

  r.post(
    '/refresh',
    authLimiter,
    ah(async (req, res) => {
      const raw = (req.cookies as Record<string, string> | undefined)?.rt;
      if (!raw) throw unauthorized('Session missing — please log in again');
      const row = await store.findRefreshByHash(hashRefreshToken(raw));
      if (!row) throw unauthorized('Invalid session — please log in again');
      if (row.revokedAt) {
        // Reuse of rotated token = likely theft → kill whole family (doc 05 §4)
        await store.revokeRefreshFamily(row.familyId);
        logger.warn('refresh token reuse detected — family revoked', {
          userId: row.userId,
          requestId: getRequestId(req),
        });
        throw unauthorized('Session revoked — please log in again');
      }
      if (new Date(row.expiresAt).getTime() < Date.now()) {
        throw unauthorized('Session expired — please log in again');
      }
      const user = await store.findUserById(row.userId);
      if (!user) throw unauthorized('Account no longer exists');
      // Rotate: revoke current, issue same-family successor
      await store.revokeRefresh(row.id);
      const nextRaw = newRefreshToken();
      const expiresAt = new Date(Date.now() + config.refreshTtlDays * 86400000).toISOString();
      await store.saveRefreshToken({
        userId: user.id,
        tokenHash: hashRefreshToken(nextRaw),
        familyId: row.familyId,
        userAgent: req.header('user-agent')?.slice(0, 300) ?? null,
        ip: (req.ip ?? null)?.slice(0, 45) ?? null,
        expiresAt,
      });
      res.cookie('rt', nextRaw, refreshCookieOptions());
      res.json({ accessToken: signAccessToken({ id: user.id, email: user.email }, row.familyId), user: toPublicUser(user) });
    }),
  );

  r.post(
    '/logout',
    ah(async (req, res) => {
      const raw = (req.cookies as Record<string, string> | undefined)?.rt;
      if (raw) {
        const row = await store.findRefreshByHash(hashRefreshToken(raw));
        if (row && !row.revokedAt) await store.revokeRefresh(row.id);
      }
      res.clearCookie('rt', { path: '/api/auth' });
      res.json({ ok: true });
    }),
  );

  r.get(
    '/me',
    requireAuth,
    ah(async (req, res) => {
      const { id } = authed(req);
      const user = await store.findUserById(id);
      if (!user) throw unauthorized('Account no longer exists');
      const settings = await store.getSettings(id);
      res.json({ user: toPublicUser(user), settings });
    }),
  );

  // ---- Google OIDC (Phase-2 stub — 501 + plan link, doc 05 §2) ----
  r.get(
    '/google',
    ah(async (req, res) => {
      const provider = getAuthProvider('google');
      const { redirectUrl } = await provider.beginLogin(req.query);
      res.redirect(redirectUrl);
    }),
  );

  r.get(
    '/google/callback',
    ah(async (req, res) => {
      const provider = getAuthProvider('google');
      await provider.handleCallback(req.query);
      res.json({ ok: true }); // unreachable until Phase-2
    }),
  );

  return r;
}
