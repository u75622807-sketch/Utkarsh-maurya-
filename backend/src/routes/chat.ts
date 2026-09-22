import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { Store } from '../db/store';
import type { ChatMessage, ChatResult } from '../services/aiProvider';
import { buildMessages, getProviderForModel } from '../services/aiProvider';
import { assertModelAllowed, estimateTokens } from '../services/modelsRegistry';
import { checkQuota, recordUsage } from '../services/usageTracker';
import { requireAuth } from '../middleware/auth';
import { chatLimiter } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { getRequestId } from '../middleware/requestId';
import { logger } from '../logger';
import { notFound } from '../utils/errors';
import { ah, authed } from './helpers';

const chatSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  model: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(8000),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});

type ChatBody = z.infer<typeof chatSchema>;

function idemKey(req: Request): string | null {
  const k = req.header('idempotency-key');
  return k && k.length <= 64 ? k : null;
}

/** Conversation resolve-or-create (user-scoped; cross-user id → 404 masquerade). */
async function resolveConversation(store: Store, userId: string, body: ChatBody, modelId: string): Promise<string> {
  if (body.conversationId) {
    const c = await store.getConversation(userId, body.conversationId);
    if (!c) throw notFound('Conversation');
    if (c.model !== modelId) await store.updateConversation(userId, c.id, { model: modelId });
    return c.id;
  }
  const title = body.message.replace(/\s+/g, ' ').slice(0, 60) || 'New chat';
  const c = await store.createConversation(userId, title, modelId);
  return c.id;
}

export function createChatRouter(store: Store): Router {
  const r = Router();
  r.use(requireAuth, chatLimiter);

  // ---- Non-stream ----
  r.post(
    '/completions',
    validateBody(chatSchema),
    ah(async (req, res) => {
      const user = authed(req);
      const body = req.body as ChatBody;
      const key = idemKey(req);
      if (key) {
        const hit = await store.getIdempotency(user.id, key);
        if (hit && hit.route === 'chat.completions') {
          res.json(hit.response);
          return;
        }
      }

      const model = assertModelAllowed(body.model);
      await checkQuota(store, user.id);
      const conversationId = await resolveConversation(store, user.id, body, model.id);
      const settings = await store.getSettings(user.id);

      await store.addMessage({ conversationId, userId: user.id, role: 'user', content: body.message });
      const history = await store.listMessages(conversationId, user.id, { limit: 20 });
      const messages: ChatMessage[] = buildMessages(history.map((h) => ({ role: h.role, content: h.content })));

      const provider = getProviderForModel(model.id);
      const result = await provider.complete({
        model: model.id,
        messages,
        temperature: body.temperature ?? settings.temperature,
        maxTokens: Math.min(body.maxTokens ?? settings.maxTokens, model.maxOutput),
      });

      const assistantMsg = await store.addMessage({
        conversationId,
        userId: user.id,
        role: 'assistant',
        content: result.content,
        model: model.id,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      });
      const usage = await recordUsage(store, {
        userId: user.id,
        conversationId,
        model: model.id,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      });

      logger.info('chat completed', {
        requestId: getRequestId(req),
        userId: user.id,
        model: model.id,
        provider: provider.id,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      });

      const response = { conversationId, message: assistantMsg, usage };
      if (key) await store.setIdempotency(user.id, key, 'chat.completions', response);
      res.json(response);
    }),
  );

  // ---- SSE stream ----
  r.post(
    '/stream',
    validateBody(chatSchema),
    ah(async (req: Request, res: Response) => {
      const user = authed(req);
      const body = req.body as ChatBody;
      const key = idemKey(req);

      // Pre-stream checks BEFORE headers (throw → clean JSON error, doc 04)
      const model = assertModelAllowed(body.model);
      await checkQuota(store, user.id);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const send = (event: string, data: unknown): void => {
        try {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch {
          // client gone — loop guard handles
        }
      };

      try {
        // Idempotent replay: stored full response ko dobara stream karo
        if (key) {
          const hit = await store.getIdempotency(user.id, key);
          if (hit && hit.route === 'chat.stream') {
            const prev = hit.response as { conversationId: string; message: { content: string }; usage: unknown };
            send('meta', { conversationId: prev.conversationId, model: model.id, replayed: true });
            send('token', { text: prev.message.content });
            send('done', prev);
            res.end();
            return;
          }
        }

        const conversationId = await resolveConversation(store, user.id, body, model.id);
        const settings = await store.getSettings(user.id);
        const userMsg = await store.addMessage({
          conversationId,
          userId: user.id,
          role: 'user',
          content: body.message,
        });
        send('meta', { conversationId, userMessageId: userMsg.id, model: model.id });

        const history = await store.listMessages(conversationId, user.id, { limit: 20 });
        const messages: ChatMessage[] = buildMessages(history.map((h) => ({ role: h.role, content: h.content })));

        const ctrl = new AbortController();
        let clientGone = false;
        req.on('close', () => {
          clientGone = true;
          ctrl.abort();
        });

        const provider = getProviderForModel(model.id);
        const gen = provider.stream({
          model: model.id,
          messages,
          temperature: body.temperature ?? settings.temperature,
          maxTokens: Math.min(body.maxTokens ?? settings.maxTokens, model.maxOutput),
          signal: ctrl.signal,
        });

        let full = '';
        let ret: ChatResult | null = null;
        try {
          for (;;) {
            const step = await gen.next();
            if (step.done) {
              ret = step.value;
              break;
            }
            full += step.value;
            if (!clientGone) send('token', { text: step.value });
          }
        } catch (streamErr) {
          logger.warn('chat stream interrupted', { requestId: getRequestId(req), err: String(streamErr) });
          if (!clientGone && !full) {
            const code = (streamErr as { code?: string })?.code ?? 'AI_UPSTREAM_ERROR';
            send('error', { code, message: 'AI provider temporarily unavailable' });
          }
        }

        // Partial bhi save karo (metering truth) — user ko dikhega kya aaya tha
        if (full) {
          const promptTokens = ret?.promptTokens ?? estimateTokens(messages.map((m) => m.content).join('\n'));
          const completionTokens = ret?.completionTokens ?? estimateTokens(full);
          const assistantMsg = await store.addMessage({
            conversationId,
            userId: user.id,
            role: 'assistant',
            content: full,
            model: model.id,
            promptTokens,
            completionTokens,
          });
          const usage = await recordUsage(store, {
            userId: user.id,
            conversationId,
            model: model.id,
            promptTokens,
            completionTokens,
          });
          logger.info('chat stream done', {
            requestId: getRequestId(req),
            userId: user.id,
            model: model.id,
            completionTokens,
            aborted: clientGone,
          });
          const response = { conversationId, message: assistantMsg, usage };
          if (key) await store.setIdempotency(user.id, key, 'chat.stream', response);
          if (!clientGone) send('done', response);
        }
        res.end();
      } catch (err) {
        // Headers already sent → SSE error event (envelope nahi bhej sakte)
        logger.warn('chat stream failed', { requestId: getRequestId(req), err: String(err) });
        try {
          send('error', { code: 'AI_UPSTREAM_ERROR', message: 'AI provider temporarily unavailable' });
          res.end();
        } catch {
          // socket dead
        }
      }
    }),
  );

  return r;
}
