# 07 — Database Schema Design

**Prod DB: PostgreSQL 16.** Dev: zero-config file-store (wahi `Store` interface, doc 02).
Authoritative DDL: `backend/src/db/schema.sql` (migrate-on-boot). Yahan design rationale.

## 1. ER (text)

```
users 1───* refresh_tokens        users 1───1 user_settings
users 1───* conversations 1───* messages
users 1───* notes                 users 1───* files
users 1───* usage_events          users 1───* idempotency_keys
```

## 2. Tables

```sql
users (
  id UUID PK DEFAULT gen_random_uuid(),
  email CITEXT UNIQUE NOT NULL,            -- case-insensitive (CITEXT ext; fallback: lower(email) index)
  password_hash TEXT NULL,                 -- NULL = pure-OAuth user
  name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NULL,
  provider TEXT NOT NULL DEFAULT 'local',  -- local|google (+github… baad me)
  provider_sub TEXT NULL,                  -- OAuth subject
  role TEXT NOT NULL DEFAULT 'user',       -- user|admin (admin panel Phase-2)
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login_at TIMESTAMPTZ NULL,
  UNIQUE (provider, provider_sub)           -- partial: WHERE provider_sub IS NOT NULL
);

refresh_tokens (
  id UUID PK, user_id FK→users CASCADE, token_hash TEXT UNIQUE NOT NULL,
  family_id UUID NOT NULL,                  -- rotation family (reuse detection)
  user_agent TEXT, ip INET,
  expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON refresh_tokens (user_id, expires_at);

user_settings (
  user_id PK FK→users CASCADE,
  theme TEXT DEFAULT 'system',              -- light|dark|system
  default_model TEXT DEFAULT 'mock-1',
  temperature REAL DEFAULT 0.7 CHECK (0..2),
  max_tokens INT DEFAULT 1024 CHECK (1..8192),
  email_notifs BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

conversations (
  id UUID PK, user_id FK CASCADE, title TEXT NOT NULL DEFAULT 'New chat',
  model TEXT NOT NULL, message_count INT DEFAULT 0,
  created_at, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON conversations (user_id, updated_at DESC);

messages (
  id UUID PK, conversation_id FK CASCADE, user_id FK CASCADE,  -- denormalized owner (fast authz)
  role TEXT CHECK ('user','assistant','system'),
  content TEXT NOT NULL, model TEXT NULL,
  prompt_tokens INT DEFAULT 0, completion_tokens INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at);

notes (
  id UUID PK, user_id FK CASCADE, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  tags TEXT[] DEFAULT '{}', pinned BOOLEAN DEFAULT false,
  created_at, updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON notes (user_id, pinned DESC, updated_at DESC);
CREATE INDEX ON notes USING GIN (tags);

files (
  id UUID PK, user_id FK CASCADE, name TEXT NOT NULL, mime TEXT NOT NULL,
  size_bytes BIGINT NOT NULL, storage_key TEXT NOT NULL, -- local path ya s3 key
  sha256 TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON files (user_id, created_at DESC);

usage_events (
  id BIGSERIAL PK, user_id FK CASCADE, conversation_id FK SET NULL,
  model TEXT NOT NULL, prompt_tokens INT NOT NULL, completion_tokens INT NOT NULL,
  est_cost_usd NUMERIC(12,6) NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON usage_events (user_id, created_at DESC);

idempotency_keys (
  key TEXT, user_id FK CASCADE, route TEXT NOT NULL,
  response JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (key, user_id)
);
```

## 3. Key decisions (kyun aisa)

1. **`messages.user_id` denormalized** — har message read par conversation-join/authz-check se bachne ke liye; write par parent se copy, FK dono par CASCADE.
2. **Hard delete (no soft-delete)** — privacy-first personal dashboard; undelete nahi chahiye. (Audit-trail chahiye to Phase-2 me `deleted_*` archive table.)
3. **`CITEXT` email** — `User@x.com` vs `user@x.com` duplicate-registration bug khatm. (Extension na ho to `lower(email)` unique index — schema.sql me fallback included.)
4. **`usage_events` append-only, BIGINT PK** — high-write table; UUID random-write penalty se bachna; read-time aggregate + future daily rollup.
5. **No FK from usage→messages** — metering message-delete ke baad bhi survive kare (billing truth).
6. **`files.storage_key` opaque** — local path ↔ S3 key migration bina schema change.
7. **Cursor paging ready** — `messages(conversation_id, created_at, id)` ordering deterministic (same-ms ties `id` se break).
8. **Phase-2 hooks (bina breaking migration):** `notes.embedding vector(1536)` (pgvector), `jobs` table (file-parse/embedding queue), `user_identities` (multi-provider link), `conversations.folder` nahi — tags model hi rahega.

## 4. Index & growth checklist
- Har list-query `EXPLAIN` me index-scan (CI me `EXPLAIN` smoke test ka note doc 09).
- 1M+ messages: `messages` monthly partition (`created_at`) — DDL comment me template.
- FTS upgrade: `to_tsvector` GIN index conversations/messages/notes par (Phase-2, trigram fallback).
