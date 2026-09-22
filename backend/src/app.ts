import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { config } from './config';
import type { Store } from './db/store';
import { logger } from './logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';
import { getRequestId, requestId } from './middleware/requestId';
import { createAuthRouter } from './routes/auth';
import { createChatRouter } from './routes/chat';
import { createConversationsRouter } from './routes/conversations';
import { createFilesRouter } from './routes/files';
import { createHealthRouter } from './routes/health';
import { createModelsRouter } from './routes/models';
import { createNotesRouter } from './routes/notes';
import { createSearchRouter } from './routes/search';
import { createSettingsRouter } from './routes/settings';
import { createUsageRouter } from './routes/usage';

export interface AppDeps {
  store: Store;
}

/** Testable app factory — tests fresh MemoryStore inject karte hain. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.set('trust proxy', 1); // LB/reverse-proxy ke peeche sahi req.ip (rate-limit ke liye)
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false, // API JSON; COEP sirf SPA document par (nginx)
    }),
  );

  // CORS: prod exact-allowlist, dev echo (doc 08-T14)
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true); // curl / mobile / same-origin
        if (!config.isProd) return cb(null, origin);
        if (config.corsOrigins.includes(origin)) return cb(null, origin);
        return cb(null, false);
      },
      credentials: true,
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(globalLimiter);

  // Access log (PII-free: path only, no query/body)
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      logger.info('http', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - started,
        requestId: getRequestId(req),
      });
    });
    next();
  });

  // Prod CSRF reinforcement: cookie-auth endpoints par Origin check (doc 05 §4)
  app.use('/api/auth/refresh', (req, res, next) => {
    if (config.isProd) {
      const origin = req.header('origin');
      if (origin && !config.corsOrigins.includes(origin)) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Bad origin', requestId: getRequestId(req) },
        });
        return;
      }
    }
    next();
  });

  app.use('/api/health', createHealthRouter());
  app.use('/api/auth', createAuthRouter(deps.store));
  app.use('/api/models', createModelsRouter());
  app.use('/api/chat', createChatRouter(deps.store));
  app.use('/api/conversations', createConversationsRouter(deps.store));
  app.use('/api/notes', createNotesRouter(deps.store));
  app.use('/api/search', createSearchRouter(deps.store));
  app.use('/api/files', createFilesRouter(deps.store));
  app.use('/api/usage', createUsageRouter(deps.store));
  app.use('/api/settings', createSettingsRouter(deps.store));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
