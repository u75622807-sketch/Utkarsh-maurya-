# 03 — Implementation Plan (चरणबद्ध योजना)

> Status legend: ✅ done (is repo me) · 🔜 Phase-2 (design ready, code baad me)

## Phase 0 — Foundation ✅
- [x] Monorepo scaffold, TS strict, ESLint-ish hygiene, `.env.example`
- [x] `config.ts` fail-closed validation (prod secrets mandatory)
- [x] Error envelope + request-id + PII-redacting logger
- [x] Health endpoint + Dockerfiles + compose
- [x] CI-ready test scripts (backend `vitest`, frontend `vitest`)

## Phase 1 — Auth & users ✅
- [x] Register/login (bcrypt 12), me, logout
- [x] Access (15m) + rotating refresh (httpOnly cookie, reuse detection)
- [x] `AuthProvider` interface + Google OIDC stub (`501 NOT_IMPLEMENTED` + design doc 05)
- [x] Settings (profile/theme/AI defaults) + account data delete

## Phase 2 — Knowledge core ✅
- [x] Conversations CRUD + messages + rename + pagination
- [x] Notes CRUD + tags + pin + pagination
- [x] Global keyword search (conversations + notes + files)
- [x] Files: upload/list/download/delete, MIME allowlist + size cap + magic-byte check
- [x] Model registry (server allowlist) + per-conversation model + global default

## Phase 3 — Chat & metering ✅
- [x] `POST /chat/completions` (non-stream) + `POST /chat/stream` (SSE)
- [x] Provider abstraction: mock (dev/test) + OpenAI + Anthropic
- [x] Token metering har response par + daily quota enforce
- [x] Usage summary API + dashboard stats UI

## Phase 4 — Frontend UX ✅
- [x] Mobile-first layout: bottom nav (mobile) / sidebar (desktop)
- [x] 8 sections wired to real API (koi fake button nahi)
- [x] Loading/error/empty states har async view me
- [x] A11y pass: skip-link, landmarks, aria-live chat, focus management, labels
- [x] Perf: lazy tabs, debounced search, pagination (no unbounded lists)

## Phase 5 — Hardening & deploy ✅ (design+code) / 🔜 (prod-run)
- [x] Helmet, CORS allowlist, rate limits (auth/chat/upload strict)
- [x] Threat model doc 08 + mitigations implemented (IDOR tests, upload tests…)
- [x] Deployment doc 10 + compose prod profile + healthchecks
- [ ] 🔜 Prod run: TLS cert, secret-manager, Postgres backups, Sentry/OTel, Redis RL store

## Phase 2 (future) — jab zaroorat ho 🔜
1. Google Login (OIDC) — interface + stub ready, ~1 din ka kaam
2. Semantic search (pgvector + embedding worker + BullMQ-lite jobs table)
3. File content extraction (sandboxed worker, PII redaction, AV scan hook → ClamAV)
4. Stripe billing + per-plan quotas (usage API already plan-aware shape me)
5. PWA offline drafts + push; i18n Hindi full; admin dashboard

## Milestone acceptance criteria (har phase ke "done" ka matlab)
- Backend `npm test` green + `npm run build` clean, frontend `npm run build` clean
- Har naya endpoint: zod schema + auth test + IDOR test (jahan user-scoped)
- Har naya UI view: loading + error-retry + empty state ke saath
- Koi `TODO` bina doc-reference ke nahi (grep-able: `TODO(doc-08)` style)
