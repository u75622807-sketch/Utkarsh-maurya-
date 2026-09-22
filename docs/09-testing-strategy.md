# 09 — Testing Strategy & Key Test Cases

## 1. Strategy (test pyramid)

```
        ┌──────────┐  E2E smoke (Playwright, CI nightly — 🔜 Phase-2, 5 flows)
        ├──────────┤  API contract+security (Supertest, har PR par) ← sabse zyada value
        ├──────────┤  Component (Testing Library: states + a11y queries)
        └──────────┘  Unit (pure fns: pagination, redact, registry, quota math)
```

- **Backend:** Vitest + Supertest, in-process `createApp(new MemoryStore())` — har test file ko fresh store (parallel-safe, koi shared DB nahi). `AI_PROVIDER=mock` forced in tests (deterministic, zero network).
- **Frontend:** Vitest + Testing Library + jsdom; API mocked at `fetch` boundary (MSW-style hand mock, halka); a11y assertions (`getByRole`, focus checks).
- **Gates:** `npm test` + `npm run build` + `npm audit --audit-level=high` green bina merge nahi. Coverage floor: backend ≥70% lines (auth/chat/upload ≥90%).

## 2. Kya test karte hain (aur kya nahi)

| Layer | Haan | Nahi (kyun) |
|---|---|---|
| Auth | register/login/refresh-rotate/reuse-revoke/logout/me + RL | bcrypt internals (lib), Google round-trip (stub; Phase-2 me wiremock) |
| Chat | completions shape, SSE event order, model-allowlist, quota-429, metering recorded | Real provider text (mock asserts structure, not prose) |
| IDOR | har `:id` route cross-user → 404 | — |
| Upload | ok/oversize/mime/magic-byte/traversal/download-owner | Real AV scan (hook tested via fake scanner interface) |
| Usage | totals math, byDay buckets, quota shape | — |
| UI | loading→data, error+retry, empty+CTA, keyboard/a11y roles | Pixel-perfect visuals (screenshot tests Phase-2) |

## 3. Critical test cases (implemented — file references)

**`backend/tests/auth.test.ts`**
1. register → 201 + `toPublicUser` me `password_hash` absent + `rt` cookie flags (`HttpOnly`, `SameSite`)
2. duplicate email → 409 `CONFLICT` (lekin message user-safe)
3. login wrong password → 401 generic (email sahi ho ya galat — same body; enumeration guard)
4. refresh rotation: r1 se r2 milta hai; r1 reuse → 401 + family revoked (r2 bhi dead)
5. `/auth/me` bina token → 401 `UNAUTHORIZED`; expired token → 401 `TOKEN_EXPIRED`
6. auth rate limit: 21st login-attempt (burst) → 429 `RATE_LIMITED` + `Retry-After`

**`backend/tests/chat.test.ts`**
7. completions: naya conversation auto-create + assistant msg + `usage` object (prompt>0, completion>0)
8. disabled/unknown model → 400 `VALIDATION_ERROR` (client-forged model reject)
9. message 8001 chars → 400; empty → 400
10. quota: `DAILY_TOKEN_QUOTA` chhota set karke → 429 `QUOTA_EXCEEDED` + `usage.quota` shape
11. SSE: event order `meta → token+ → done` + `Content-Type: text/event-stream`; abort par bhi usage recorded
12. `Idempotency-Key` double-POST → same response, single usage event

**`backend/tests/notes.test.ts` + `conversations` (andar)**
13. CRUD happy path + pagination (`total/totalPages` math) + `q` filter
14. title 201 chars / content 50k+1 → 400; tags 11 → 400
15. cross-user GET/PATCH/DELETE → 404 (403 nahi) — IDOR masquerade

**`backend/tests/files.test.ts`**
16. txt upload → 201 + sha256 + size; download owner-ok / cross-user-404
17. 15MB+1 byte → 413 `FILE_TOO_LARGE`; `.exe` → 415; fake-png (text bytes, png ext) → 415 magic-byte
18. `../../etc/passwd` filename → sanitized UUID key (traversal dead)

**`backend/tests/usage.test.ts`**
19. 3 chats (2 models) → summary totals/byDay/byModel/quota consistent (`sum(parts)==totals`)
20. dusre user ka usage kabhi leak nahi (scope test)

**`backend/tests/security.test.ts`**
21. Helmet headers present (`content-security-policy`, `x-content-type-options`)
22. CORS: unknown origin preflight → no `allow-origin` echo (prod-mode app instance par)
23. 404 envelope shape + `x-request-id` har response par
24. zod error shape: `VALIDATION_ERROR` + `details[]` (field-level)

**`frontend/src/**/*.test.tsx`** (representative)
25. `ChatInterface`: send → streaming tokens append → `aria-live` region update; error → `ErrorState` + Retry refetch
26. `NotesSection`: empty → `EmptyState` + CTA; loading → skeleton (snapshot nahi, role-query)
27. `FileUpload`: oversize select → inline error (upload attempt hi nahi); success → list invalidate
28. `Login`: 401 → field-level message, focus password par wapas (a11y)
29. Router guard: bina token `/` → `/login` redirect; token-expiry → auto-refresh ek baar → fail par login

## 4. Non-functional test notes
- **Perf:** `lighthouse --preset=mobile` budget: LCP <2.5s (3G-fast), JS <200KB gzip; CI me `bundlesize`-lite check (dist size assert).
- **A11y:** `axe-core` smoke on Dashboard+Login (0 serious/critical) — Phase-2 CI job, abhi manual `npm run a11y:manual` checklist doc 11.
- **Load (pre-prod):** k6 script `scripts/load-smoke.js` (🔜 doc 10): 100 VUs chat-mix, p95 <1.2s non-stream, SSE TTFB <800ms, 0 IDOR/5xx.
- **DB:** `EXPLAIN` smoke: list-queries index-scan (CI job Postgres service par, Phase-2).
