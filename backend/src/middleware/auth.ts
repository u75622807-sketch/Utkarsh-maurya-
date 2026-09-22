import { randomBytes, createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { tokenExpired, unauthorized } from '../utils/errors';

export interface AuthUser {
  id: string;
  email: string;
  sid: string; // session/family id (refresh family se link)
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

interface AccessPayload {
  sub: string;
  email: string;
  sid: string;
}

export function signAccessToken(user: { id: string; email: string }, sid: string): string {
  return jwt.sign(
    { sub: user.id, email: user.email, sid },
    config.jwtAccessSecret,
    { algorithm: 'HS256', expiresIn: config.accessTtlSec },
  );
}

export function verifyAccessToken(token: string): AuthUser {
  try {
    const p = jwt.verify(token, config.jwtAccessSecret, { algorithms: ['HS256'] }) as AccessPayload;
    if (!p.sub || !p.email || !p.sid) throw unauthorized('Malformed access token');
    return { id: p.sub, email: p.email, sid: p.sid };
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'TokenExpiredError') {
      throw tokenExpired();
    }
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw unauthorized('Invalid access token');
  }
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw unauthorized();
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Opaque refresh token (raw, cookie me) + SHA-256 hash (DB me). Raw value kabhi log/DB me nahi. */
export function newRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function refreshCookieOptions(): { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number } {
  return {
    httpOnly: true,
    secure: config.isProd, // prod TLS-only; dev http me Secure cookie set hi nahi hoga isliye conditional
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: config.refreshTtlDays * 86400 * 1000,
  };
}
