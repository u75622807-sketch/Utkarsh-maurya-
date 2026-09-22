import dotenv from 'dotenv';

// .env load (missing file = fine, env vars se chalega)
dotenv.config();

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

const nodeEnv = str('NODE_ENV', 'development');
export const isProd = nodeEnv === 'production';
export const isTest = nodeEnv === 'test';

function csv(name: string, fallback: string): string[] {
  return str(name, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  nodeEnv,
  isProd,
  isTest,
  port: num('PORT', 4000),
  version: '1.0.0',
  logLevel: str('LOG_LEVEL', 'info'),

  jwtAccessSecret: str('JWT_ACCESS_SECRET', ''),
  jwtRefreshSecret: str('JWT_REFRESH_SECRET', ''),
  accessTtlSec: num('ACCESS_TOKEN_TTL_SEC', 900),
  refreshTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 30),

  corsOrigins: csv('CORS_ORIGIN', 'http://localhost:5173'),

  databaseUrl: str('DATABASE_URL', ''),
  pgRejectUnauthorized: str('PG_REJECT_UNAUTHORIZED', 'true') !== 'false',
  seedDemo: bool('SEED_DEMO', !isProd && !isTest),
  dataDir: str('DATA_DIR', './data'),

  aiProvider: str('AI_PROVIDER', 'mock') as 'mock' | 'openai' | 'anthropic',
  openaiKey: str('OPENAI_API_KEY', ''),
  anthropicKey: str('ANTHROPIC_API_KEY', ''),
  aiDefaultModel: str('AI_DEFAULT_MODEL', 'mock-1'),
  aiMaxOutputTokens: num('AI_MAX_OUTPUT_TOKENS', 1024),
  aiTimeoutMs: num('AI_REQUEST_TIMEOUT_MS', 60000),
  dailyTokenQuota: num('DAILY_TOKEN_QUOTA', 50000),

  storageDriver: str('STORAGE_DRIVER', 'local') as 'local' | 's3',
  uploadDir: str('UPLOAD_DIR', './uploads'),
  uploadMaxMb: num('UPLOAD_MAX_MB', 15),
  uploadAllowedMime: csv(
    'UPLOAD_ALLOWED_MIME',
    'text/plain,text/markdown,application/pdf,image/png,image/jpeg',
  ),
  s3: {
    bucket: str('S3_BUCKET', ''),
    region: str('S3_REGION', ''),
    accessKeyId: str('S3_ACCESS_KEY_ID', ''),
    secretAccessKey: str('S3_SECRET_ACCESS_KEY', ''),
    endpoint: str('S3_ENDPOINT', ''),
  },

  rateGlobalPerMin: num('RATE_GLOBAL_PER_MIN', 300),
  rateAuthPerMin: num('RATE_AUTH_PER_MIN', 20),
  rateChatPerMin: num('RATE_CHAT_PER_MIN', 30),
  rateUploadPerMin: num('RATE_UPLOAD_PER_MIN', 20),
  redisUrl: str('REDIS_URL', ''),

  google: {
    clientId: str('GOOGLE_CLIENT_ID', ''),
    clientSecret: str('GOOGLE_CLIENT_SECRET', ''),
    callbackUrl: str('GOOGLE_CALLBACK_URL', 'http://localhost:4000/api/auth/google/callback'),
  },
};

/**
 * Fail-closed validation. Prod me secrets/config adhure hon to boot refuse.
 * Dev/test me warn karke chalao (mock provider + file store).
 */
export function validateConfig(): string[] {
  const warnings: string[] = [];
  const fatal: string[] = [];

  if (isProd) {
    if (config.jwtAccessSecret.length < 32) fatal.push('JWT_ACCESS_SECRET must be >= 32 chars in production');
    if (config.jwtRefreshSecret.length < 32) fatal.push('JWT_REFRESH_SECRET must be >= 32 chars in production');
    if (config.jwtAccessSecret === config.jwtRefreshSecret) fatal.push('JWT access/refresh secrets must differ');
    if (config.corsOrigins.length === 0) fatal.push('CORS_ORIGIN must be set in production');
    if (!config.databaseUrl) fatal.push('DATABASE_URL (Postgres) is required in production');
    if (!config.redisUrl) warnings.push('REDIS_URL empty: rate-limit falls back to in-memory (single replica only)');
    if (config.aiProvider === 'openai' && !config.openaiKey) fatal.push('OPENAI_API_KEY required for AI_PROVIDER=openai');
    if (config.aiProvider === 'anthropic' && !config.anthropicKey) fatal.push('ANTHROPIC_API_KEY required for AI_PROVIDER=anthropic');
    if (config.storageDriver === 's3' && (!config.s3.bucket || !config.s3.accessKeyId)) {
      fatal.push('S3_* config required for STORAGE_DRIVER=s3');
    }
    if (config.seedDemo) warnings.push('SEED_DEMO=true in production: demo seed will be skipped anyway (guard)');
  } else {
    if (!config.jwtAccessSecret || !config.jwtRefreshSecret) {
      warnings.push('JWT secrets empty: using insecure dev defaults (never use in production)');
      config.jwtAccessSecret = config.jwtAccessSecret || 'dev-access-secret-CHANGE-ME-min-32-chars!!';
      config.jwtRefreshSecret = config.jwtRefreshSecret || 'dev-refresh-secret-CHANGE-ME-min-32-chars!!';
    }
    if (config.aiProvider !== 'mock' && !config.openaiKey && !config.anthropicKey) {
      warnings.push(`AI_PROVIDER=${config.aiProvider} but no API key: falling back to mock provider`);
      config.aiProvider = 'mock';
    }
  }

  if (fatal.length > 0) {
    throw new Error(`FATAL config errors:\n- ${fatal.join('\n- ')}`);
  }
  return warnings;
}
