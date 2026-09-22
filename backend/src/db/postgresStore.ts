// Production store — PostgreSQL 16 (doc 07). Migrate-on-boot (idempotent schema.sql).
// NOTE(doc-11 risk #1): SQL carefully reviewed; live-PG integration run staging gate me verify karo.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';
import { config } from '../config';
import type { PageParams } from '../utils/pagination';
import { conflict } from '../utils/errors';
import type {
  Conversation,
  FileMeta,
  Message,
  Note,
  RefreshTokenRow,
  SearchResults,
  UsageEvent,
  UsageSummary,
  User,
  UserSettings,
} from './types';
import type { CreateUserInput, ListResult, Store } from './store';

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function toUser(r: Record<string, unknown>): User {
  return {
    id: r.id as string,
    email: r.email as string,
    passwordHash: (r.password_hash as string) ?? null,
    name: (r.name as string) ?? '',
    avatarUrl: (r.avatar_url as string) ?? null,
    provider: r.provider as User['provider'],
    providerSub: (r.provider_sub as string) ?? null,
    role: (r.role as string) as User['role'],
    createdAt: iso(r.created_at as Date),
    lastLoginAt: r.last_login_at ? iso(r.last_login_at as Date) : null,
  };
}

function toRefresh(r: Record<string, unknown>): RefreshTokenRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    tokenHash: r.token_hash as string,
    familyId: r.family_id as string,
    userAgent: (r.user_agent as string) ?? null,
    ip: (r.ip as string) ?? null,
    expiresAt: iso(r.expires_at as Date),
    revokedAt: r.revoked_at ? iso(r.revoked_at as Date) : null,
    createdAt: iso(r.created_at as Date),
  };
}

function toSettings(r: Record<string, unknown>): UserSettings {
  return {
    userId: r.user_id as string,
    theme: r.theme as UserSettings['theme'],
    defaultModel: r.default_model as string,
    temperature: Number(r.temperature),
    maxTokens: Number(r.max_tokens),
    emailNotifs: Boolean(r.email_notifs),
    updatedAt: iso(r.updated_at as Date),
  };
}

function toConv(r: Record<string, unknown>): Conversation {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    title: r.title as string,
    model: r.model as string,
    messageCount: Number(r.message_count),
    createdAt: iso(r.created_at as Date),
    updatedAt: iso(r.updated_at as Date),
  };
}

function toMsg(r: Record<string, unknown>): Message {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    userId: r.user_id as string,
    role: r.role as Message['role'],
    content: r.content as string,
    model: (r.model as string) ?? null,
    promptTokens: Number(r.prompt_tokens),
    completionTokens: Number(r.completion_tokens),
    createdAt: iso(r.created_at as Date),
  };
}

function toNote(r: Record<string, unknown>): Note {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    title: r.title as string,
    content: r.content as string,
    tags: (r.tags as string[]) ?? [],
    pinned: Boolean(r.pinned),
    createdAt: iso(r.created_at as Date),
    updatedAt: iso(r.updated_at as Date),
  };
}

function toFile(r: Record<string, unknown>): FileMeta {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    name: r.name as string,
    mime: r.mime as string,
    sizeBytes: Number(r.size_bytes),
    storageKey: r.storage_key as string,
    sha256: r.sha256 as string,
    createdAt: iso(r.created_at as Date),
  };
}

