// DTOs mirror backend (doc 04). Client validation = UX only; server zod = truth.

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  provider: 'local' | 'google';
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserSettings {
  userId: string;
  theme: 'light' | 'dark' | 'system';
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
  role: 'user' | 'assistant' | 'system';
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

export interface FileItem {
  id: string;
  userId: string;
  name: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  contextWindow: number;
  maxOutput: number;
  costPer1k: { in: number; out: number };
  enabled: boolean;
  description: string;
}

export interface UsageSummary {
  days: number;
  totals: { requests: number; promptTokens: number; completionTokens: number; totalTokens: number; estCostUsd: number };
  byDay: Array<{ date: string; requests: number; totalTokens: number; estCostUsd: number }>;
  byModel: Array<{ model: string; requests: number; totalTokens: number; estCostUsd: number }>;
  quota: { limit: number; used: number; remaining: number };
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SearchResults {
  q: string;
  results: {
    conversations: Array<{ id: string; title: string; snippet: string; updatedAt: string }>;
    notes: Array<{ id: string; title: string; snippet: string; updatedAt: string }>;
    files: Array<{ id: string; name: string; mime: string; sizeBytes: number; createdAt: string }>;
  };
}

export interface ChatDone {
  conversationId: string;
  message: Message;
  usage: { promptTokens: number; completionTokens: number; estCostUsd: number };
}
