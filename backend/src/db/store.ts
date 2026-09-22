// Repository interface — business code sirf isko janta hai (doc 02: ports & adapters).
// Implementations: memoryStore (dev/test) aur postgresStore (prod).

import type {
  Conversation,
  FileMeta,
  Message,
  MessageRole,
  Note,
  Provider,
  RefreshTokenRow,
  SearchResults,
  UsageEvent,
  UsageSummary,
  User,
  UserSettings,
} from './types';
import type { PageParams } from '../utils/pagination';

export interface CreateUserInput {
  email: string;
  passwordHash: string | null;
  name: string;
  provider: Provider;
  providerSub: string | null;
}

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface Store {
  // ---- users ----
  createUser(input: CreateUserInput): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  updateUserLogin(id: string): Promise<void>;
  deleteUserCascade(id: string): Promise<FileMeta[]>; // returns file metas taaki bytes bhi delete ho sakein

  // ---- settings ----
  getSettings(userId: string): Promise<UserSettings>;
  putSettings(userId: string, s: Omit<UserSettings, 'userId' | 'updatedAt'>): Promise<UserSettings>;

  // ---- refresh tokens ----
  saveRefreshToken(row: {
    userId: string;
    tokenHash: string;
    familyId: string;
    userAgent: string | null;
    ip: string | null;
    expiresAt: string;
  }): Promise<RefreshTokenRow>;
  findRefreshByHash(hash: string): Promise<RefreshTokenRow | null>;
  revokeRefresh(id: string): Promise<void>;
  revokeRefreshFamily(familyId: string): Promise<void>;
  revokeAllUserRefresh(userId: string): Promise<void>;
  purgeExpired(): Promise<number>;

  // ---- conversations ----
  createConversation(userId: string, title: string, model: string): Promise<Conversation>;
  listConversations(userId: string, q: string, p: PageParams): Promise<ListResult<Conversation>>;
  getConversation(userId: string, id: string): Promise<Conversation | null>;
  updateConversation(
    userId: string,
    id: string,
    patch: { title?: string; model?: string },
  ): Promise<Conversation | null>;
  deleteConversation(userId: string, id: string): Promise<boolean>;

  // ---- messages ----
  addMessage(input: {
    conversationId: string;
    userId: string;
    role: MessageRole;
    content: string;
    model?: string | null;
    promptTokens?: number;
    completionTokens?: number;
  }): Promise<Message>;
  listMessages(conversationId: string, userId: string, opts: { before?: string; limit: number }): Promise<Message[]>;
  bumpConversationActivity(conversationId: string): Promise<void>;

  // ---- notes ----
  createNote(userId: string, input: { title: string; content: string; tags: string[]; pinned: boolean }): Promise<Note>;
  listNotes(userId: string, opts: { q: string; tag: string; p: PageParams }): Promise<ListResult<Note>>;
  getNote(userId: string, id: string): Promise<Note | null>;
  updateNote(
    userId: string,
    id: string,
    patch: { title?: string; content?: string; tags?: string[]; pinned?: boolean },
  ): Promise<Note | null>;
  deleteNote(userId: string, id: string): Promise<boolean>;

  // ---- files ----
  saveFile(meta: Omit<FileMeta, 'id' | 'createdAt'>): Promise<FileMeta>;
  listFiles(userId: string, p: PageParams): Promise<ListResult<FileMeta>>;
  getFile(userId: string, id: string): Promise<FileMeta | null>;
  deleteFile(userId: string, id: string): Promise<FileMeta | null>;
  storageUsedBytes(userId: string): Promise<number>;

  // ---- usage ----
  recordUsage(e: {
    userId: string;
    conversationId: string | null;
    model: string;
    promptTokens: number;
    completionTokens: number;
    estCostUsd: number;
  }): Promise<UsageEvent>;
  usageSummary(userId: string, days: number, quotaLimit: number): Promise<UsageSummary>;
  tokensUsedSince(userId: string, sinceIso: string): Promise<number>;

  // ---- search ----
  search(userId: string, q: string, types: string[], limit: number): Promise<SearchResults>;

  // ---- idempotency ----
  getIdempotency(userId: string, key: string): Promise<{ route: string; response: unknown } | null>;
  setIdempotency(userId: string, key: string, route: string, response: unknown): Promise<void>;
}
