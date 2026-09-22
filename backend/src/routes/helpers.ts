import type { NextFunction, Request, Response } from 'express';
import type { AuthUser } from '../middleware/auth';

/** Async route wrapper — Express 4 me rejected promise next(err) tak pahunchana zaroori hai. */
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** requireAuth ke baad user pakka hota hai. */
export function authed(req: Request): AuthUser {
  const u = (req as Request & { user?: AuthUser }).user;
  if (!u) throw new Error('auth middleware missing: requireAuth lagana bhool gaye?');
  return u;
}
