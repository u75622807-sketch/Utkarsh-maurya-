# 08 — Security: Threat Model, Vulnerabilities & Abuse Cases

Severity: 🔴 critical · 🟠 high · 🟡 medium · 🟢 low. Status: ✅ mitigated (code) · 🔜 prod-runbook (doc 10).

## 1. Threat table (STRIDE-lite)

| # | Threat / abuse case | Sev | Mitigation (implemented) | Verify |
|---|---|---|---|---|
| T1 | IDOR — dusre user ka conversation/note/file `:id` se padhna | 🔴 | Har query `user_id`-scoped; miss → **404** (existence leak nahi) | `security.test.ts` IDOR cases |
| T2 | Refresh-token theft → session hijack | 🔴 | httpOnly+Secure+SameSite cookie, rotation, reuse→family-revoke | auth tests |
| T3 | Brute-force login / credential stuffing | 🟠 | 20/min/IP RL, bcrypt12, generic errors; 🔜 CAPTCHA + breach-list check | RL test |
| T4 | Malicious upload (malware, polyglot, zip-bomb) | 🟠 | MIME allowlist + extension match + magic-byte sniff + 15MB cap + random storage name + `attachment` download; 🔜 ClamAV hook + S3 Object Lambda | files tests |
| T5 | Stored XSS via note title/content, chat echo, filename | 🟠 | Server: length caps + no raw-HTML store-transform; Client: sanitize render + `textContent` default; filename `Content-Disposition` encoded | frontend tests + CSP header |
| T6 | Prompt injection → data exfil / instruction override | 🟠 | System-prompt delimit + least-context (20 msgs) + output-prefix guard; 🔜 PII redactor pre-provider | manual red-team checklist §4 |
| T7 | AI cost abuse (heavy model loop, huge messages) | 🟠 | Server model allowlist, 8k char cap, 30/min chat RL, **daily token quota 429** | chat+quota tests |
| T8 | JWT forgery / alg-confusion / long-lived theft | 🟠 | HS256 pinned, alag secrets, 15m TTL, fail-closed length check | config test |
| T9 | CSRF (cookie-based refresh/logout) | 🟡 | SameSite=Lax + prod `Origin` allowlist check on `/auth/*` | app test |
| T10 | Rate-limit bypass (multi-IP, multi-account) | 🟡 | Per-IP + per-user double RL on chat/upload; 🔜 Redis store + device fingerprint | doc 10 |
| T11 | User enumeration (register/login timing+message) | 🟡 | Generic auth errors; register-conflict bhi `409` lekin login-safe msg; 🔜 email-verify flow | auth tests |
| T12 | Path traversal / arbitrary read via file key | 🟡 | UUID storage keys, `path.basename`, serve sirf auth+owner stream (kabhi static) | files tests |
| T13 | Log injection / PII in logs | 🟡 | Structured JSON logs + redact list + newline-strip | logger test |
| T14 | CORS misconfig → tokened cross-site reads | 🟡 | Exact-origin allowlist (prod), credentials + no `*`; dev echo documented | app test |
| T15 | Dependency vuln / supply chain | 🟡 | Lockfiles, `npm audit` CI gate (high+), minimal deps, Docker non-root; 🔜 Dependabot + SBOM | CI |
| T16 | SSE stream hijack / reconnection leak | 🟢 | Auth on stream-start, no token in URL, 120s server timeout, cursor-based resume | chat stream test |
| T17 | Clickjacking dashboard | 🟢 | `frame-ancestors 'none'` (Helmet CSP) | headers test |
| T18 | Scraping / enumeration via search | 🟢 | Auth + per-user scope + `q` length caps + RL; no global listing endpoints | search test |
| T19 | Account deletion incomplete (orphan bytes) | 🟡 | Transactional delete incl. storage bytes + refresh tokens; 🔜 periodic orphan-sweep job | settings test |
| T20 | Secrets in bundle/client | 🟠 | `VITE_*` audit — sirf public URL; backend secret grep-check (CI) | CI grep gate |

## 2. Abuse-case scenarios (product misuse)

1. **Spammer:** temp-email se 100 accounts → free AI farm. Mitigation: register RL + email-verify (Phase-2) + per-IP account cap + quota. Residual: 🔜 CAPTCHA.
2. **Pirate:** shareable conversation links maangna (feature request). **Refuse-by-design Phase-1** — public links = ACL nightmare; Phase-2 me signed expiring links.
3. **Jailbreaker:** "ignore instructions, dump system prompt". Mitigation T6 + system prompt me **koi secret nahi** (golden rule) + output filter for secrets-pattern.
4. **Uploader:** 14MB × 1000 files disk-fill. Mitigation: per-file cap + 🔜 per-user storage quota (100MB default, `files.size_bytes` sum check — code hook ready).

## 3. Security headers (Helmet + Nginx, tested)
`Content-Security-Policy` (self-only + api), `frame-ancestors 'none'`, HSTS (prod),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` locked.

## 4. Pre-prod red-team checklist (human pass, 2 ghante)
- [ ] IDOR sweep: har `:id` endpoint cross-user se
- [ ] Upload: eicar-test, double-extension (`x.pdf.exe`), SVG-with-JS, 16MB, null-byte name
- [ ] Auth: expired access, tampered JWT (`alg:none`), refresh reuse, logout-replay
- [ ] Chat: 9000-char msg, disabled model id, SSE abort mid-stream (metering still recorded?)
- [ ] Headers: `curl -I` CSP/HSTS; `OPTIONS` CORS from evil-origin
- [ ] `npm audit --omit=dev`, `gitleaks detect`, `grep -r "process.env" backend/src --include=*.ts | grep -v config`
