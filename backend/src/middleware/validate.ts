import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/errors';

function toDetails(err: { issues: Array<{ path: Array<string | number>; message: string; code: string }> }): Array<{
  field: string;
  message: string;
  code: string;
}> {
  return err.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message, code: i.code }));
}

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request body', toDetails(parsed.error)));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Invalid query parameters', toDetails(parsed.error)));
      return;
    }
    req.query = parsed.data as Request['query'];
    next();
  };
}
