// Vitest setup — src modules load hone SE PEHLE env force karo.
process.env.NODE_ENV = 'test';
process.env.AI_PROVIDER = 'mock';
process.env.SEED_DEMO = 'false';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-please-change-me-32+';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-please-change-me-32+';
process.env.DATABASE_URL = '';
process.env.STORAGE_DRIVER = 'local';
