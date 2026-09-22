# 11 — Self-Review (ईमानदार समीक्षा)

> Is solution ko maine khud attack kiya. Jo toot sakta hai, jo missing hai, aur prod se pehle jo verify karna hai — sab yahan.

## 1. Kya toot sakta hai (top risks)

| # | Risk | Impact | Likelihood | Mitigation status |
|---|---|---|---|---|
| 1 | **PostgresStore bina live-PG ke** — SQL carefully likha + reviewed, par sandbox me integration-run nahi hua | 🔴 prod boot/query fail | medium | ⚠️ **Must-verify:** CI Postgres-service job ya staging `DATABASE_URL` run (doc 10 §7). MemoryStore default se dev/demo safe |
| 2 | SSE + mobile network flakiness (background kill, 30s carrier timeout) | 🟠 adhura jawab, duplicate send | high | ✅ idempotency-key + resume-cursor + retry; ⚠️ real-device field test baki |
| 3 | AI upstream latency/cost spike (retry-storm) | 🟠 bill + p95 | medium | ✅ timeout 60s + no-auto-retry-on-5xx + quota; 🔜 circuit-breaker + per-model budget cap |
| 4 | Upload disk-fill (local driver, quota nahi) | 🟠 DoS | medium | ⚠️ per-file cap hai; **per-user storage quota baki** (hook ready, doc 08-A4) — prod S3+quota ke bina mat kholo |
| 5 | Refresh-cookie + cross-subdomain frontend (`app.` vs `api.`) | 🟡 login-loop | medium | ✅ SameSite=Lax + same-origin Nginx default; ⚠️ split-domain deploy par `Domain`+`SameSite=None;Secure` config verify karo |
| 6 | Long conversations → context/cost creep | 🟡 slow + costly | high | ✅ last-20 cap; 🔜 summarization + per-conversation token meter UI |
| 7 | Timezone/Unicode edge (Hindi input, emoji, RTL) | 🟢 display/search miss | medium | ✅ UTF-8 end-to-end, keyword search case-fold; ⚠️ FTS Hindi-stemming Phase-2 me test karna |

## 2. Kya missing / adhura hai (jaana hua trade-off)

1. **Google Login** — stub + interface + schema ready, par OIDC round-trip code Phase-2 (R5 ne "baad me jud sake" maanga tha — design usi ke liye hai, working Google abhi nahi).
2. **Semantic search & file-content AI** — jaan-boojhkar Phase-2 (doc 01-A/B: fake karke dene se mana kiya).
3. **Redis-backed rate limit** — interface-ready, dev memory-store; multi-replica prod me `REDIS_URL` mandatory (config warn karta hai).
4. **E2E (Playwright) + k6 + axe CI jobs** — strategy + cases likhe, automation Phase-2.
5. **Admin/billing/Stripe, public share-links, PWA-offline, full Hindi i18n** — non-goals (doc 01 §3), API shapes future-proof rakhi.
6. **Refresh `prev-secret` rotation window** — runbook likha, dual-verify hook baki (~20 lines).
7. **Anthropic true-streaming** — OpenAI SSE passthrough real hai; Anthropic abhi non-stream→chunked emit (documented, behavior same, TTFB thoda zyada).

## 3. Production checklist (deploy se pehle — no exceptions)

- [ ] Staging `DATABASE_URL` par full suite + doc 08 §4 red-team pass
- [ ] `S3` driver + per-user storage quota enabled (risk #4 band)
- [ ] Secrets manager wired; `SEED_DEMO` empty; CORS exact-origin
- [ ] TLS/HSTS + SSE-150s-timeout + 15MB-upload live test
- [ ] Backups + restore drill + alerts (error-rate, 5xx, refresh-reuse, quota-denial)
- [ ] k6 load smoke within budget (doc 09 §4)
- [ ] `npm audit`(high+), gitleaks, `VITE_*` secret-grep clean

## 4. Meri grade (kunthit nahi, imaandar)
- **Architecture & docs:** A — har requirement ka traced decision + alternative.
- **Working code (dev path):** A− — saare 8 sections real API par chalte hain; tests green.
- **Prod-hardening proof:** B+ — mitigations implemented, par live-PG/Redis/S3 proof staging par baki (risk #1/#4).
- **Overall:** Production-ready **design + working foundation** — staging-gate (upar) clear karne ke baad hi prod traffic kholo.

## 5. Agar mujhe 1 aur din milta to (priority order)
1. CI Postgres-service par `postgresStore` integration suite (risk #1 kill)
2. Per-user storage quota + S3 presigned-download (risk #4 kill)
3. Playwright smoke (login→chat→note→upload→usage) + axe job
4. Circuit-breaker + per-model budget caps (risk #3 shrink)
5. Google OIDC live wiring (R5 complete)
