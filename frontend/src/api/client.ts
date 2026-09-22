// Typed API client: auth header, single-refresh retry, envelope errors, SSE reader.
// Auth hooks authStore register karta hai (circular import se bachne ke liye).

import type {
  ChatDone,
  Conversation,
  FileItem,
  Message,
  ModelInfo,
  Note,
  Page,
  PublicUser,
  SearchResults,
  UsageSummary,
  UserSettings,
} from './types';

// Same-origin default (dev proxy / prod nginx) — VITE_API_URL set ho to absolute.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export interface AuthHooks {
  getToken: () => string | null;
  refresh: () => Promise<string | null>;
  logout: () => void;
}

let hooks: AuthHooks | null = null;
export function setAuthHooks(h: AuthHooks): void {
  hooks = h;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(status: number, code: string, message: string, extra?: { details?: unknown; requestId?: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = extra?.details;
    this.requestId = extra?.requestId;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  const requestId = res.headers.get('x-request-id') ?? undefined;
  let code = 'INTERNAL';
  let message = `Request failed (${res.status})`;
  let details: unknown;
  try {
    const j = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    if (j?.error) {
      code = j.error.code ?? code;
      message = j.error.message ?? message;
      details = j.error.details;
    }
  } catch {
    // non-JSON (proxy/LB error page)
  }
  return new ApiError(res.status, code, message, { details, requestId });
}

interface FetchOpts {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
  _retried?: boolean;
}

async function rawFetch(path: string, opts: FetchOpts = {}): Promise<Response> {
  const token = opts.auth === false ? null : hooks?.getToken() ?? null;
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (!isForm && opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    headers['x-request-id'] = crypto.randomUUID();
  } catch {
    // old browser — server will generate
  }
  return fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    credentials: 'include', // rt cookie (refresh/logout)
    body: isForm ? (opts.body as FormData) : opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  let res = await rawFetch(path, opts);
  // 401 → single refresh → retry once (auth endpoints khud retry nahi karte)
  if (res.status === 401 && !opts._retried && opts.auth !== false && !path.startsWith('/api/auth/')) {
    const t = await hooks?.refresh().catch(() => null);
    if (t) {
      res = await rawFetch(path, { ...opts, _retried: true });
    } else {
      hooks?.logout();
    }
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- endpoints

export const api = {
  register: (b: { email: string; password: string; name?: string }) =>
    apiFetch<{ user: PublicUser; accessToken: string }>('/api/auth/register', { method: 'POST', body: b, auth: false }),
  login: (b: { email: string; password: string }) =>
    apiFetch<{ user: PublicUser; accessToken: string }>('/api/auth/login', { method: 'POST', body: b, auth: false }),
  refresh: () => apiFetch<{ accessToken: string; user: PublicUser }>('/api/auth/refresh', { method: 'POST', auth: false }),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST', auth: false }),
  me: () => apiFetch<{ user: PublicUser; settings: UserSettings }>('/api/auth/me'),

  models: () => apiFetch<{ data: ModelInfo[] }>('/api/models'),

  conversations: (q = '', page = 1, pageSize = 20) =>
    apiFetch<Page<Conversation>>(`/api/conversations?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`),
  createConversation: (b: { title?: string; model?: string }) =>
    apiFetch<Conversation>('/api/conversations', { method: 'POST', body: b }),
  conversation: (id: string, limit = 50, before?: string) =>
    apiFetch<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${id}?limit=${limit}${before ? `&before=${before}` : ''}`,
    ),
  patchConversation: (id: string, b: { title?: string; model?: string }) =>
    apiFetch<Conversation>(`/api/conversations/${id}`, { method: 'PATCH', body: b }),
  deleteConversation: (id: string) => apiFetch<{ deleted: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' }),
  messages: (id: string, limit = 50, before?: string) =>
    apiFetch<{ messages: Message[]; hasMore: boolean }>(
      `/api/conversations/${id}/messages?limit=${limit}${before ? `&before=${before}` : ''}`,
    ),

  notes: (params: { q?: string; tag?: string; page?: number; pageSize?: number } = {}) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.tag) sp.set('tag', params.tag);
    sp.set('page', String(params.page ?? 1));
    sp.set('pageSize', String(params.pageSize ?? 20));
    return apiFetch<Page<Note>>(`/api/notes?${sp.toString()}`);
  },
  createNote: (b: { title: string; content?: string; tags?: string[]; pinned?: boolean }) =>
    apiFetch<Note>('/api/notes', { method: 'POST', body: b }),
  patchNote: (id: string, b: Partial<{ title: string; content: string; tags: string[]; pinned: boolean }>) =>
    apiFetch<Note>(`/api/notes/${id}`, { method: 'PATCH', body: b }),
  deleteNote: (id: string) => apiFetch<{ deleted: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),

  search: (q: string, limit = 8) =>
    apiFetch<SearchResults>(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  files: (page = 1, pageSize = 20) => apiFetch<Page<FileItem>>(`/api/files?page=${page}&pageSize=${pageSize}`),
  deleteFile: (id: string) => apiFetch<{ deleted: boolean }>(`/api/files/${id}`, { method: 'DELETE' }),

  usage: (days = 30) => apiFetch<UsageSummary>(`/api/usage/summary?days=${days}`),

  settings: () => apiFetch<UserSettings>('/api/settings'),
  putSettings: (b: Omit<UserSettings, 'userId' | 'updatedAt'>) =>
    apiFetch<UserSettings>('/api/settings', { method: 'PUT', body: b }),
  deleteAccount: () => apiFetch<{ deleted: boolean }>('/api/settings/account', { method: 'DELETE', body: { confirm: 'DELETE' } }),
};

export async function uploadFile(file: File): Promise<FileItem> {
  const form = new FormData();
  form.append('file', file, file.name);
  return apiFetch<FileItem>('/api/files', { method: 'POST', body: form });
}

export async function downloadFileBlob(id: string, onProgress?: (pct: number) => void): Promise<Blob> {
  const token = hooks?.getToken();
  const res = await fetch(`${API_BASE}/api/files/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw await parseError(res);
  if (!res.body) return res.blob();
  // Progress-aware read
  const total = Number(res.headers.get('content-length') ?? 0);
  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (total && onProgress) onProgress(Math.round((loaded / total) * 100));
  }
  const type = res.headers.get('content-type') ?? 'application/octet-stream';
  return new Blob(chunks, { type });
}

// ---------------------------------------------------------------- SSE chat

export interface StreamCallbacks {
  onMeta: (m: { conversationId: string; userMessageId?: string; model: string }) => void;
  onToken: (text: string) => void;
  onDone: (d: ChatDone) => void;
  onError: (e: ApiError | Error) => void;
}

export async function streamChat(
  body: { conversationId: string | null; model: string; message: string },
  cb: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const idem = crypto.randomUUID();
  const doRequest = async (retried: boolean): Promise<Response> => {
    const token = hooks?.getToken();
    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idem,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401 && !retried) {
      const t = await hooks?.refresh().catch(() => null);
      if (t) return doRequest(true);
      hooks?.logout();
    }
    return res;
  };

  let res: Response;
  try {
    res = await doRequest(false);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return; // user stopped — not an error
    cb.onError(err as Error);
    return;
  }
  if (!res.ok || !res.body) {
    cb.onError(await parseError(res));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const blocks = buf.split('\n\n');
      buf = blocks.pop() ?? '';
      for (const b of blocks) {
        const ev = b.match(/event: (\w+)/)?.[1];
        const dataStr = b.match(/data: (.*)/s)?.[1];
        if (!ev || dataStr === undefined) continue;
        try {
          const data = JSON.parse(dataStr) as Record<string, unknown>;
          if (ev === 'meta') cb.onMeta(data as unknown as { conversationId: string; model: string });
          else if (ev === 'token') cb.onToken((data as { text: string }).text);
          else if (ev === 'done') cb.onDone(data as unknown as ChatDone);
          else if (ev === 'error') {
            cb.onError(new ApiError(502, 'AI_UPSTREAM_ERROR', 'AI provider temporarily unavailable'));
            return;
          }
        } catch {
          // partial JSON — ignore
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    cb.onError(err as Error);
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** User-friendly message for toasts/inline errors (technical codes chhupao). */
export function friendlyMessage(e: unknown): string {
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'QUOTA_EXCEEDED':
        return 'Daily AI quota finished — kal phir try karo.';
      case 'RATE_LIMITED':
        return 'Bahut tez! Thoda ruk kar retry karo.';
      case 'AI_UPSTREAM_ERROR':
        return 'AI service busy hai — thodi der me retry karo.';
      case 'FILE_TOO_LARGE':
        return 'File bahut badi hai (max 15MB).';
      case 'UNSUPPORTED_FILE':
        return 'Ye file type allowed nahi hai.';
      case 'TOKEN_EXPIRED':
        return 'Session expire — dobara login karo.';
      case 'UNAUTHORIZED':
        // Backend message already generic-safe ("Invalid email or password") — use as-is.
        return e.message;
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : 'Something went wrong';
}
