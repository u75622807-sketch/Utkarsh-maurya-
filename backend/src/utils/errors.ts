// Standard error envelope: { error: { code, message, requestId, details? } } (doc 04)

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'AI_UPSTREAM_ERROR'
  | 'AUTH_PROVIDER_NOT_ENABLED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message, details);
}
export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError(401, 'UNAUTHORIZED', message);
}
export function tokenExpired(): AppError {
  return new AppError(401, 'TOKEN_EXPIRED', 'Access token expired');
}
export function forbidden(message = 'Forbidden'): AppError {
  return new AppError(403, 'FORBIDDEN', message);
}
export function notFound(resource = 'Resource'): AppError {
  return new AppError(404, 'NOT_FOUND', `${resource} not found`);
}
export function conflict(message: string): AppError {
  return new AppError(409, 'CONFLICT', message);
}
export function quotaExceeded(message: string, details?: unknown): AppError {
  return new AppError(429, 'QUOTA_EXCEEDED', message, details);
}
export function upstreamError(message = 'AI provider temporarily unavailable'): AppError {
  return new AppError(502, 'AI_UPSTREAM_ERROR', message);
}
