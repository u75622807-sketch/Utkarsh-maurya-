// Domain entities (doc 07). Store implementations (memory/postgres) inhi par based hain.

export type Provider = 'local' | 'google';
export type Role = 'user' | 'admin';
export type MessageRole = 'user' | 'assistant' | 'system';
export type Theme = 'light' | 'dark' | 'system';

export interface User {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string;
  avatarUrl: string | null;
  provider: Provider;
  providerSub: string | null;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: Provider;
  role: Role;
  createdAt: string;
  lastLoginAt: string | null;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    provider: u.provider,
    role: u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

export interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  theme: Theme;
  defaultModel: string;
  temperature: number;
  maxTokens: number;
  emailNotifs: boolean;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  model: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  createdAt: string;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FileMeta {
  id: string;
  userId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  createdAt: string;
}

export interface UsageEvent {
  id: string;
  userId: string;
  conversationId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estCostUsd: number;
  createdAt: string;
}

export interface UsageSummary {
  days: number;
  totals: { requests: number; promptTokens: number; completionTokens: number; totalTokens: number; estCostUsd: number };
  byDay: Array<{ date: string; requests: number; totalTokens: number; estCostUsd: number }>;
  byModel: Array<{ model: string; requests: number; totalTokens: number; estCostUsd: number }>;
  quota: { limit: number; used: number; remaining: number };
}

export interface SearchResults {
  q: string;
  results: {
    conversations: Array<{ id: string; title: string; snippet: string; updatedAt: string }>;
    notes: Array<{ id: string; title: string; snippet: string; updatedAt: string }>;
    files: Array<{ id: string; name: string; mime: string; sizeBytes: number; createdAt: string }>;
  };
}

export function utcNow(): string {
  return new Date().toISOString();
}