export class PostgresStore implements Store {
  private pool: Pool;

  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      statement_timeout: 10000,
      ssl: config.isProd ? { rejectUnauthorized: config.pgRejectUnauthorized } : undefined,
    });
  }

  /** Idempotent DDL apply. Deploy-time par ek baar chalta hai (index.ts). */
  async migrate(): Promise<void> {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private isUniqueViolation(err: unknown): boolean {
    return !!err && typeof err === 'object' && 'code' in err && err.code === '23505';
  }

  // ---- users ----
  async createUser(input: CreateUserInput): Promise<User> {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO users (email, password_hash, name, provider, provider_sub)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [input.email, input.passwordHash, input.name, input.provider, input.providerSub],
      );
      await this.pool.query(
        `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
        [rows[0].id],
      );
      return toUser(rows[0]);
    } catch (err) {
      if (this.isUniqueViolation(err)) throw conflict('Email already registered');
      throw err;
    }
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const { rows } = await this.pool.query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const { rows } = await this.pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async updateUserLogin(id: string): Promise<void> {
    await this.pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);
  }

  async deleteUserCascade(id: string): Promise<FileMeta[]> {
    const files = await this.pool.query(`SELECT * FROM files WHERE user_id = $1`, [id]);
    await this.pool.query(`DELETE FROM users WHERE id = $1`, [id]); // cascades all
    return files.rows.map(toFile);
  }

  // ---- settings ----
  async getSettings(userId: string): Promise<UserSettings> {
    const { rows } = await this.pool.query(`SELECT * FROM user_settings WHERE user_id = $1`, [userId]);
    if (rows[0]) return toSettings(rows[0]);
    const ins = await this.pool.query(`INSERT INTO user_settings (user_id) VALUES ($1) RETURNING *`, [userId]);
    return toSettings(ins.rows[0]);
  }

  async putSettings(userId: string, s: Omit<UserSettings, 'userId' | 'updatedAt'>): Promise<UserSettings> {
    const { rows } = await this.pool.query(
      `INSERT INTO user_settings (user_id, theme, default_model, temperature, max_tokens, email_notifs, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (user_id) DO UPDATE SET theme=$2, default_model=$3, temperature=$4,
         max_tokens=$5, email_notifs=$6, updated_at=now() RETURNING *`,
      [userId, s.theme, s.defaultModel, s.temperature, s.maxTokens, s.emailNotifs],
    );
    return toSettings(rows[0]);
  }

  // ---- refresh tokens ----
  async saveRefreshToken(row: {
    userId: string;
    tokenHash: string;
    familyId: string;
    userAgent: string | null;
    ip: string | null;
    expiresAt: string;
  }): Promise<RefreshTokenRow> {
    const { rows } = await this.pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, family_id, user_agent, ip, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [row.userId, row.tokenHash, row.familyId, row.userAgent, row.ip, row.expiresAt],
    );
    return toRefresh(rows[0]);
  }

  async findRefreshByHash(hash: string): Promise<RefreshTokenRow | null> {
    const { rows } = await this.pool.query(`SELECT * FROM refresh_tokens WHERE token_hash = $1`, [hash]);
    return rows[0] ? toRefresh(rows[0]) : null;
  }

  async revokeRefresh(id: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [id]);
  }

  async revokeRefreshFamily(familyId: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [familyId]);
  }

  async revokeAllUserRefresh(userId: string): Promise<void> {
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  }

  async purgeExpired(): Promise<number> {
    const { rowCount } = await this.pool.query(`DELETE FROM refresh_tokens WHERE expires_at < now()`);
    return rowCount ?? 0;
  }

  // ---- conversations ----
  async createConversation(userId: string, title: string, model: string): Promise<Conversation> {
    const { rows } = await this.pool.query(
      `INSERT INTO conversations (user_id, title, model) VALUES ($1, $2, $3) RETURNING *`,
      [userId, title, model],
    );
    return toConv(rows[0]);
  }

  async listConversations(userId: string, q: string, p: PageParams): Promise<ListResult<Conversation>> {
    const like = q ? `%${escapeLike(q)}%` : null;
    const where = like ? `user_id = $1 AND title ILIKE $2 ESCAPE '\\'` : `user_id = $1`;
    const params = like ? [userId, like] : [userId];
    const total = await this.pool.query(`SELECT count(*)::int AS c FROM conversations WHERE ${where}`, params);
    const { rows } = await this.pool.query(
      `SELECT * FROM conversations WHERE ${where} ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, p.pageSize, (p.page - 1) * p.pageSize],
    );
    return { items: rows.map(toConv), total: total.rows[0].c as number };
  }

  async getConversation(userId: string, id: string): Promise<Conversation | null> {
    const { rows } = await this.pool.query(`SELECT * FROM conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ? toConv(rows[0]) : null;
  }

  async updateConversation(
    userId: string,
    id: string,
    patch: { title?: string; model?: string },
  ): Promise<Conversation | null> {
    const { rows } = await this.pool.query(
      `UPDATE conversations SET title = COALESCE($3, title), model = COALESCE($4, model), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, patch.title ?? null, patch.model ?? null],
    );
    return rows[0] ? toConv(rows[0]) : null;
  }

  async deleteConversation(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM conversations WHERE id = $1 AND user_id = $2`, [id, userId]);
    return (rowCount ?? 0) > 0;
  }

  // ---- messages ----
  async addMessage(input: {
    conversationId: string;
    userId: string;
    role: Message['role'];
    content: string;
    model?: string | null;
    promptTokens?: number;
    completionTokens?: number;
  }): Promise<Message> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO messages (conversation_id, user_id, role, content, model, prompt_tokens, completion_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [input.conversationId, input.userId, input.role, input.content, input.model ?? null, input.promptTokens ?? 0, input.completionTokens ?? 0],
      );
      await client.query(
        `UPDATE conversations SET message_count = message_count + 1, updated_at = now() WHERE id = $1`,
        [input.conversationId],
      );
      await client.query('COMMIT');
      return toMsg(rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listMessages(
    conversationId: string,
    userId: string,
    opts: { before?: string; limit: number },
  ): Promise<Message[]> {
    const { rows } = await this.pool.query(
      `SELECT m.* FROM messages m
       WHERE m.conversation_id = $1 AND m.user_id = $2
         AND ($3::uuid IS NULL OR (m.created_at, m.id) < (SELECT created_at, id FROM messages WHERE id = $3))
       ORDER BY m.created_at ASC, m.id ASC LIMIT $4`,
      [conversationId, userId, opts.before ?? null, opts.limit],
    );
    // cursor semantics: latest-first page chahiye to route `before` loop karta hai;
    // yahan ASC tail return karte hain taaki UI order stable rahe.
    return rows.map(toMsg);
  }

  async bumpConversationActivity(conversationId: string): Promise<void> {
    await this.pool.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId]);
  }

  // ---- notes ----
  async createNote(
    userId: string,
    input: { title: string; content: string; tags: string[]; pinned: boolean },
  ): Promise<Note> {
    const { rows } = await this.pool.query(
      `INSERT INTO notes (user_id, title, content, tags, pinned) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, input.title, input.content, input.tags, input.pinned],
    );
    return toNote(rows[0]);
  }

  async listNotes(userId: string, opts: { q: string; tag: string; p: PageParams }): Promise<ListResult<Note>> {
    const like = opts.q ? `%${escapeLike(opts.q)}%` : null;
    const conds = [`user_id = $1`];
    const params: unknown[] = [userId];
    if (like) {
      params.push(like);
      conds.push(`(title ILIKE $${params.length} ESCAPE '\\' OR content ILIKE $${params.length} ESCAPE '\\')`);
    }
    if (opts.tag) {
      params.push(opts.tag);
      conds.push(`$${params.length} = ANY(tags)`);
    }
    const where = conds.join(' AND ');
    const total = await this.pool.query(`SELECT count(*)::int AS c FROM notes WHERE ${where}`, params);
    const { rows } = await this.pool.query(
      `SELECT * FROM notes WHERE ${where} ORDER BY pinned DESC, updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, opts.p.pageSize, (opts.p.page - 1) * opts.p.pageSize],
    );
    return { items: rows.map(toNote), total: total.rows[0].c as number };
  }

  async getNote(userId: string, id: string): Promise<Note | null> {
    const { rows } = await this.pool.query(`SELECT * FROM notes WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ? toNote(rows[0]) : null;
  }

  async updateNote(
    userId: string,
    id: string,
    patch: { title?: string; content?: string; tags?: string[]; pinned?: boolean },
  ): Promise<Note | null> {
    const { rows } = await this.pool.query(
      `UPDATE notes SET title = COALESCE($3, title), content = COALESCE($4, content),
         tags = COALESCE($5, tags), pinned = COALESCE($6, pinned), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, patch.title ?? null, patch.content ?? null, patch.tags ?? null, patch.pinned ?? null],
    );
    return rows[0] ? toNote(rows[0]) : null;
  }

  async deleteNote(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM notes WHERE id = $1 AND user_id = $2`, [id, userId]);
    return (rowCount ?? 0) > 0;
  }

  // ---- files ----
  async saveFile(meta: Omit<FileMeta, 'id' | 'createdAt'>): Promise<FileMeta> {
    const { rows } = await this.pool.query(
      `INSERT INTO files (user_id, name, mime, size_bytes, storage_key, sha256)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [meta.userId, meta.name, meta.mime, meta.sizeBytes, meta.storageKey, meta.sha256],
    );
    return toFile(rows[0]);
  }

  async listFiles(userId: string, p: PageParams): Promise<ListResult<FileMeta>> {
    const total = await this.pool.query(`SELECT count(*)::int AS c FROM files WHERE user_id = $1`, [userId]);
    const { rows } = await this.pool.query(
      `SELECT * FROM files WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [userId, p.pageSize, (p.page - 1) * p.pageSize],
    );
    return { items: rows.map(toFile), total: total.rows[0].c as number };
  }

  async getFile(userId: string, id: string): Promise<FileMeta | null> {
    const { rows } = await this.pool.query(`SELECT * FROM files WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ? toFile(rows[0]) : null;
  }

  async deleteFile(userId: string, id: string): Promise<FileMeta | null> {
    const { rows } = await this.pool.query(`DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId]);
    return rows[0] ? toFile(rows[0]) : null;
  }

  async storageUsedBytes(userId: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(sum(size_bytes), 0)::bigint AS s FROM files WHERE user_id = $1`,
      [userId],
    );
    return Number(rows[0].s);
  }

  // ---- usage ----
  async recordUsage(e: {
    userId: string;
    conversationId: string | null;
    model: string;
    promptTokens: number;
    completionTokens: number;
    estCostUsd: number;
  }): Promise<UsageEvent> {
    const { rows } = await this.pool.query(
      `INSERT INTO usage_events (user_id, conversation_id, model, prompt_tokens, completion_tokens, est_cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [e.userId, e.conversationId, e.model, e.promptTokens, e.completionTokens, e.estCostUsd],
    );
    const r = rows[0];
    return {
      id: String(r.id),
      userId: r.user_id as string,
      conversationId: (r.conversation_id as string) ?? null,
      model: r.model as string,
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      estCostUsd: Number(r.est_cost_usd),
      createdAt: iso(r.created_at as Date),
    };
  }

  async usageSummary(userId: string, days: number, quotaLimit: number): Promise<UsageSummary> {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const totals = await this.pool.query(
      `SELECT count(*)::int AS requests, COALESCE(sum(prompt_tokens),0)::int AS pt,
              COALESCE(sum(completion_tokens),0)::int AS ct, COALESCE(sum(est_cost_usd),0)::float AS cost
       FROM usage_events WHERE user_id = $1 AND created_at >= $2`,
      [userId, since],
    );
    const byDay = await this.pool.query(
      `SELECT to_char(created_at, 'YYYY-MM-DD') AS date, count(*)::int AS requests,
              (COALESCE(sum(prompt_tokens),0) + COALESCE(sum(completion_tokens),0))::int AS total_tokens,
              COALESCE(sum(est_cost_usd),0)::float AS cost
       FROM usage_events WHERE user_id = $1 AND created_at >= $2 GROUP BY 1 ORDER BY 1`,
      [userId, since],
    );
    const byModel = await this.pool.query(
      `SELECT model, count(*)::int AS requests,
              (COALESCE(sum(prompt_tokens),0) + COALESCE(sum(completion_tokens),0))::int AS total_tokens,
              COALESCE(sum(est_cost_usd),0)::float AS cost
       FROM usage_events WHERE user_id = $1 AND created_at >= $2 GROUP BY model ORDER BY requests DESC`,
      [userId, since],
    );
    const used = await this.tokensUsedSince(userId, new Date(Date.now() - 86400000).toISOString());
    const t = totals.rows[0];
    const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
    return {
      days,
      totals: {
        requests: t.requests as number,
        promptTokens: t.pt as number,
        completionTokens: t.ct as number,
        totalTokens: (t.pt as number) + (t.ct as number),
        estCostUsd: round6(t.cost as number),
      },
      byDay: byDay.rows.map((r) => ({
        date: r.date as string,
        requests: r.requests as number,
        totalTokens: r.total_tokens as number,
        estCostUsd: round6(r.cost as number),
      })),
      byModel: byModel.rows.map((r) => ({
        model: r.model as string,
        requests: r.requests as number,
        totalTokens: r.total_tokens as number,
        estCostUsd: round6(r.cost as number),
      })),
      quota: { limit: quotaLimit, used, remaining: Math.max(0, quotaLimit - used) },
    };
  }

  async tokensUsedSince(userId: string, sinceIso: string): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT (COALESCE(sum(prompt_tokens),0) + COALESCE(sum(completion_tokens),0))::int AS s
       FROM usage_events WHERE user_id = $1 AND created_at >= $2`,
      [userId, sinceIso],
    );
    return rows[0].s as number;
  }

  // ---- search (keyword ILIKE; trigram/FTS upgrade Phase-2) ----
  async search(userId: string, q: string, types: string[], limit: number): Promise<SearchResults> {
    const like = `%${escapeLike(q)}%`;
    const out: SearchResults = { q, results: { conversations: [], notes: [], files: [] } };
    if (types.includes('conversations')) {
      const { rows } = await this.pool.query(
        `SELECT id, title, updated_at FROM conversations
         WHERE user_id = $1 AND title ILIKE $2 ESCAPE '\\' ORDER BY updated_at DESC LIMIT $3`,
        [userId, like, limit],
      );
      const found = rows.map((r) => ({
        id: r.id as string,
        title: r.title as string,
        snippet: (r.title as string).slice(0, 200),
        updatedAt: iso(r.updated_at as Date),
      }));
      if (found.length < limit) {
        const seen = new Set(found.map((f) => f.id));
        const msgs = await this.pool.query(
          `SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.content, c.title, c.updated_at
           FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE m.user_id = $1 AND m.content ILIKE $2 ESCAPE '\\' ORDER BY m.conversation_id, m.created_at DESC LIMIT $3`,
          [userId, like, limit],
        );
        for (const m of msgs.rows) {
          if (found.length >= limit) break;
          const cid = m.conversation_id as string;
          if (seen.has(cid)) continue;
          seen.add(cid);
          found.push({
            id: cid,
            title: m.title as string,
            snippet: snippet((m.content as string) ?? '', q),
            updatedAt: iso(m.updated_at as Date),
          });
        }
      }
      out.results.conversations = found;
    }
    if (types.includes('notes')) {
      const { rows } = await this.pool.query(
        `SELECT id, title, content, updated_at FROM notes
         WHERE user_id = $1 AND (title ILIKE $2 ESCAPE '\\' OR content ILIKE $2 ESCAPE '\\')
         ORDER BY updated_at DESC LIMIT $3`,
        [userId, like, limit],
      );
      out.results.notes = rows.map((r) => {
        const title = r.title as string;
        const content = (r.content as string) ?? '';
        const hay = title.toLowerCase().includes(q.toLowerCase()) ? title : content;
        return { id: r.id as string, title, snippet: snippet(hay, q), updatedAt: iso(r.updated_at as Date) };
      });
    }
    if (types.includes('files')) {
      const { rows } = await this.pool.query(
        `SELECT id, name, mime, size_bytes, created_at FROM files
         WHERE user_id = $1 AND name ILIKE $2 ESCAPE '\\' ORDER BY created_at DESC LIMIT $3`,
        [userId, like, limit],
      );
      out.results.files = rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
        mime: r.mime as string,
        sizeBytes: Number(r.size_bytes),
        createdAt: iso(r.created_at as Date),
      }));
    }
    return out;
  }

  // ---- idempotency ----
  async getIdempotency(userId: string, key: string): Promise<{ route: string; response: unknown } | null> {
    const { rows } = await this.pool.query(
      `SELECT route, response FROM idempotency_keys WHERE user_id = $1 AND key = $2 AND created_at > now() - interval '24 hours'`,
      [userId, key],
    );
    return rows[0] ? { route: rows[0].route as string, response: rows[0].response as unknown } : null;
  }

  async setIdempotency(userId: string, key: string, route: string, response: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO idempotency_keys (key, user_id, route, response) VALUES ($1, $2, $3, $4)
       ON CONFLICT (key, user_id) DO UPDATE SET route = $3, response = $4, created_at = now()`,
      [key, userId, route, JSON.stringify(response)],
    );
    await this.pool.query(`DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'`);
  }
}

function snippet(text: string, q: string, len = 200): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text.slice(0, len);
  const start = Math.max(0, idx - 60);
  const s = text.slice(start, start + len);
  return (start > 0 ? '…' : '') + s + (start + len < text.length ? '…' : '');
}
