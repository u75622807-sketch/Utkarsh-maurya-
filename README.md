# UtkForce AI Dashboard

> Modern AI-powered personal knowledge dashboard — production-ready design + working implementation.

**Stack:** React 19 + Vite + TailwindCSS v4 (frontend) • Node.js + Express + TypeScript (backend) •
PostgreSQL (prod) / zero-config file store (dev) • Docker + Compose • Vitest + Supertest + Testing Library.

## ⚡ Quickstart (2 minute, zero-config)

```bash
# 1. Backend
cd backend && npm install && npm run dev      # http://localhost:4000

# 2. Frontend (naye terminal me)
cd frontend && npm install && npm run dev     # http://localhost:5173
```

Demo login (dev seed): `demo@utkforce.ai` / `Demo@1234!`
Bina AI key ke backend **mock provider** se chalega — chat, notes, files, usage sab kaam karega.

Docker se:

```bash
docker compose up --build
```

## 🗂️ Repository structure

```
.
├── frontend/          # React + Vite + TS + Tailwind (mobile-first SPA)
├── backend/           # Express + TS REST API + SSE streaming
├── docs/              # Design docs (Hindi) — har requirement ka jawab
│   ├── 01-requirements-analysis.md
│   ├── 02-architecture.md
│   ├── 03-implementation-plan.md
│   ├── 04-api-design.md
│   ├── 05-auth-design.md
│   ├── 06-data-security.md
│   ├── 07-database-schema.md
│   ├── 08-security-threat-model.md
│   ├── 09-testing-strategy.md
│   ├── 10-deployment.md
│   └── 11-self-review.md
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── .env.example
```

## ✅ Features (Dashboard ke 8 sections)

| # | Section | Status |
|---|---------|--------|
| 1 | Chat interface (streaming + SSE) | ✅ |
| 2 | Conversation history (rename/delete/search) | ✅ |
| 3 | Global search (conversations + notes + files) | ✅ |
| 4 | Notes / knowledge base | ✅ |
| 5 | File upload (drag-drop, validation) | ✅ |
| 6 | Model selector (per-conversation) | ✅ |
| 7 | Settings (profile, theme, AI defaults) | ✅ |
| 8 | Usage / statistics | ✅ |

Cross-cutting: JWT auth (Google-login-ready), rate limiting, Zod validation, request-id tracing,
loading/error/empty states, a11y (skip-link, aria-live, keyboard), mobile-first responsive UI.

## 🔌 API (summary)

| Method | Path | Kaam |
|--------|------|------|
| GET | `/api/health` | Liveness + version |
| POST | `/api/auth/register|login|refresh|logout` | Auth (access+rotating refresh) |
| GET | `/api/models` | Available AI models |
| POST | `/api/chat/completions` | Non-stream chat |
| POST | `/api/chat/stream` (SSE) | Streaming chat |
| CRUD | `/api/conversations` + `/messages` | History |
| CRUD | `/api/notes` | Knowledge base |
| GET | `/api/search?q=` | Global search |
| POST/GET/DELETE | `/api/files` | Upload/list/download/delete |
| GET | `/api/usage/summary` | Token + cost stats |
| GET/PUT | `/api/settings` | User settings |

Puri spec: [`docs/04-api-design.md`](docs/04-api-design.md)

## 🔐 Environment

`.env.example` dekho. Production me **zaroori**: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
(32+ random bytes), `DATABASE_URL` (Postgres), `CORS_ORIGIN`, AI provider key.
Bina secrets ke prod boot **refuse** karega (fail-closed).

## 🧪 Tests

```bash
cd backend && npm test        # API + security tests
cd frontend && npm test       # component tests
```

Strategy + cases: [`docs/09-testing-strategy.md`](docs/09-testing-strategy.md)

## 🚀 Production deploy

```bash
docker compose --profile prod up --build -d   # ya docs/10-deployment.md follow karo
```

## 🔍 Self-review

Kya toot sakta hai, kya missing hai, prod se pehle kya verify karna hai —
[`docs/11-self-review.md`](docs/11-self-review.md) me imaandari se likha hai.
