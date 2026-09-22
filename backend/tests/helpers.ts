import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { MemoryStore } from '../src/db/memoryStore';
import { __setStorage, LocalStorage } from '../src/services/storage';

export function testApp(): { app: Express; store: MemoryStore } {
  const store = new MemoryStore({ persistDir: null });
  const app = createApp({ store });
  __setStorage(new LocalStorage(mkdtempSync(join(tmpdir(), 'utkforce-test-'))));
  return { app, store };
}

export interface TestUser {
  email: string;
  password: string;
  accessToken: string;
  cookies: string[];
  userId: string;
}

export async function registerUser(app: Express, overrides?: { email?: string; password?: string; name?: string }): Promise<TestUser> {
  const email = overrides?.email ?? `u${randomUUID().slice(0, 8)}@example.com`;
  const password = overrides?.password ?? 'Passw0rd!';
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, name: overrides?.name ?? 'Test User' });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    email,
    password,
    accessToken: res.body.accessToken as string,
    cookies: (res.headers['set-cookie'] as string[] | undefined) ?? [],
    userId: (res.body.user as { id: string }).id,
  };
}

export function authHeader(u: TestUser): { Authorization: string } {
  return { Authorization: `Bearer ${u.accessToken}` };
}

/** SSE body se event order nikalo: ['meta','token','token',...,'done'] */
export function sseEvents(text: string): Array<{ event: string; data: string }> {
  const out: Array<{ event: string; data: string }> = [];
  const blocks = text.split('\n\n');
  for (const b of blocks) {
    const ev = b.match(/event: (\w+)/)?.[1];
    const data = b.match(/data: (.*)/s)?.[1];
    if (ev && data !== undefined) out.push({ event: ev, data });
  }
  return out;
}
