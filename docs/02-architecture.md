# 02 — Architecture (क्यों यही चुना)

## 1. Chosen architecture (ek nazar me)

```
                    ┌──────────────┐      HTTPS      ┌─────────────────┐
  Mobile/Desktop →  │ CDN + Nginx  │ ─────────────▶ │  React SPA      │
                    │ (TLS, cache) │   /api/* proxy  │  (Vite build)   │
                    └──────────────┘                 └────────┬────────┘
                                                             │ REST + SSE
                    ┌──────────────┐                 ┌────────▼────────┐
                    │  S3 / MinIO  │◀── uploads ───  │  Express API    │──┐
                    │  (files)     │                 │  (stateless ×N) │  │
                    └──────────────┘                 └────────┬────────┘  │
                                                             │           │ AI SDK/HTTPS
                    ┌──────────────┐    sessions/    ┌────────▼────────┐  │  ┌────────────┐
                    │    Redis     │◀── rate-limit ──│   PostgreSQL    │  └─▶│ AI providers│
                    │ (cache/rl/agg)│   cache/queue  │  (source of     │     │ OpenAI/Claude│
                    └──────────────┘                 │   truth)        │     │ /mock      │
                                                     └─────────────────┘     └────────────┘
```

**Pattern:** Modular monolith API + decoupled SPA. Microservices **nahi**.

## 2. Kyun yahi? (alternatives ko kyun reject kiya)

| Decision | Chuna | Reject kiya | Kyun |
|---|---|---|---|
| Monorepo | ✅ npm workspaces-ish (do package.json) | Do repo / monolith mix | Contract ek jagah, deploy alag-alag; boundary todna mushkil |
| Backend: Express+TS | ✅ | Fastify/Nest/FastAPI | Team-js me hiring aasaan, ecosystem bada; Nest ka boilerplate is size par overkill; Python alag runtime = do toolchain |
| DB: Postgres | ✅ | Mongo / SQLite-prod / Prisma-now | Relational truth (users→conversations→messages), FTS, pgvector upgrade path; Prisma abhi overkill, raw SQL + repository pattern kaafi |
| Real-time: SSE | ✅ | WebSocket / polling | Chat server→client stream hai — SSE HTTP-infra-friendly, auto-reconnect, LB-sticky-free. WS sirf bidirectional chahiye tab (doc 01-D) |
| Auth: JWT access + rotating refresh | ✅ | Sessions / bare-JWT-long-lived | Stateless scale + Google-OIDC-ready + revoke-via-refresh-table ka balance |
| State: TanStack Query + Zustand | ✅ | Redux / Context-soup | Server-cache (Query) aur UI-state (Zustand) ka separation; kam boilerplate |
| Styling: Tailwind v4 | ✅ | CSS-modules / MUI | Mobile-first utilities tez, bundle chhota, design-system tokens aasaan |
| AI: provider abstraction + mock | ✅ | Direct OpenAI SDK calls | Key/billing/vendor change bina refactor; tests deterministic; cost metering ek jagah |

## 3. Backend module map (dependency rule: routes → services → db, ulta kabhi nahi)

```
src/
├── index.ts            # wiring + listen + graceful shutdown (patla)
├── app.ts              # createApp(deps) — testable factory
├── config.ts           # env parse + fail-closed validation
├── logger.ts           # JSON logs + PII redaction
├── middleware/         # auth, rateLimit, validate(zod), requestId, errorHandler
├── routes/             # sirf HTTP: parse → service → respond (business logic ZERO)
├── services/           # aiProvider, modelsRegistry, usageTracker, storage, search
├── db/                 # types, store(interface), memoryStore, postgresStore, schema.sql
└── utils/              # errors(AppError), pagination
```

**Ports & adapters:** `Store`, `AIProvider`, `FileStorage` interfaces hain —
Postgres/S3/Anthropic badalne par route/service code **nahi** badlega.

## 4. Frontend module map

```
src/
├── main.tsx, App.tsx, styles.css
├── api/client.ts       # fetch wrapper: auth header, refresh-retry, error envelope parse, SSE reader
├── stores/             # authStore (persist), uiStore (sidebar/theme), chatDraftStore
├── hooks/              # TanStack Query hooks per resource (useConversations, useNotes…)
├── components/         # Layout, Sidebar, BottomNav, ChatInterface, History, SearchBar,
│                       # NotesSection, FileUpload, ModelSelector, SettingsPanel, UsageStats,
│                       # + states: LoadingSkeleton, ErrorState, EmptyState
└── pages/              # Login, Register, Dashboard (tab router), NotFound
```

## 5. Data flow (chat send — sabse critical path)

```
UI → POST /api/chat/stream {conversationId?, model, message}
  → requireAuth → rateLimit(chat) → zod validate
  → modelRegistry.assertAllowed(model) → quota.check(user)
  → store.saveUserMessage → aiProvider.stream → SSE chunks
  → onDone: store.saveAssistantMessage + usageTracker.record
  → client: reader → append tokens (aria-live polite) → invalidate usage/conversations
```

## 6. Scale story (bina rewrite ke)

1. **Stateless API:** JWT verify + DB-backed refresh → replica badhao, koi sticky session nahi.
2. **SSE:** short-lived connections; LB timeout 120s; reconnect client-side `Last-Event-ID`-style (conversationId+messageId cursor).
3. **DB:** index har `user_id` FK par; cursor/keyset pagination ready; read-replica: `postgresStore` me `reader/writer` pool split ka hook.
4. **Hot paths:** `GET /models`, usage summary → Redis cache hook (interface ready, memory fallback).
5. **Heavy work (Phase-2):** file-parse/embedding ke liye `jobs` table + worker process (BullMQ-ready design, abhi sync-safe chhote kaam hi).
6. **Multi-region (bataya, banaya nahi):** Postgres read replicas + S3 CRR + CDN; writes single-region.

## 7. Kya nahi banaya (aur kab banega)
- API gateway / service mesh — 1 service par overkill; Nginx + LB kaafi.
- Kafka/RabbitMQ — job volume abhi DB-queue se sambhal jayega.
- GraphQL — CRUD + stream REST/SSE me simple; client team badhne par reconsider.
- K8s — Compose + 2 replicas 10k users tak; uske baad K8s manifests (doc 10 me migration note).
