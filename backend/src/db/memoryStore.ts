// Zero-config dev/test store: in-memory Maps + optional JSON persistence.
// Prod me postgresStore use hota hai — interface same (doc 02).

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { utcNow } from './types';
import type { PageParams } from '../utils/pagination';
import type { CreateUserInput, ListResult, Store } from './store';

interface Snapshot {
  users: User[];
  refresh: RefreshTokenRow[];
  settings: UserSettings[];
  conversations: Conversation[];
  messages: Message[];
  notes: Note[];
  files: FileMeta[];
  usage: UsageEvent[];
  idem: Array<{ userId: string; key: string; route: string; response: unknown; createdAt: string }>;
}

function defaultSettings(userId: string): UserSettings {
  return {
    userId,
    theme: 'system',
    defaultModel: 'mock-1',
    temperature: 0.7,
    maxTokens: 1024,
    emailNotifs: false,
    updatedAt: utcNow(),
  };
}

function snippet(text: string, q: string, len = 200): string {
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text.slice(0, len);
  const start = Math.max(0, idx - 60);
  const s = text.slice(start, start + len);
  return (start > 0 ? '…' : '') + s + (start + len < text.length ? '…' : '');
}

export class MemoryStore implements Store {
  private users = new Map<string, User>();
  private refresh = new Map<string, RefreshTokenRow>(); // id -> row
  private refreshByHash = new Map<string, string>(); // hash -> id
  private settings = new Map<string, UserSettings>();
  private convs = new Map<string, Conversation>();
  private msgs = new Map<string, Message>();
  private msgsByConv = new Map<string, string[]>(); // convId -> msgIds (insertion order)
  private notes = new Map<string, Note>();
  private files = new Map<string, FileMeta>();
  private usage: UsageEvent[] = [];
  private idem = new Map<string, { route: string; response: unknown }>(); // userId:key

  private persistPath: string | null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(opts?: { persistDir?: string | null }) {
    const dir = opts?.persistDir ?? null;
    this.persistPath = dir ? join(dir, 'db.json') : null;
    if (this.persistPath && existsSync(this.persistPath)) {
      try {
        const snap = JSON.parse(readFileSync(this.persistPath, 'utf8')) as Snapshot;
        for (const u of snap.users ?? []) this.users.set(u.id, u);
        for (const r of snap.refresh ?? []) {
          this.refresh.set(r.id, r);
          this.refreshByHash.set(r.tokenHash, r.id);
        }
        for (const s of snap.settings ?? []) this.settings.set(s.userId, s);
        for (const c of snap.conversations ?? []) this.convs.set(c.id, c);
        for (const m of snap.messages ?? []) {
          this.msgs.set(m.id, m);
          const arr = this.msgsByConv.get(m.conversationId) ?? [];
          arr.push(m.id);
          this.msgsByConv.set(m.conversationId, arr);
        }
        for (const n of snap.notes ?? []) this.notes.set(n.id, n);
        for (const f of snap.files ?? []) this.files.set(f.id, f);
        this.usage = snap.usage ?? [];
        for (const i of snap.idem ?? []) this.idem.set(`${i.userId}:${i.key}`, { route: i.route, response: i.response });
      } catch {
        // corrupt snapshot → fresh start (dev only; prod uses postgres)
      }
    }
  }

