# 05 — Authentication Design (Google-Login-Ready)

## 1. Abhi (implemented): email+password + JWT pair

```
login/register → access JWT (15 min, memory me) + refresh (opaque, httpOnly cookie `rt`)
request → Authorization: Bearer <access> → requireAuth verify
access expire → POST /auth/refresh (cookie) → naya pair (rotation)
```

- **Access token (JWT):** `{ sub:userId, email, sid(sessionId), iat, exp }`, HS256, TTL 15m.
  Chhota rakha (koi PII-baggage nahi) taaki har request par bhejna sasta ho.
- **Refresh token (opaque):** `crypto.randomBytes(48)` → **SHA-256 hash** DB me (`refresh_tokens` table),
  cookie `rt` me raw value: `HttpOnly; Secure(prod); SameSite=Lax; Path=/api/auth; Max-Age=30d`.
- **Rotation + reuse detection:** har refresh par purana token revoke + naya issue; agar revoked token
  dobara aaye → puri session-family revoke + security log (token-theft signal).
- **Password:** bcrypt cost 12, policy ≥8 + letter + digit; login par timing-safe compare (bcrypt default);
  user-enumeration rokne ke liye login error hamesha generic: `Invalid email or password`.
- **Logout:** current refresh revoke + cookie clear. "Logout all devices" = `DELETE /settings/account`-style
  `revokeAllSessions(userId)` (settings danger-zone se available, doc 04).

## 2. Google Login baad me — bina breaking change (design ready)

**Interface (implemented, `backend/src/services/authProviders.ts`):**

```ts
export interface AuthProvider {
  readonly id: 'local' | 'google';            // 'github','microsoft' baad me
  beginLogin(input: unknown): Promise<{ redirectUrl: string; state: string }>;
  handleCallback(query: unknown): Promise<ExternalIdentity>; // { sub, email, emailVerified, name?, avatarUrl? }
}
export interface ExternalIdentity { provider: 'google'; sub: string; email: string; emailVerified: boolean; name?: string; avatarUrl?: string; }
```

**DB (already in schema, doc 07):** `users.provider ('local'|'google')`, `users.provider_sub UNIQUE NULLS NOT DISTINCT`… Postgres me partial unique index; `users.password_hash NULLABLE` (OAuth users ka NULL).

**Account-linking policy (faisla, abhi se frozen):**
1. Google callback me `email_verified=true` **mandatory** — false ho to login reject (account-takeover via unverified email rokna).
2. Same verified email se `local` user pehle se hai → **link** (provider=both via `user_identities` table, Phase-2 me; Phase-1 me `provider` column upgrade + password rakho taaki dono raaste kaam karein).
3. Same `google.sub` dobara → seedha login, `last_login_at` update.
4. CSRF: `state` (signed, 10m) + `nonce`; PKCE (S256) mandatory.

**Routes (stub live, `501 AUTH_PROVIDER_NOT_ENABLED`):**
`GET /api/auth/google` → 302 Google (jab `GOOGLE_CLIENT_ID/SECRET` set) · `GET /api/auth/google/callback` → code exchange → find-or-link → **wahi JWT pair issue** (client ko farq nahi padta — yahi "Google-ready" ka matlab hai).

**Estimate:** env + `googleapis`/openid-client wiring ≈ 80 lines + 3 tests (link, verified-reject, sub-login).

## 3. Sessions & devices (abhi minimal, shape future-proof)
- `refresh_tokens(id, user_id, token_hash, family_id, expires_at, revoked_at, user_agent, ip, created_at)`.
- "Active sessions" list UI Phase-2 me isi table se (koi migration nahi).

## 4. Threats specific to auth (mitigations implemented)
| Threat | Mitigation |
|---|---|
| Refresh theft (XSS) | httpOnly cookie (JS padh hi nahi sakta); access sirf memory me |
| Refresh theft (network) | Secure + TLS-only prod; SameSite=Lax |
| Reuse/replay | Rotation + family revoke on reuse |
| Brute force | `/auth/*` strict rate limit (20/min/IP) + bcrypt cost + generic errors |
| CSRF on cookie refresh | SameSite=Lax + refresh sirf same-site SPA se; mutating auth calls ko `Origin` check (prod) |
| JWT alg confusion | `algorithms:['HS256']` pinned; alag access/refresh secrets |
| Google unverified-email takeover | `email_verified` mandatory (upar) |

## 5. Secrets handling (auth-specific)
- JWT secrets env-only, prod boot-time length check (≥32 chars) — fail-closed.
- Token hashes (SHA-256) DB me; raw refresh **kabhi log/DB me nahi**.
- Password kabhi response/log me nahi; register/login responses me `password_hash` select hi nahi hota.
