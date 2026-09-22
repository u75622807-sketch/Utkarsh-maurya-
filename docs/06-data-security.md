# 06 — User Data & Secrets Protection

## 1. Secret management (layers)

| Layer | Rule | Implementation |
|---|---|---|
| Source | Koi secret repo me nahi | `.env` gitignored; `.env.example` me sirf placeholders; (CI me gitleaks recommend — doc 10) |
| Config | Fail-closed | `config.ts`: prod me short/missing `JWT_*_SECRET` → process exit(1) with clear error |
| Runtime | Least exposure | Secrets sirf `config` module padhta hai; `process.env` scattered access banned (grep check) |
| Logs | Redaction | `logger.ts` redact: `password, token, secret, key, authorization, cookie, rt` + email mask option |
| Client | Zero secrets | Frontend me koi API key/JWT-secret nahi; `VITE_*` me sirf public `VITE_API_URL` |
| Prod store | Secret manager | Doc 10: Docker secrets / AWS SM / Vault — file-mount ya env-inject, Compose me `${}` se |

## 2. Data classification

| Class | Examples | Handling |
|---|---|---|
| **Secret** | JWT secrets, AI keys, S3 keys, password hashes, refresh hashes | Env/manager only, never log, never client |
| **Sensitive** | Chat content, notes, files, email, usage | TLS in transit, owner-scoped access, at-rest encryption (prod disk), AI-provider data-minimization |
| **Internal** | Logs, metrics, request-ids | Redacted logs, 30-day retention default |
| **Public** | Model list, health, version | Cacheable |

## 3. In-transit & at-rest
- **Transit:** TLS everywhere (prod Nginx terminates, HSTS on); cookies `Secure`; CORS exact-allowlist + credentials.
- **At-rest (prod):** Postgres volume encryption (cloud disk encryption / LUKS self-host); S3 SSE-S3/SSE-KMS + bucket-private + presigned-URL expiry 15m; backups encrypted + tested restore (doc 10).
- **Dev:** local disk store; `backend/data/` + `uploads/` gitignored.

## 4. AI provider ko kya jata hai (data minimization)
- Sirf: model id, messages (conversation context), temperature/max_tokens. **Kabhi nahi:** password, tokens, email (system prompt me user-id bhi nahi), file bytes (Phase-1 me files AI ko bhejte hi nahi).
- Provider keys server-side only; per-request timeout 60s; upstream errors client ko generic `AI_UPSTREAM_ERROR` (provider ka raw body kabhi forward nahi — prompt/key leak risk).
- Mock provider default: bina key ke koi external call hi nahi (air-gap dev/test).

## 5. User rights (privacy-by-design)
- **Export:** `GET /auth/me` + conversations/notes/files APIs = poora data machine-readable (one-click export UI Phase-2, API ready).
- **Delete:** `DELETE /settings/account` → user + conversations + messages + notes + files(bytes sahit) + usage + refresh tokens, ek transaction me; S3 delete + local unlink dono.
- **Retention:** revoked refresh tokens 30d baad purge (scheduled hook `purgeExpired()`); logs 30d; backups 90d (prod runbook doc 10).

## 6. Code-level rules (review checklist)
- [ ] Har user-scoped query me `WHERE user_id = $1` (grep: `from conversations|notes|files` bina user_id = bug)
- [ ] IDOR test har `:id` route par (dusre user ka id → 404, 403 nahi — existence leak nahi)
- [ ] `res.json(user)` se pehle `toPublicUser()` (hash/secret strip)
- [ ] `Content-Disposition: attachment` downloads par (SVG/HTML execution rokna)
- [ ] Markdown render: sanitize (DOMPurify-style allowlist) — stored-XSS rokna
- [ ] File serve kabhi `express.static(uploads)` se nahi — hamesha auth + owner-check + stream
