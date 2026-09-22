import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authHeader, registerUser, testApp } from './helpers';

describe('notes', () => {
  const { app } = testApp();

  it('CRUD + pagination math + q filter + tag filter', async () => {
    const u = await registerUser(app);
    for (let i = 0; i < 3; i++) {
      const c = await request(app).post('/api/notes').set(authHeader(u)).send({
        title: `Note ${i} — chai recipe`,
        content: 'adrak wali chai',
        tags: i === 0 ? ['food'] : ['misc'],
        pinned: i === 2,
      });
      expect(c.status).toBe(201);
    }
    const p1 = await request(app).get('/api/notes?page=1&pageSize=2').set(authHeader(u));
    expect(p1.body.total).toBe(3);
    expect(p1.body.totalPages).toBe(2);
    expect(p1.body.data).toHaveLength(2);
    expect(p1.body.data[0].pinned).toBe(true); // pinned-first

    const q = await request(app).get('/api/notes?q=chai').set(authHeader(u));
    expect(q.body.total).toBe(3);
    const tag = await request(app).get('/api/notes?tag=food').set(authHeader(u));
    expect(tag.body.total).toBe(1);

    const id = tag.body.data[0].id as string;
    const patch = await request(app).patch(`/api/notes/${id}`).set(authHeader(u)).send({ title: 'Renamed' });
    expect(patch.body.title).toBe('Renamed');
    const del = await request(app).delete(`/api/notes/${id}`).set(authHeader(u));
    expect(del.body.deleted).toBe(true);
    const gone = await request(app).get(`/api/notes/${id}`).set(authHeader(u));
    expect(gone.status).toBe(404);
  });

  it('validation: title/content/tags caps → 400', async () => {
    const u = await registerUser(app);
    const t = await request(app).post('/api/notes').set(authHeader(u)).send({ title: 'x'.repeat(201) });
    expect(t.status).toBe(400);
    const c = await request(app)
      .post('/api/notes')
      .set(authHeader(u))
      .send({ title: 'ok', content: 'x'.repeat(50001) });
    expect(c.status).toBe(400);
    const tags = await request(app)
      .post('/api/notes')
      .set(authHeader(u))
      .send({ title: 'ok', tags: Array.from({ length: 11 }, (_, i) => `t${i}`) });
    expect(tags.status).toBe(400);
  });

  it('cross-user note access → 404 (403 nahi — existence leak nahi)', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const created = await request(app).post('/api/notes').set(authHeader(a)).send({ title: 'a private' });
    const id = created.body.id as string;
    for (const [method, url] of [['get', `/api/notes/${id}`], ['patch', `/api/notes/${id}`], ['delete', `/api/notes/${id}`]] as const) {
      const res = method === 'get'
        ? await request(app).get(url).set(authHeader(b))
        : method === 'patch'
          ? await request(app).patch(url).set(authHeader(b)).send({ title: 'x' })
          : await request(app).delete(url).set(authHeader(b));
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('conversations', () => {
  const { app } = testApp();

  it('create/list/get-with-messages/rename/delete', async () => {
    const u = await registerUser(app);
    const created = await request(app).post('/api/conversations').set(authHeader(u)).send({ title: 'My chat' });
    expect(created.status).toBe(201);
    expect(created.body.model).toBe('mock-1'); // settings default

    await request(app)
      .post('/api/chat/completions')
      .set(authHeader(u))
      .send({ model: 'mock-1', message: 'hi there', conversationId: created.body.id });

    const full = await request(app).get(`/api/conversations/${created.body.id}`).set(authHeader(u));
    expect(full.body.messages).toHaveLength(2);

    const renamed = await request(app)
      .patch(`/api/conversations/${created.body.id}`)
      .set(authHeader(u))
      .send({ title: 'Renamed chat' });
    expect(renamed.body.title).toBe('Renamed chat');

    const list = await request(app).get('/api/conversations?q=Renamed').set(authHeader(u));
    expect(list.body.total).toBe(1);

    const del = await request(app).delete(`/api/conversations/${created.body.id}`).set(authHeader(u));
    expect(del.body.deleted).toBe(true);
  });

  it('cross-user conversation → 404; forged model on create → 400', async () => {
    const a = await registerUser(app);
    const b = await registerUser(app);
    const created = await request(app).post('/api/conversations').set(authHeader(a)).send({});
    const cross = await request(app).get(`/api/conversations/${created.body.id}`).set(authHeader(b));
    expect(cross.status).toBe(404);

    const forged = await request(app).post('/api/conversations').set(authHeader(a)).send({ model: 'gpt-4o' });
    expect(forged.status).toBe(400);
  });

  it('messages cursor paging works', async () => {
    const u = await registerUser(app);
    const created = await request(app).post('/api/conversations').set(authHeader(u)).send({});
    const id = created.body.id as string;
    await request(app).post('/api/chat/completions').set(authHeader(u)).send({ model: 'mock-1', message: 'm1', conversationId: id });
    await request(app).post('/api/chat/completions').set(authHeader(u)).send({ model: 'mock-1', message: 'm2', conversationId: id });
    // limit=2 → latest 2 ([u2, a2]); `before` se backward paging
    const page = await request(app).get(`/api/conversations/${id}/messages?limit=2`).set(authHeader(u));
    expect(page.body.messages).toHaveLength(2);
    expect(page.body.hasMore).toBe(true);
    expect(page.body.messages[1].content).toContain('m2');
    const oldestOnPage = page.body.messages[0].id as string;
    const older = await request(app)
      .get(`/api/conversations/${id}/messages?before=${oldestOnPage}&limit=10`)
      .set(authHeader(u));
    expect(older.body.messages).toHaveLength(2); // [u1, a1]
    expect(older.body.messages[1].content).toContain('m1');
  });
});
