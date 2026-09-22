import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, registerUser, testApp } from './helpers';

describe('auth', () => {
  const { app } = testApp();

  it('register → 201, public user (no password_hash), rt cookie flags', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'Alice1234', name: 'Alice' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body.user).not.toHaveProperty('password_hash');
    const cookies = (res.headers['set-cookie'] as string[]).join(';');
    expect(cookies).toMatch(/rt=/);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('duplicate email → 409 CONFLICT', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'Alice1234' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('weak password → 400 VALIDATION_ERROR with field details', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body.error.details)).toContain('password');
  });

  it('login ok; wrong password vs unknown email → SAME generic 401 (enumeration guard)', async () => {
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'Alice1234' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTypeOf('string');

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'Nope12345' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Nope12345' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('/me requires token; works with token', async () => {
    const anon = await request(app).get('/api/auth/me');
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe('UNAUTHORIZED');

    const u = await registerUser(app);
    const me = await request(app).get('/api/auth/me').set(authHeader(u));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(u.email);
    expect(me.body.settings.defaultModel).toBeTruthy();
  });

  it('refresh rotates; reuse of old token revokes family (theft guard)', async () => {
    const u = await registerUser(app);
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', u.cookies);
    expect(r1.status).toBe(200);
    expect(r1.body.accessToken).toBeTypeOf('string');
    const cookies2 = (r1.headers['set-cookie'] as string[]) ?? [];

    // Purana rt dobara = reuse → 401 + family dead (naya bhi dead)
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', u.cookies);
    expect(reuse.status).toBe(401);
    const dead = await request(app).post('/api/auth/refresh').set('Cookie', cookies2);
    expect(dead.status).toBe(401);
  });

  it('logout revokes current refresh + clears cookie', async () => {
    const u = await registerUser(app);
    const out = await request(app).post('/api/auth/logout').set('Cookie', u.cookies);
    expect(out.status).toBe(200);
    const again = await request(app).post('/api/auth/refresh').set('Cookie', u.cookies);
    expect(again.status).toBe(401);
  });

  it('google stub → 501 AUTH_PROVIDER_NOT_ENABLED', async () => {
    const res = await request(app).get('/api/auth/google');
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('AUTH_PROVIDER_NOT_ENABLED');
  });

  it('auth rate limit → 429 RATE_LIMITED + Retry-After (burst)', async () => {
    let limited = 0;
    let sample: request.Response | null = null;
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'rl@example.com', password: 'Wrong1234' });
      if (res.status === 429) {
        limited++;
        sample = res;
      }
    }
    expect(limited).toBeGreaterThan(0);
    expect((sample as unknown as request.Response).body.error.code).toBe('RATE_LIMITED');
    expect((sample as unknown as request.Response).headers['retry-after']).toBeTruthy();
  });
});
