# 01 — Requirements Analysis (विश्लेषण)

> Har requirement ko padha, hidden problems aur ambiguities nikali, aur har ek par faisla (decision) likha.
> Koi requirement silently ignore nahi ki gayi — jo risky lagi uska alternative diya gaya hai.

## 1. Requirement-wise analysis

### R1. Mobile-first responsive UI
- **Ambiguity:** "Mobile-first" ka matlab sirf responsive CSS hai ya mobile UX patterns (bottom nav, touch targets, offline)?
- **Hidden problems:** Chat + sidebar desktop pattern mobile par toot-ta hai; 44px touch targets; 3G par bundle size; iOS Safari quirks (100vh, backdrop-filter).
- **Decision:** Sach me mobile-first — base styles 360px ke liye, `md:` se desktop enhance. Mobile par bottom-tab nav, desktop par sidebar. Touch target ≥44px, bundle budget ≤200KB gzip initial, `dvh` units, system fonts.

### R2. Dashboard ke 8 sections
| Section | Ambiguity / hidden problem | Decision |
|---|---|---|
| Chat interface | Streaming ya request/response? Multi-turn context kitna? | SSE streaming default + non-stream fallback; last 20 messages context window me |
| Conversation history | Rename? Delete? Kitni purani? | Rename + delete + search + pagination (20/page); soft-delete nahi, hard delete (privacy) |
| Search | Keyword ya semantic? Kya-kya scope? | **Phase-1: keyword** (conversations+notes+file names). Semantic/vector Phase-2 (pgvector) — R-"technically risky" dekho |
| Notes/knowledge | Rich-text ya Markdown? Folders/tags? | Markdown + tags; folders nahi (tags zyada scalable). XSS se bachne ke liye render-time sanitization |
| File upload | Kaunse type? Size? Virus? Content parse? | Allowlist MIME + 15MB default + magic-byte check; **content parsing Phase-2** (R-risky dekho) |
| Model selector | Per-message, per-chat ya global? | Per-conversation + global default; server-side allowlist (client jo bheje wo blindly trust nahi) |
| Settings | Kya-kya? | Profile + theme + AI defaults (model, temperature, max tokens) + danger zone (data delete) |
| Usage/statistics | Real-time? Cost kaise? | Per-request token metering; daily aggregates; cost = rate-card × tokens (estimate label ke saath) |

### R3. Frontend/backend alag
- **Hidden:** Shared types kaise? CORS/auth contract? Monorepo ya do repo?
- **Decision:** Monorepo + strict boundary — frontend sirf `/api/*` se baat karega, direct DB import impossible. Contract: OpenAPI-style doc (doc 04) + shared zod-ish validation server par (client validation sirf UX ke liye).

### R4. API design स्पष्ट
- Decision: REST + SSE (streaming ke liye). Versioning `/api/...` (path me `v1` tab jab breaking change aaye — abhi `Accept-Version` header ka over-engineering nahi).

### R5. Auth — baad me Google Login jud sake
- **Hidden:** Abhi ka session design Google ke saath compatible hona chahiye (account linking, verified email, avatar).
- **Decision:** `AuthProvider` interface + `users` me `provider`/`provider_sub` columns. Abhi: email+password (bcrypt) + JWT access (15m) + rotating refresh (httpOnly cookie). Google = OIDC provider implementation, bina schema break ke plug hoga. Doc 05 dekho.

### R6. User data & secrets suraksha
- **Hidden:** Secrets kahan? Logs me leak? AI provider ko kya jata hai?
- **Decision:** Secrets sirf env/secret-manager; config module prod me missing secret par **boot refuse** karega. Logs me password/token/PII redact. AI ko sirf chat content + minimal metadata. Details doc 06.

### R7. Database schema
- **Hidden:** Kaunsa DB? Migration strategy? Multi-device sessions?
- **Decision:** Postgres (prod) + file-store (dev, zero-config). Schema doc 07 me — users, identities, conversations, messages, notes, files, usage_events, settings, refresh_tokens. Migration: versioned `schema.sql` + migrate-on-boot (chhota project) — scale par golang-migrate/Prisma (doc me note).

