import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, registerUser, testApp } from './helpers';

describe('usage', () => {
  const { app } = testApp();

  it('summary math consistent: totals == sum(byDay) == sum(byModel); quota shape', async () => {
    const u = await registerUser(app);
    await request(app).post('/api/chat/completions').set(authHeader(u)).send({ model: 'mock-1', message: 'one' });
    await request(app).post('/api/chat/completions').set(authHeader(u)).send({ model: 'mock-1', message: 'two' });

    const res = await request(app).get('/api/usage/summary?days=30').set(authHeader(u));
    expect(res.status).toBe(200);
    const { totals, byDay, byModel, quota } = res.body;
    expect(totals.requests).toBe(2);
    expect(totals.totalTokens).toBe(totals.promptTokens + totals.completionTokens);
    expect(byDay.reduce((s: number, d: { requests: number }) => s + d.requests, 0)).toBe(totals.requests);
    expect(byModel.reduce((s: number, m: { requests: number }) => s + m.requests, 0)).toBe(totals.requests);
    expect(quota.limit).toBeGreaterThan(0);
    expect(quota.used).toBe(totals.totalTokens);
    expect(quota.remaining).toBe(quota.limit - quota.used);
  });

  it('usage strictly per-user (no leak across accounts)', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    await request(app).post('/api/chat/completions').set(authHeader(a)).send({ model: 'mock-1', message: 'a only' });
    const resB = await request(app).get('/api/usage/summary?days=30').set(authHeader(b));
    expect(resB.body.totals.requests).toBe(0);
  });
});
