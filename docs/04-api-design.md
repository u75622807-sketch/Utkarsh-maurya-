# 04 — API Design

Base URL: `{API}/api` · Auth: `Authorization: Bearer <access>` (refresh = httpOnly cookie `rt`).
Har response me `x-request-id`. Errors ka ek hi envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "requestId": "…", "details": {} } }
```

## Conventions
- JSON everywhere; `POST /chat/stream` SSE (`text/event-stream`) hai.
- Pagination: `?page=1&pageSize=20` (max 100) → `{ data, page, pageSize, total, totalPages }`.
- Timestamps ISO-8601 UTC. IDs: `uuidv4` strings.
- Rate-limit headers: IETF draft-7 combined `RateLimit: limit=…, remaining=…, reset=…` + `RateLimit-Policy`. 429 par `Retry-After`.
- Idempotency: `POST /chat/*` par optional `Idempotency-Key` (24h, same-user) — double-send safe.

## Endpoints

### System
| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/health` | no | `{ status:"ok", version, uptimeSec, provider, db }` |

### Auth (`AuthProvider`-backed, doc 05)
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{email,password,name?}` | 201 `{user, accessToken}` + `rt` cookie |
| POST | `/auth/login` | `{email,password}` | 200 + rotate `rt` |
| POST | `/auth/refresh` | cookie `rt` | 200 rotate; reuse detect → revoke chain |
| POST | `/auth/logout` | — | clears cookie + revoke current |
| GET | `/auth/me` | — | current user + settings summary |
| GET | `/auth/google` | — | 🔜 `501 AUTH_PROVIDER_NOT_ENABLED` (stub, design ready) |

Password policy: ≥8 chars, letter+digit (zod). Email normalize lowercase/trim.

### Models
| Method | Path | Notes |
|---|---|---|
| GET | `/models` | Server allowlist: `{ id,label,provider,contextWindow,maxOutput,costPer1k:{in,out},enabled }` |

### Chat
`POST /chat/completions` (non-stream):
```json
// req
{ "conversationId": "uuid|null", "model": "mock-1", "message": "hello", "temperature": 0.7 }
// res 200
{ "conversationId": "uuid", "message": { "id":"…","role":"assistant","content":"…",
  "model":"mock-1","promptTokens":12,"completionTokens":34,"createdAt":"…" },
  "usage": { "promptTokens":12,"completionTokens":34,"estCostUsd":0.0001 } }
```
`POST /chat/stream` — same body, SSE events: `meta` → `token`* → `done` (`usage` sahit) → `[DONE]`; error par `event: error`.
Validation: message 1–8000 chars; model must be registry-enabled; quota 429 `QUOTA_EXCEEDED`.

### Conversations
| Method | Path | Notes |
|---|---|---|
| GET | `/conversations?page=&pageSize=&q=` | user-scoped, latest-first |
| POST | `/conversations` | `{title?,model?}` → 201 |
| GET | `/conversations/:id` | + `?messagesPage=&messagesPageSize=` (default last 50) |
| PATCH | `/conversations/:id` | `{title?,model?}` (model re-validated) |
| DELETE | `/conversations/:id` | hard delete + cascade messages |
| GET | `/conversations/:id/messages?before=&limit=` | cursor paging (before=messageId) |

### Notes
| Method | Path | Notes |
|---|---|---|
| GET | `/notes?page=&pageSize=&q=&tag=` | pinned-first |
| POST | `/notes` | `{title(1-200),content(≤50k),tags[]≤10,pinned?}` |
| GET/PATCH/DELETE | `/notes/:id` | IDOR enforced (404 masquerade, doc 08) |

### Search (keyword, Phase-1)
`GET /search?q=&types=conversations,notes,files&limit=` →
```json
{ "q":"…", "results": {
  "conversations":[{"id":"…","title":"…","snippet":"…"}],
  "notes":[…], "files":[{"id":"…","name":"…","mime":"…","size":123}] } }
```
`q` 2–100 chars. Snippets server-truncated (200 chars), HTML-escaped client par.

### Files
| Method | Path | Notes |
|---|---|---|
| POST | `/files` (multipart `file`) | 201 metadata; allowlist MIME + ≤15MB + magic bytes |
| GET | `/files?page=&pageSize=` | metadata list |
| GET | `/files/:id/download` | `Content-Disposition: attachment`, owner-only |
| DELETE | `/files/:id` | metadata + bytes delete |

### Usage
`GET /usage/summary?days=30` →
```json
{ "days":30, "totals":{"requests":12,"promptTokens":1,"completionTokens":2,"estCostUsd":0.01},
  "byDay":[{"date":"2026-09-20","requests":4,"totalTokens":400,"estCostUsd":0.001}],
  "byModel":[{"model":"mock-1","requests":12,"totalTokens":900}], "quota":{"limit":50000,"used":900} }
```

### Settings
| Method | Path | Notes |
|---|---|---|
| GET | `/settings` | `{ theme, defaultModel, temperature, maxTokens, emailNotifs }` |
| PUT | `/settings` | full-replace validated; model re-validated |
| DELETE | `/settings/account` | 🔥 sab user data delete (logout sahit) — confirm via `{confirm:"DELETE"}` |

## Error codes (stable contract — UI inhi par switch kare)
`VALIDATION_ERROR(400) · UNAUTHORIZED(401) · TOKEN_EXPIRED(401) · FORBIDDEN(403) ·
NOT_FOUND(404) · CONFLICT(409) · FILE_TOO_LARGE(413) · UNSUPPORTED_FILE(415) ·
QUOTA_EXCEEDED(429) · RATE_LIMITED(429) · AI_UPSTREAM_ERROR(502) · INTERNAL(500) ·
AUTH_PROVIDER_NOT_ENABLED(501)`
