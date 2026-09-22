import { config, validateConfig } from './config';
import { createApp } from './app';
import type { Store } from './db/store';
import { MemoryStore } from './db/memoryStore';
import { PostgresStore } from './db/postgresStore';
import { logger } from './logger';
import { hashPassword } from './services/authProviders';

async function buildStore(): Promise<{ store: Store; close: () => Promise<void> }> {
  if (config.databaseUrl.startsWith('postgres')) {
    const pg = new PostgresStore();
    await pg.migrate();
    logger.info('postgres connected + migrated');
    return { store: pg, close: () => pg.close() };
  }
  const mem = new MemoryStore({ persistDir: config.isTest ? null : config.dataDir });
  logger.info('using file-persisted memory store (dev)', { dir: config.dataDir });
  return { store: mem, close: async () => undefined };
}

/** Dev convenience seed — prod me guard se skip (doc 10). */
async function seedDemo(store: Store): Promise<void> {
  if (!config.seedDemo || config.isProd) return;
  const email = 'demo@utkforce.ai';
  if (await store.findUserByEmail(email)) return;
  const user = await store.createUser({
    email,
    passwordHash: await hashPassword('Demo@1234!'),
    name: 'Demo User',
    provider: 'local',
    providerSub: null,
  });
  await store.createNote(user.id, {
    title: 'Welcome to UtkForce 👋',
    content:
      '# Namaste!\n\nYe aapka personal knowledge dashboard hai.\n\n- **Chat** me sawal puchho (streaming)\n- **Notes** me Markdown knowledge base banao\n- **Files** upload karo (txt/md/pdf/png/jpg)\n- **Usage** me token kharch dekho\n\nLogin: `demo@utkforce.ai` — password badalna mat bhoolna!',
    tags: ['welcome'],
    pinned: true,
  });
  const conv = await store.createConversation(user.id, 'Welcome chat', 'mock-1');
  await store.addMessage({
    conversationId: conv.id,
    userId: user.id,
    role: 'assistant',
    content: 'Namaste! Main UtkForce hoon. Kuch bhi puchho — notes, files aur history sab yahin milega.',
    model: 'mock-1',
  });
  logger.info('demo seed created (demo@utkforce.ai / Demo@1234!)');
}

async function main(): Promise<void> {
  const warnings = validateConfig();
  for (const w of warnings) logger.warn('config', { warning: w });

  const { store, close } = await buildStore();
  await seedDemo(store);

  // Periodic hygiene: expired refresh purge (hourly)
  const purgeTimer = setInterval(() => {
    store.purgeExpired().catch((err) => logger.warn('purge failed', { err: String(err) }));
  }, 3600000);
  purgeTimer.unref?.();

  const app = createApp({ store });
  const server = app.listen(config.port, '0.0.0.0', () => {
    logger.info('utkforce api listening', { port: config.port, env: config.nodeEnv });
  });

  const shutdown = (signal: string): void => {
    logger.info('shutdown', { signal });
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref?.();
    server.close(() => {
      close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection — exiting', { err: String(reason) });
    process.exit(1);
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException — exiting', { err: String(err?.stack ?? err) });
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error('boot failed', { err: String(err?.stack ?? err) });
  process.exit(1);
});
