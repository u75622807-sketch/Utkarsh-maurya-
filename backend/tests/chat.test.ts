import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { authHeader, registerUser, sseEvents, testApp } from './helpers';

describe('chat', () => {
  const { app } = testApp();

  it('completions: auto-creates conversation + assistant msg + usage', async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .send({ model: 'mock-1', message: 'Hello UtkForce' });
    expect(res.status).toBe(200);
    expect(res.body.conversationId).toBeTypeOf('string');
    expect(res.body.message.role).toBe('assistant');
    expect(res.body.message.content.length).toBeGreaterThan(0);
    expect(res.body.usage.promptTokens).toBeGreaterThan(0);
    expect(res.body.usage.completionTokens).toBeGreaterThan(0);
    expect(res.body.usage.estCostUsd).toBe(0);
  });

  it('unknown/disabled model → 400 (server allowlist, cost guard)', async () => {
    const u = await registerUser(app);
    const unknown = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .send({ model: 'nope-9000', message: 'hi' });
    expect(unknown.status).toBe(400);
    // gpt-4o-mini key ke bina disabled hai (tests me mock only)
    const disabled = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .send({ model: 'gpt-4o-mini', message: 'hi' });
    expect(disabled.status).toBe(400);
  });

  it('empty / oversize message → 400', async () => {
    const u = await registerUser(app);
    const empty = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .send({ model: 'mock-1', message: '   ' });
    expect(empty.status).toBe(400);
    const big = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .send({ model: 'mock-1', message: 'x'.repeat(8001) });
    expect(big.status).toBe(400);
  });

  it('dusre user ke conversationId par chat → 404 (IDOR masquerade)', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const created = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(a))
      .send({ model: 'mock-1', message: 'a secret' });
    const cross = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(b))
      .send({ model: 'mock-1', message: 'hijack?', conversationId: created.body.conversationId });
    expect(cross.status).toBe(404);
  });

  it('SSE stream: text/event-stream + meta → token+ → done', async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .post('/api/chat/stream')
      .set(authHeader(u))
      .send({ model: 'mock-1', message: 'stream please' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const events = sseEvents(res.text);
    expect(events[0].event).toBe('meta');
    expect(events[events.length - 1].event).toBe('done');
    expect(events.filter((e) => e.event === 'token').length).toBeGreaterThan(0);
    const done = JSON.parse(events[events.length - 1].data) as {
      conversationId: string;
      message: { content: string };
      usage: { completionTokens: number };
    };
    const joined = events.filter((e) => e.event === 'token').map((e) => (JSON.parse(e.data) as { text: string }).text).join('');
    expect(done.message.content).toBe(joined);
    expect(done.usage.completionTokens).toBeGreaterThan(0);
  });

  it('Idempotency-Key double-POST → same response, single usage event', async () => {
    const u = await registerUser(app);
    const key = 'idem-chat-1';
    const r1 = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .set('Idempotency-Key', key)
      .send({ model: 'mock-1', message: 'once please' });
    const r2 = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .set('Idempotency-Key', key)
      .send({ model: 'mock-1', message: 'once please' });
    expect(r1.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    const usage = await request(app).get('/api/usage/summary?days=1').set(authHeader(u));
    expect(usage.body.totals.requests).toBe(1);
  });

  it('daily quota exhaust → 429 QUOTA_EXCEEDED', async () => {
    const u = await registerUser(app);
    const prev = config.dailyTokenQuota;
    config.dailyTokenQuota = 1; // pehla chat pass (used=0), dusra block
    try {
      const first = await request(app)
        .post('/api/chat/completions')
        .set(authHeader(u))
        .send({ model: 'mock-1', message: 'quota one' });
      expect(first.status).toBe(200);
      const second = await request(app)
        .post('/api/chat/completions')
        .set(authHeader(u))
        .send({ model: 'mock-1', message: 'quota two' });
      expect(second.status).toBe(429);
      expect(second.body.error.code).toBe('QUOTA_EXCEEDED');
    } finally {
      config.dailyTokenQuota = prev;
    }
  });
});
