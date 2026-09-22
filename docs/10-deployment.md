# 10 — Deployment Architecture & Production Config

## 1. Topology (recommended: single-region, 2-AZ)

```
Internet → [Cloud LB + TLS (ACM/Let's Encrypt)] → [Nginx ×2 (static SPA + /api proxy)]
        → [API ×2+ (Node 22, 512MB-1GB)] → [Postgres managed (RDS/Cloud SQL, Multi-AZ)]
        ↘ files → [S3 + SSE] · cache/RL → [Redis managed] · AI → [OpenAI/Anthropic]
```

- **Self-host alt:** `docker compose --profile prod up -d` (Compose me postgres+redis included) + Caddy/Nginx TLS.
- **PaaS alt:** Frontend → Cloudflare Pages/Vercel; API → Fly.io/Render (2 instances); DB → Neon/Supabase. Env table same.
- **K8s migration (jab 10k+ users):** stateless API = Deployment+HPA; SSE: LB idle-timeout 150s + pod `terminationGracePeriodSeconds: 150`; DB-operator/externals.

## 2. Production environment variables (required vs optional)

| Var | Required | Prod value rule |
|---|---|---|
| `NODE_ENV=production` | ✅ | hardcoded in image |
| `PORT` | — | default 4000 (platform override ok) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ✅ | `openssl rand -hex 32` each, **alag-alag**; <32 chars → boot refuse |
| `CORS_ORIGIN` | ✅ | exact `https://app.utkforce…` (comma-list allowed, koi `*` nahi) |
| `DATABASE_URL` | ✅ | managed Postgres + `sslmode=require`; app user least-privilege (no superuser) |
| `AI_PROVIDER` + `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` | ✅(ek) | secret-manager se; key rotation runbook §6 |
| `STORAGE_DRIVER=s3` + `S3_*` | ✅ | private bucket + SSE + versioning; IAM least-privilege (Put/Get/Delete object only) |
| `REDIS_URL` | ✅ | managed Redis + TLS + password (distributed RL + cache) |
| `SEED_DEMO` | — | prod me **empty/false** (guard: prod+SEED→warn+skip) |
| `RATE_*` | — | defaults ok; tune post-load-test |
| `GOOGLE_*` | 🔜 | Phase-2 OIDC |
| `VITE_API_URL` | build-time | `https://api…` ya same-origin `` (Nginx proxy recommended: same-origin = CORS zero-risk) |

Secrets delivery order: cloud secret-manager > Docker secrets (`/run/secrets`) > env-file (0600, deploy-user only). **Kabhi:** Git, image layers, client bundle, chat logs.

## 3. Reverse proxy (Nginx) essentials
- TLS 1.2+ only, HSTS `max-age=31536000; includeSubDomains`, OCSP staple.
- `/` → SPA static (immutable-asset cache `1y`, `index.html` no-cache); `/api/` → upstream API (keepalive, `proxy_read_timeout 150s` for SSE).
- `client_max_body_size 16m`; gzip/br on; access-log PII-redacted (token/query-strip).

## 4. Database ops
- Migrate-on-boot (`schema.sql` idempotent) chhote deploys tak; team badhe → versioned migrations (golang-migrate) + CI `migrate --dry-run`.
- Backup: daily snapshot + PITR (7–30d); **monthly restore-drill** (staging me) — untested backup = no backup.
- Pool: `max 20/instance`, `statement_timeout 10s`, `idle_timeout 30s`; slow-query log >500ms.

## 5. Observability (minimal viable)
- Logs: JSON stdout → collector (Loki/CloudWatch); redact list doc 06; alert: `level=error` rate + 5xx rate + refresh-reuse events.
- Metrics: `/api/health` (LB) + 🔜 `/metrics` (Prometheus: req-duration, SSE-active, AI-latency, quota-denials).
- Tracing: `x-request-id` propagate (client→API→provider-call log); 🔜 OTel SDK.
- Uptime: external ping 1m + SSE synthetic chat 5m (staging key/quota alag).

## 6. Runbooks (one-liners)
- **Key rotation (JWT):** naya secret stage → dual-verify window 30m → cutover → purane refresh revoke. (Dual-secret support code hook: `JWT_ACCESS_SECRET_PREV` — 🔜 20 lines.)
- **AI key leak:** provider dashboard me revoke → secret-manager update → rolling restart → usage-spike audit.
- **Breach suspect:** `UPDATE refresh_tokens SET revoked_at=now() WHERE user_id=?` + force re-login + 30d log preserve.
- **Rollback:** images tagged `:git-sha`; DB backward-compatible migrations only (expand→migrate→contract).

## 7. Pre-launch checklist (prod gate)
- [ ] `.env` prod filled, `SEED_DEMO` empty, secrets ≥32 chars, CORS exact
- [ ] `docker compose --profile prod config` review + `up -d` + `/api/health` 200
- [ ] TLS + HSTS verify (`curl -sI`), SSE 120s idle test, upload 15MB test
- [ ] Backups scheduled + restore drilled; alerts firing (test alert)
- [ ] `npm audit --omit=dev` clean(high+), gitleaks clean, doc 08 §4 red-team pass
- [ ] Load smoke (k6, 100 VU) p95 within budget; quota + RL verified live