### R8. Error / loading / empty states
- **Hidden:** Har async state ka design system chahiye warna adhi jagah missing rahega.
- **Decision:** Shared components: `<LoadingSkeleton>`, `<ErrorState retry>`, `<EmptyState action>`. API error envelope standard: `{ error: { code, message, requestId, details? } }`.

### R9. Accessibility & mobile performance
- **Hidden:** A11y "dhyan rakho" vague hai — WCAG level? Perf budget?
- **Decision:** WCAG 2.2 AA target: skip-link, landmarks, aria-live chat, focus-visible, contrast ≥4.5, keyboard-operable. Perf: Lighthouse mobile ≥90 target, lazy routes, debounce search, virtualized nahi (pagination kaafi).

### R10. Scale-worthy architecture
- **Hidden:** Scale kaunsa? Users? Concurrent streams? Data size?
- **Decision:** Stateless API (horizontal scale ready), sticky-session-free SSE (short-lived), DB index + pagination, Redis-ready rate limit/cache, S3-ready storage, AI provider abstraction (failover). Targets: 10k users / 500 concurrent streams single-region me bina redesign. Doc 02.

### R11. Security vulnerabilities + abuse cases
- Doc 08 me puri threat-model table (prompt injection, token theft, upload abuse, IDOR, cost-abuse, scraping...).

### R12. Testing strategy + test cases
- Doc 09 + `backend/tests/` (supertest) + `frontend/src/**/*.test.tsx` (Testing Library). Critical paths: auth, chat metering, upload validation, IDOR.

### R13. Deployment architecture + env/config
- Doc 10: Docker/Compose, TLS, reverse proxy, health checks, backup, observability, env table.

## 2. Technically galat / risky requirements aur unke alternatives

| # | Risky maang | Kyun risky | Better alternative (implemented) |
|---|---|---|---|
| A | "Search" ko semantic samajhna | Embedding pipeline + pgvector bina infra ke demo me fake hoga; cost/latency bhi | Phase-1 keyword FTS (`ILIKE`/trigram-ready); semantic Phase-2 me pgvector + embedding worker |
| B | File upload me "AI auto-understanding" | PDF/Office parsing + PII leak + malware + bada context = bada attack surface | Phase-1: safe store + metadata + text-file preview; parsing/extraction Phase-2 me sandboxed worker me |
| C | Real-time usage counters har request par | Write amplification + race conditions | Per-request event insert + read-time aggregate (daily rollup job ka hook) |
| D | WebSocket chat | Sticky sessions, LB complexity, serverless-unfriendly — is scale par overkill | SSE (unidirectional streaming kaafi hai; input normal POST). WS ka upgrade path doc 02 me |
| E | Client-side model allowlist | User koi bhi costly model force kar sakta hai (cost abuse) | Server-side model registry + per-user/per-day token quota |
| F | Refresh token localStorage me | XSS se permanent account takeover | httpOnly + Secure + SameSite cookie, rotation + reuse detection |

## 3. Non-goals (scope se bahar — jaan-boojhkar)
1. Real-time collaboration / multi-user workspaces (single-user dashboard hai)
2. Offline-first sync (PWA shell + cache baad me; conflict-resolution abhi overkill)
3. E2E encryption (server-side AI processing ke saath incompatible; at-rest + TLS instead)
4. Admin panel / billing (usage API ready hai, Stripe Phase-2)
5. Native mobile apps (responsive web + PWA-ready shell)

## 4. Assumptions (challenge kar sakte ho)
1. Single-region deployment kaafi hai (global edge Phase-2).
2. English + Hindi UI labels kaafi (i18n infra ready, poora translation Phase-2).
3. AI cost user/owner uthata hai — quota default `50k tokens/day/user` (env se tunable).
