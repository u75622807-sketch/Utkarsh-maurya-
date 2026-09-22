// Structured JSON logger + PII/secret redaction (doc 06).
// Usage: logger.info('chat completed', { requestId, userId, model, tokens });

import { config } from './config';

type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT_SUBSTRINGS = [
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'api-key',
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
];

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase();
  return REDACT_SUBSTRINGS.some((s) => k.includes(s));
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') {
    // Log injection guard: newlines strip + length cap
    const flat = value.replace(/[\r\n]+/g, ' ');
    return flat.length > 2000 ? flat.slice(0, 2000) + '…' : flat;
  }
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedact(k) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  const record = {
    ts: new Date().toISOString(),
    level,
    msg: String(msg).replace(/[\r\n]+/g, ' '),
    ...(meta ? (sanitize(meta) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => {
    if (config.logLevel === 'debug') write('debug', msg, meta);
  },
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
};

export const __test = { sanitize, shouldRedact };
