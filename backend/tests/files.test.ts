import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, registerUser, testApp } from './helpers';

describe('files', () => {
  const { app } = testApp();

  it('upload → list → download (attachment) → delete; storageKey never leaks', async () => {
    const u = await registerUser(app);
    const up = await request(app)
      .post('/api/files')
      .set(authHeader(u))
      .attach('file', Buffer.from('hello utkforce'), { filename: 'hello.txt', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(up.body).not.toHaveProperty('storageKey');

    const list = await request(app).get('/api/files').set(authHeader(u));
    expect(list.body.total).toBe(1);

    const dl = await request(app).get(`/api/files/${up.body.id}/download`).set(authHeader(u));
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/attachment/);
    expect(dl.text).toBe('hello utkforce');

    const del = await request(app).delete(`/api/files/${up.body.id}`).set(authHeader(u));
    expect(del.body.deleted).toBe(true);
  });

  it('cross-user download → 404', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const up = await request(app)
      .post('/api/files')
      .set(authHeader(a))
      .attach('file', Buffer.from('secret'), { filename: 's.txt', contentType: 'text/plain' });
    const cross = await request(app).get(`/api/files/${up.body.id}/download`).set(authHeader(b));
    expect(cross.status).toBe(404);
  });

  it('oversize → 413 FILE_TOO_LARGE; .exe → 415; fake-png → 415 (magic bytes)', async () => {
    const u = await registerUser(app);
    const big = await request(app)
      .post('/api/files')
      .set(authHeader(u))
      .attach('file', Buffer.alloc(16 * 1024 * 1024, 'a'), { filename: 'big.txt', contentType: 'text/plain' });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');

    const exe = await request(app)
      .post('/api/files')
      .set(authHeader(u))
      .attach('file', Buffer.from('MZ fake binary'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
    expect(exe.status).toBe(415);

    const fakePng = await request(app)
      .post('/api/files')
      .set(authHeader(u))
      .attach('file', Buffer.from('i am actually text'), { filename: 'fake.png', contentType: 'image/png' });
    expect(fakePng.status).toBe(415);
    expect(fakePng.body.error.message).toMatch(/does not match/);
  });

  it('traversal filename sanitized (random key, no leak)', async () => {
    const u = await registerUser(app);
    const up = await request(app)
      .post('/api/files')
      .set(authHeader(u))
      .attach('file', Buffer.from('x'), { filename: '../../etc/passwd', contentType: 'text/plain' });
    expect(up.status).toBe(201);
    expect(up.body).not.toHaveProperty('storageKey');
  });
});
