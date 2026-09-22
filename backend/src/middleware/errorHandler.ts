import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config';
import { logger } from '../logger';
import { AppError } from '../utils/errors';
import { getRequestId } from './requestId';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found`, requestId: getRequestId(req) },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = getRequestId(req);

  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('app error', { requestId, code: err.code, err: String(err.stack ?? err) });
    res.status(err.status).json({
      error: { code: err.code, message: err.message, requestId, ...(err.details !== undefined ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: `File exceeds ${config.uploadMaxMb}MB limit`, requestId },
      });
      return;
    }
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Upload error: ${err.message}`, requestId } });
    return;
  }

  // Malformed JSON body
  if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body', requestId } });
    return;
  }

  logger.error('unhandled error', { requestId, err: String((err as Error)?.stack ?? err) });
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: config.isProd ? 'Something went wrong' : `Internal error: ${(err as Error)?.message ?? err}`,
      requestId,
    },
  });
}