  private scheduleSave(): void {
    const persistPath = this.persistPath;
    if (!persistPath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        const snap: Snapshot = {
          users: [...this.users.values()],
          refresh: [...this.refresh.values()],
          settings: [...this.settings.values()],
          conversations: [...this.convs.values()],
          messages: [...this.msgs.values()],
          notes: [...this.notes.values()],
          files: [...this.files.values()],
          usage: this.usage.slice(-5000),
          idem: [...this.idem.entries()].map(([k, v]) => {
            const [userId, ...rest] = k.split(':');
            return { userId, key: rest.join(':'), route: v.route, response: v.response, createdAt: utcNow() };
          }),
        };
        mkdirSync(join(persistPath, '..'), { recursive: true });
        writeFileSync(persistPath, JSON.stringify(snap));
      } catch {
        // best-effort (dev only)
      }
    }, 250);
    this.saveTimer.unref?.();
  }

  // ---- users ----
  async createUser(input: CreateUserInput): Promise<User> {
    const now = utcNow();
    const u: User = {
      id: randomUUID(),
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name,
      avatarUrl: null,
      provider: input.provider,
      providerSub: input.providerSub,
      role: 'user',
      createdAt: now,
      lastLoginAt: now,
    };
    this.users.set(u.id, u);
    this.settings.set(u.id, defaultSettings(u.id));
    this.scheduleSave();
    return u;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const needle = email.toLowerCase();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === needle) return u;
    }
    return null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async updateUserLogin(id: string): Promise<void> {
    const u = this.users.get(id);
    if (u) {
      u.lastLoginAt = utcNow();
      this.scheduleSave();
    }
  }

  async deleteUserCascade(id: string): Promise<FileMeta[]> {
    const fileMetas = [...this.files.values()].filter((f) => f.userId === id);
    for (const [rid, r] of this.refresh) if (r.userId === id) {
      this.refresh.delete(rid);
      this.refreshByHash.delete(r.tokenHash);
    }
    for (const [k] of this.idem) if (k.startsWith(`${id}:`)) this.idem.delete(k);
    this.settings.delete(id);
    for (const [cid, c] of this.convs) if (c.userId === id) {
      this.convs.delete(cid);
      for (const mid of this.msgsByConv.get(cid) ?? []) this.msgs.delete(mid);
      this.msgsByConv.delete(cid);
    }
    for (const [mid, m] of this.msgs) if (m.userId === id) this.msgs.delete(mid);
    for (const [nid, n] of this.notes) if (n.userId === id) this.notes.delete(nid);
    for (const f of fileMetas) this.files.delete(f.id);
    this.usage = this.usage.filter((e) => e.userId !== id);
    this.users.delete(id);
    this.scheduleSave();
    return fileMetas;
  }

  // ---- settings ----
  async getSettings(userId: string): Promise<UserSettings> {
    let s = this.settings.get(userId);
    if (!s) {
      s = defaultSettings(userId);
      this.settings.set(userId, s);
    }
    return { ...s };
  }

  async putSettings(userId: string, s: Omit<UserSettings, 'userId' | 'updatedAt'>): Promise<UserSettings> {
    const next: UserSettings = { ...s, userId, updatedAt: utcNow() };
    this.settings.set(userId, next);
    this.scheduleSave();
    return { ...next };
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
    const full: RefreshTokenRow = { id: randomUUID(), revokedAt: null, createdAt: utcNow(), ...row };
    this.refresh.set(full.id, full);
    this.refreshByHash.set(full.tokenHash, full.id);
    this.scheduleSave();
    return full;
  }

  async findRefreshByHash(hash: string): Promise<RefreshTokenRow | null> {
    const id = this.refreshByHash.get(hash);
    return id ? (this.refresh.get(id) ?? null) : null;
  }

  async revokeRefresh(id: string): Promise<void> {
    const r = this.refresh.get(id);
    if (r && !r.revokedAt) {
      r.revokedAt = utcNow();
      this.scheduleSave();
    }
  }

  async revokeRefreshFamily(familyId: string): Promise<void> {
    let changed = false;
    for (const r of this.refresh.values()) {
      if (r.familyId === familyId && !r.revokedAt) {
        r.revokedAt = utcNow();
        changed = true;
      }
    }
    if (changed) this.scheduleSave();
  }

  async revokeAllUserRefresh(userId: string): Promise<void> {
    let changed = false;
    for (const r of this.refresh.values()) {
      if (r.userId === userId && !r.revokedAt) {
        r.revokedAt = utcNow();
        changed = true;
      }
    }
    if (changed) this.scheduleSave();
  }

  async purgeExpired(): Promise<number> {
    const now = Date.now();
    let n = 0;
    for (const [id, r] of this.refresh) {
      if (new Date(r.expiresAt).getTime() < now) {
        this.refresh.delete(id);
        this.refreshByHash.delete(r.tokenHash);
        n++;
      }
    }
    if (n) this.scheduleSave();
    return n;
  }

  // ---- conversations ----
  async createConversation(userId: string, title: string, model: string): Promise<Conversation> {
    const now = utcNow();
    const c: Conversation = { id: randomUUID(), userId, title, model, messageCount: 0, createdAt: now, updatedAt: now };
    this.convs.set(c.id, c);
    this.scheduleSave();
    return c;
  }

  async listConversations(userId: string, q: string, p: PageParams): Promise<ListResult<Conversation>> {
    const needle = q.toLowerCase();
    const all = [...this.convs.values()]
      .filter((c) => c.userId === userId && (!needle || c.title.toLowerCase().includes(needle)))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const start = (p.page - 1) * p.pageSize;
    return { items: all.slice(start, start + p.pageSize), total: all.length };
  }

  async getConversation(userId: string, id: string): Promise<Conversation | null> {
    const c = this.convs.get(id);
    return c && c.userId === userId ? c : null;
  }

  async updateConversation(
    userId: string,
    id: string,
    patch: { title?: string; model?: string },
  ): Promise<Conversation | null> {
    const c = await this.getConversation(userId, id);
    if (!c) return null;
    if (patch.title !== undefined) c.title = patch.title;
    if (patch.model !== undefined) c.model = patch.model;
    c.updatedAt = utcNow();
    this.scheduleSave();
    return { ...c };
  }

  async deleteConversation(userId: string, id: string): Promise<boolean> {
    const c = await this.getConversation(userId, id);
    if (!c) return false;
    this.convs.delete(id);
    for (const mid of this.msgsByConv.get(id) ?? []) this.msgs.delete(mid);
    this.msgsByConv.delete(id);
    this.scheduleSave();
    return true;
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
    const m: Message = {
      id: randomUUID(),
      conversationId: input.conversationId,
      userId: input.userId,
      role: input.role,
      content: input.content,
      model: input.model ?? null,
      promptTokens: input.promptTokens ?? 0,
      completionTokens: input.completionTokens ?? 0,
      createdAt: utcNow(),
    };
    this.msgs.set(m.id, m);
    const arr = this.msgsByConv.get(m.conversationId) ?? [];
    arr.push(m.id);
    this.msgsByConv.set(m.conversationId, arr);
    const c = this.convs.get(m.conversationId);
    if (c) {
      c.messageCount += 1;
      c.updatedAt = m.createdAt;
    }
    this.scheduleSave();
    return m;
  }

  async listMessages(
    conversationId: string,
    userId: string,
    opts: { before?: string; limit: number },
  ): Promise<Message[]> {
    const c = await this.getConversation(userId, conversationId);
    if (!c) return [];
    const ids = this.msgsByConv.get(conversationId) ?? [];
    let slice = ids;
    if (opts.before) {
      const idx = ids.indexOf(opts.before);
      slice = idx === -1 ? [] : ids.slice(0, idx);
    }
    const tail = slice.slice(-opts.limit);
    return tail.map((id) => this.msgs.get(id)!).filter(Boolean);
  }

  async bumpConversationActivity(conversationId: string): Promise<void> {
    const c = this.convs.get(conversationId);
    if (c) {
      c.updatedAt = utcNow();
      this.scheduleSave();
    }
  }

  // ---- notes ----
  async createNote(
    userId: string,
    input: { title: string; content: string; tags: string[]; pinned: boolean },
  ): Promise<Note> {
    const now = utcNow();
    const n: Note = { id: randomUUID(), userId, updatedAt: now, createdAt: now, ...input };
    this.notes.set(n.id, n);
    this.scheduleSave();
    return n;
  }

  async listNotes(
    userId: string,
    opts: { q: string; tag: string; p: PageParams },
  ): Promise<ListResult<Note>> {
    const needle = opts.q.toLowerCase();
    const all = [...this.notes.values()]
      .filter((n) => n.userId === userId)
      .filter((n) => !opts.tag || n.tags.includes(opts.tag))
      .filter(
        (n) =>
          !needle ||
          n.title.toLowerCase().includes(needle) ||
          n.content.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.updatedAt < b.updatedAt ? 1 : -1;
      });
    const start = (opts.p.page - 1) * opts.p.pageSize;
    return { items: all.slice(start, start + opts.p.pageSize), total: all.length };
  }

  async getNote(userId: string, id: string): Promise<Note | null> {
    const n = this.notes.get(id);
    return n && n.userId === userId ? n : null;
  }

  async updateNote(
    userId: string,
    id: string,
    patch: { title?: string; content?: string; tags?: string[]; pinned?: boolean },
  ): Promise<Note | null> {
    const n = await this.getNote(userId, id);
    if (!n) return null;
    if (patch.title !== undefined) n.title = patch.title;
    if (patch.content !== undefined) n.content = patch.content;
    if (patch.tags !== undefined) n.tags = patch.tags;
    if (patch.pinned !== undefined) n.pinned = patch.pinned;
    n.updatedAt = utcNow();
    this.scheduleSave();
    return { ...n };
  }

  async deleteNote(userId: string, id: string): Promise<boolean> {
    const n = await this.getNote(userId, id);
    if (!n) return false;
    this.notes.delete(id);
    this.scheduleSave();
    return true;
  }

  // ---- files ----
  async saveFile(meta: Omit<FileMeta, 'id' | 'createdAt'>): Promise<FileMeta> {
    const full: FileMeta = { ...meta, id: randomUUID(), createdAt: utcNow() };
    this.files.set(full.id, full);
    this.scheduleSave();
    return full;
  }

  async listFiles(userId: string, p: PageParams): Promise<ListResult<FileMeta>> {
    const all = [...this.files.values()]
      .filter((f) => f.userId === userId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const start = (p.page - 1) * p.pageSize;
    return { items: all.slice(start, start + p.pageSize), total: all.length };
  }

  async getFile(userId: string, id: string): Promise<FileMeta | null> {
    const f = this.files.get(id);
    return f && f.userId === userId ? f : null;
  }

  async deleteFile(userId: string, id: string): Promise<FileMeta | null> {
    const f = await this.getFile(userId, id);
    if (!f) return null;
    this.files.delete(id);
    this.scheduleSave();
    return f;
  }

  async storageUsedBytes(userId: string): Promise<number> {
    let sum = 0;
    for (const f of this.files.values()) if (f.userId === userId) sum += f.sizeBytes;
    return sum;
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
    const full: UsageEvent = { ...e, id: randomUUID(), createdAt: utcNow() };
    this.usage.push(full);
    this.scheduleSave();
    return full;
  }

  async usageSummary(userId: string, days: number, quotaLimit: number): Promise<UsageSummary> {
    const since = Date.now() - days * 86400000;
    const events = this.usage.filter((e) => e.userId === userId && new Date(e.createdAt).getTime() >= since);
    const totals = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, estCostUsd: 0 };
    const byDay = new Map<string, { requests: number; totalTokens: number; estCostUsd: number }>();
    const byModel = new Map<string, { requests: number; totalTokens: number; estCostUsd: number }>();
    for (const e of events) {
      totals.requests += 1;
      totals.promptTokens += e.promptTokens;
      totals.completionTokens += e.completionTokens;
      totals.totalTokens += e.promptTokens + e.completionTokens;
      totals.estCostUsd += e.estCostUsd;
      const day = e.createdAt.slice(0, 10);
      const d = byDay.get(day) ?? { requests: 0, totalTokens: 0, estCostUsd: 0 };
      d.requests += 1;
      d.totalTokens += e.promptTokens + e.completionTokens;
      d.estCostUsd += e.estCostUsd;
      byDay.set(day, d);
      const m = byModel.get(e.model) ?? { requests: 0, totalTokens: 0, estCostUsd: 0 };
      m.requests += 1;
      m.totalTokens += e.promptTokens + e.completionTokens;
      m.estCostUsd += e.estCostUsd;
      byModel.set(e.model, m);
    }
    totals.estCostUsd = round6(totals.estCostUsd);
    // quota: last 24h tokens
    const used = await this.tokensUsedSince(userId, new Date(Date.now() - 86400000).toISOString());
    return {
      days,
      totals,
      byDay: [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, v]) => ({ date, ...v, estCostUsd: round6(v.estCostUsd) })),
      byModel: [...byModel.entries()].map(([model, v]) => ({ model, ...v, estCostUsd: round6(v.estCostUsd) })),
      quota: { limit: quotaLimit, used, remaining: Math.max(0, quotaLimit - used) },
    };
  }

  async tokensUsedSince(userId: string, sinceIso: string): Promise<number> {
    const since = new Date(sinceIso).getTime();
    let sum = 0;
    for (const e of this.usage) {
      if (e.userId === userId && new Date(e.createdAt).getTime() >= since) {
        sum += e.promptTokens + e.completionTokens;
      }
    }
    return sum;
  }

  // ---- search (keyword, Phase-1) ----
  async search(userId: string, q: string, types: string[], limit: number): Promise<SearchResults> {
    const needle = q.toLowerCase();
    const out: SearchResults = {
      q,
      results: { conversations: [], notes: [], files: [] },
    };
    if (types.includes('conversations')) {
      const convs = [...this.convs.values()]
        .filter((c) => c.userId === userId && c.title.toLowerCase().includes(needle))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, limit)
        .map((c) => ({ id: c.id, title: c.title, snippet: snippet(c.title, q), updatedAt: c.updatedAt }));
      // message content me bhi dhoondo (conversation-level result)
      if (convs.length < limit) {
        const seen = new Set(convs.map((c) => c.id));
        for (const m of this.msgs.values()) {
          if (convs.length >= limit) break;
          if (m.userId !== userId || !m.content.toLowerCase().includes(needle)) continue;
          const c = this.convs.get(m.conversationId);
          if (!c || seen.has(c.id)) continue;
          seen.add(c.id);
          convs.push({ id: c.id, title: c.title, snippet: snippet(m.content, q), updatedAt: c.updatedAt });
        }
      }
      out.results.conversations = convs;
    }
    if (types.includes('notes')) {
      out.results.notes = [...this.notes.values()]
        .filter(
          (n) =>
            n.userId === userId &&
            (n.title.toLowerCase().includes(needle) || n.content.toLowerCase().includes(needle)),
        )
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, limit)
        .map((n) => ({
          id: n.id,
          title: n.title,
          snippet: snippet(n.title.toLowerCase().includes(needle) ? n.title : n.content, q),
          updatedAt: n.updatedAt,
        }));
    }
    if (types.includes('files')) {
      out.results.files = [...this.files.values()]
        .filter((f) => f.userId === userId && f.name.toLowerCase().includes(needle))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
        .map((f) => ({ id: f.id, name: f.name, mime: f.mime, sizeBytes: f.sizeBytes, createdAt: f.createdAt }));
    }
    return out;
  }

  // ---- idempotency ----
  async getIdempotency(userId: string, key: string): Promise<{ route: string; response: unknown } | null> {
    return this.idem.get(`${userId}:${key}`) ?? null;
  }

  async setIdempotency(userId: string, key: string, route: string, response: unknown): Promise<void> {
    this.idem.set(`${userId}:${key}`, { route, response });
    this.scheduleSave();
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
