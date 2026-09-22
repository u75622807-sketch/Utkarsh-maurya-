import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { authHeader, registerUser, testApp } from './helpers';

describe('security headers & contract', () => {
  const { app } = testApp();

  it('helmet headers present (CSP incl. frame-ancestors, nosniff)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('x-request-id on success AND errors; 404 envelope shape', async () => {
    const ok = await request(app).get('/api/health');
    expect(ok.headers['x-request-id']).toBeTruthy();
    const nf = await request(app).get('/api/nope');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');
    expect(nf.body.error.requestId).toBe(nf.headers['x-request-id']);
  });

  it('zod error shape: VALIDATION_ERROR + field details', async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .send({ model: 'mock-1', message: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
    expect(res.body.error.details[0].field).toBe('message');
  });

  it('expired access token → 401 TOKEN_EXPIRED (not generic)', async () => {
    const u = await registerUser(app);
    const expired = jwt.sign(
      { sub: u.userId, email: u.email, sid: 'x' },
      config.jwtAccessSecret,
      { algorithm: 'HS256', expiresIn: '-1s' },
    );
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${expired}` });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('tampered JWT (alg:none) rejected', async () => {
    const u = await registerUser(app);
    const none = jwt.sign({ sub: u.userId, email: u.email, sid: 'x' }, '', { algorithm: 'none' });
    const res = await request(app).get('/api/auth/me').set({ Authorization: `Bearer ${none}` });
    expect(res.status).toBe(401);
  });

  it('prod CORS: evil origin gets no allow-origin echo', async () => {
    const prev = config.isProd;
    (config as { isProd: boolean }).isProd = true;
    try {
      const res = await request(app)
        .options('/api/auth/me')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      (config as { isProd: boolean }).isProd = prev;
    }
  });

  it('rate-limit headers emitted (draft-7 combined header)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['ratelimit']).toMatch(/limit=\d+/);
    expect(res.headers['ratelimit-policy']).toBeTruthy();
  });

  it('settings account delete wipes everything (auth afterwards fails)', async () => {
    const u = await registerUser(app);
    await request(app).post('/api/notes').set(authHeader(u)).send({ title: 'bye' });
    const del = await request(app).delete('/api/settings/account').set(authHeader(u)).send({ confirm: 'DELETE' });
    expect(del.body.deleted).toBe(true);
    const me = await request(app).get('/api/auth/me').set(authHeader(u));
    expect(me.status).toBe(401);
  });
});
