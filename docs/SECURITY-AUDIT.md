# Aramat Plus — Security Audit & Remediation Report

**Date:** 2026-08-09  
**Scope:** OWASP Top 10:2025 · OWASP API Security Top 10:2023 · CWE Top 25 · Next.js / Prisma / uploads / business logic  
**Method:** Code audit → fix Critical/High/Medium (brute force included) → `npx tsc --noEmit` = 0  
**Note:** A literal “all CVEs” list is impossible; this report covers the relevant **classes** for this ERP/POS.

---

## Summary

| Severity | Found | Fixed this pass | Residual / deferred |
|----------|------:|----------------:|---------------------|
| Critical | 0 | — | — |
| High | 3 | 3 | npm transitive (Next/sharp) — upgrade carefully |
| Medium | 6 | 6 | CSP still Report-Only (intentional) |
| Low / Info | several | partial | Redis throttle when multi-instance; MFA optional |

**Brute force:** Login already had account lock + IP throttle. Gaps fixed: change-password brute force, IP spoof via forged `X-Forwarded-For`, timing enumeration on unknown emails.

---

## Table — Findings

| ID | Severity | Category | File | Problem | Impact | Fix | Status |
|----|----------|----------|------|---------|--------|-----|--------|
| H1 | High | A01 / API3 | `api/sales`, `finance-visibility`, `stores/[id]/sales` | Seller/Manager got `costPerUnit` / packaging cost in sale JSON | COGS leak → margin reconstruction | `stripFinanceForRole` + expand finance keys | **Fixed** |
| H2 | High | A01 / BFLA | `api/products/[id]/batches` | Manager could set batch cost + catalog `salePrice` | Privilege to rewrite COGS/price | Force planned cost; catalog price OWNER-only; strip cost in response | **Fixed** |
| H3 | High | A02 | `docker-compose.prod.yml` | Default `POSTGRES_PASSWORD:-aramat` | Weak DB on naive deploy | Required env (`:?`); Postgres not published | **Fixed** |
| M1 | Medium | A07 | `lib/auth.ts` | Missing user skipped bcrypt → timing enum | Account existence leak | Dummy bcrypt on unknown/inactive | **Fixed** |
| M2 | Medium | A07 | `client-fingerprint.ts` | Leftmost XFF trusted → IP throttle bypass | Credential stuffing rotates fake IP | Prefer edge headers; XFF **rightmost** public hop | **Fixed** |
| M3 | Medium | A01 CSRF | `middleware.ts` | Missing Origin skipped CSRF check | Cross-site cookie POST | Require Origin match or `Sec-Fetch-Site` same-origin/site | **Fixed** |
| M4 | Medium | A07 | `auth/change-password` | No limit on wrong `currentPassword` | Session brute-force password | Per-user + IP throttle (5/15m) | **Fixed** |
| M5 | Medium | A03 XSS | discount/returns/expenses/revisions/… | Free-text fields without sanitize | Stored markup if HTML sink appears | `plainName` / `optionalPlainText` | **Fixed** |
| M6 | Medium | A02 | `next.config.ts` | CSP Report-Only + unsafe-inline | Weaker XSS defense-in-depth | Keep Report-Only until Contabo review | **Deferred** (by design) |
| M7 | Medium | API4 | `api/sales`, `api/products`, `action-rate-limit.ts` | No write flood limit on create sale/product | Authed DoS / duplicate storms | 60 sales/min, 30 products/min per user → 429 | **Fixed** |
| L1 | Low | A04 | `auth.config.ts` | Cookie flags implicit | Session cookie hygiene | Explicit httpOnly / sameSite=lax / secure + 12h maxAge | **Fixed** |
| L2 | Low | A02 / Secret Leak | `.gitignore` | `.env.prod` not ignored | Accidental commit of prod secrets | Ignore `.env.*` + `.env.prod` | **Fixed** |
| BF* | — | A07 | `login-rate-limit.ts` | (existing) | — | Account lock after 5 fails; IP 25 fails / 15m | **Already present** |
| DEP | High | A03 Supply Chain | `npm audit` | next/sharp, uuid via exceljs | Known advisories | Do not `audit fix --force` blindly | **Open** (tracked) |

---

## Per-vulnerability detail (how fixed)

### H1 — COGS in sale responses (Broken Object Property Authorization)

**Why:** `createSale` / `GET /api/sales` returned `SaleItem.costPerUnit` and `packagingCostPerUnit` to sellers. Managers already lost dashboard COGS via `stripFinanceForRole`, but sales APIs did not scrub unit costs.

**Exploit:** Seller opens DevTools → sale payload → reconstructs purchase cost and margin.

**Fix:**
- Extended `FINANCE_KEYS` with `costPerUnit`, `packagingCostPerUnit`, `defaultCostPerUnit`, `defaultCost`.
- Applied `stripFinanceForRole` on `GET`/`POST` `/api/sales` and `GET` `/api/stores/[id]/sales`.

**Verify:** Login as SELLER → create/list sale → JSON must not contain cost fields. OWNER still sees them.

---

### H2 — Manager batch receive sets cost & catalog price

**Why:** Packaging path forced planned cost for managers; **STANDARD** products accepted arbitrary `costPerUnit`. `updateCatalogPrice` + `salePrice` worked for managers.

**Exploit:** Manager POSTs batch with fake low cost / new sale price → pollutes finance and shelf price without OWNER.

**Fix:**
- Non-owners always use `product.defaultCostPerUnit` (403 if missing).
- Catalog price update only when `isOwnerClass`.
- Batch create response strips `costPerUnit` for non-owners.

**Verify:** As MANAGER, POST batch with foreign `costPerUnit` → stored cost = planned; `updateCatalogPrice` ignored.

---

### H3 — Default Postgres password in prod compose

**Why:** `${POSTGRES_PASSWORD:-aramat}` allowed deploy without secrets.

**Fix:** Compose `${VAR:?message}` fail-closed; Postgres has **no host ports** (compose network only).

**Verify:** `docker compose -f docker-compose.prod.yml config` without env must fail.

---

### M1 / Brute-force adjacent — login timing

**Why:** Unknown email returned before `bcrypt.compare`.

**Fix:** Always run `bcrypt.compare` against a fixed dummy hash for unknown/inactive users.

---

### M2 / Brute-force — IP throttle bypass

**Why:** Client-controlled leftmost `X-Forwarded-For` became “IP”.

**Fix:** Prefer `cf-connecting-ip` / `x-real-ip`; for XFF use **rightmost** public hop (proxy-appended).

**Ops note:** Nginx must set `X-Real-IP $remote_addr` and append to XFF.

---

### M3 — CSRF Origin gap

**Why:** Mutating `/api/*` without `Origin` skipped the check.

**Fix:** Allow only matching Origin **or** `Sec-Fetch-Site: same-origin|same-site`.

**Verify:** Cross-origin POST with session cookie → 403.

---

### M4 / Brute-force — change-password

**Why:** Authenticated attacker could spam `currentPassword` with no lock.

**Fix:** `password-change-rate-limit.ts` (5 fails / 15 min per user) + reuse IP login throttle; success clears counters and resets `failedLoginCount`.

**Verify:** 5 wrong current passwords → `ACCOUNT_LOCKED`.

---

### Login brute-force (already present — verified)

| Control | Behavior |
|---------|----------|
| Account lock | After **5** consecutive fails: 30s → 60s → 120s → exponential cap **15m** (`accountLockDurationMs`) |
| IP throttle | **25** fails / 15m window → 15m IP block |
| Logging | `LOGIN_FAIL` / `LOGIN_LOCKED` + owner notify on lock |
| Passwords | bcrypt (`bcryptjs`) cost 10 |

---

### M5 — XSS text sinks

**Why:** Reasons/notes/descriptions on discounts, returns, expenses, revisions, reservations, preferences, return-in used raw `z.string()`.

**Fix:** Routed through `plainName` / `optionalPlainText` (same as brands/products).

**Note:** React already escapes text nodes; this is defense-in-depth for storage.

---

### L1 — Session cookies

**Fix:** `useSecureCookies` in production; explicit `httpOnly`, `sameSite: "lax"`, `secure` in prod; session `maxAge` 12h.

---

## Classes checked — no Critical exploit found

| Class | Result |
|-------|--------|
| SELLER → OWNER APIs | Blocked by `requireOwner` / `requireOwnerOrManager` on handlers |
| Mass-assign `role: OWNER` | `assertAssignableRole` / no OWNER in assignable set |
| SQL injection | Prisma tagged `$queryRaw` only; no string concat |
| Upload path traversal | `resolveSafeProductFile` basename + `.webp` + dir resolve |
| Unrestricted upload | Owner-only, mime + sharp→webp, size cap |
| passwordHash in JSON | Selected out of user APIs |
| Stack traces to client | `handleApiError` allowlist |
| Oversell / double sale | FIFO + row locks |
| Public password reset enum | No public self-reset (owner reset only) |
| Debug photo route | 404 in production |

---

## Business-logic matrix (SELLER)

| Attempt | Result |
|---------|--------|
| Call OWNER user admin | 403 |
| Change `storeId` on sale | Forced to `user.storeId` |
| Change product price/cost endpoints | `requireOwner` |
| See COGS on sales (after fix) | Scrubbed |
| Create OWNER user | Blocked |
| Sell over stock | Atomic FIFO reject |

---

## Supply chain (`npm audit`)

8 production advisories (2 moderate, 6 high), mainly **Next nested sharp/postcss** and **exceljs→uuid**.  
**Not auto-forced:** `npm audit fix --force` would jump Next / downgrade exceljs. Plan a controlled Next patch upgrade separately.

---

## Residual risks (not “fixed” this pass)

1. **CSP** still Report-Only — tighten after live report review.  
2. **In-memory** throttles — OK for single PM2 instance; use Redis if multi-instance.  
3. **HTTPS / HSTS** — requires domain + reverse proxy on Contabo (ops).  
4. **MFA** — not implemented (optional for OWNER).  
5. **Dependency upgrades** — scheduled, not forced here.  
6. Server-side API test scripts without `Origin` / `Sec-Fetch-Site` may get 403 — send those headers in tests.

---

## Full checklist status (classes — not every CVE)

### Priority table for Aramat Plus

| Check | Status | Evidence / notes |
|-------|--------|------------------|
| Broken Access Control | **Pass** (post-fix) | Handler-level `requireOwner*` / `requireSeller`; middleware alone not trusted |
| IDOR / BOLA | **Pass** | `companyId` + `requireStoreAccess` / seller forced `storeId` |
| BFLA (SELLER→OWNER API) | **Pass** | OWNER routes use `requireOwner` |
| BOPLA (role/price/cost) | **Fixed** H1/H2 | COGS stripped; manager cannot set cost/catalog price |
| Auth bypass | **Pass** | Credentials + bcrypt; JWT refreshed from DB |
| Brute force | **Fixed** + existing | Login lock + IP; change-password throttle; XFF harden |
| Session/JWT | **Fixed** L1 | httpOnly, sameSite=lax, secure prod, 12h |
| CSRF | **Fixed** M3 | Origin or Sec-Fetch-Site |
| SQL Injection | **Pass** | No `$queryRawUnsafe`; tagged Prisma only |
| XSS | **Fixed** Stage1–2 + M5 | sanitize + scrub + Zod plain text |
| Path Traversal (uploads) | **Pass** | `resolveSafeProductFile` |
| Unrestricted upload | **Pass** | Owner-only, mime + sharp→webp, size cap |
| SSRF | **Pass** | No user-URL server fetch found |
| Rate-limit bypass | **Fixed** M2/M7 | Login IP + write flood limits |
| Mass Assignment | **Pass** | Zod schemas; role not client-assignable to OWNER |
| Sensitive Data Exposure | **Fixed** H1 | No passwordHash in APIs; COGS scrubbed |
| Security Misconfiguration | **Partial** | Headers OK; CSP Report-Only; HTTPS ops |
| Secret Leakage | **Fixed** L2 | `.env*` gitignored; compose fail-closed |
| Dependency vulns | **Open** DEP | npm audit tracked |
| Docker | **Pass** / **Partial** | non-root USER; no PG publish; Stage 3 full stack later |
| Logging secrets | **Pass** | Activity log metadata without passwords |

### OWASP Top 10:2025

| ID | Category | Status |
|----|----------|--------|
| A01 | Broken Access Control | **Pass** after H1/H2 |
| A02 | Security Misconfiguration | **Partial** (CSP deferred; HTTPS ops) |
| A03 | Software Supply Chain | **Open** DEP |
| A04 | Cryptographic Failures | **Pass** (bcrypt + cookie harden) |
| A05 | Injection | **Pass** (SQL); XSS defense-in-depth **Pass** |
| A06 | Insecure Design | **Pass** (business matrix below) |
| A07 | Authentication Failures | **Pass** after brute-force harden |
| A08 | Software/Data Integrity | **Partial** (lockfile present; no GH Actions) |
| A09 | Logging & Alerting | **Pass** (LOGIN_FAIL/LOCK, password change logs) |
| A10 | Exceptional Conditions | **Pass**/ongoing (error boundaries Stage 1–2; FIFO locks) |

### OWASP API Security Top 10:2023

| ID | Category | Status |
|----|----------|--------|
| API1 | BOLA | **Pass** |
| API2 | Broken Authentication | **Pass** |
| API3 | BOPLA | **Fixed** H1/H2 |
| API4 | Unrestricted Resource Consumption | **Fixed** M7 (+ login limits) |
| API5 | BFLA | **Pass** |
| API6 | Sensitive Business Flows | **Pass** (wipe OWNER-only; stock locks) |
| API7 | SSRF | **Pass** / N/A |
| API8 | Security Misconfiguration | **Partial** |
| API9 | Improper Inventory Management | **Pass** (no public undocumented debug in prod) |
| API10 | Unsafe Consumption of APIs | **Pass** / N/A |

### Uploads / PostgreSQL / Docker (spot)

| Item | Status |
|------|--------|
| Photos in DB as blobs | **Correct design** — DB stores `imageUrl` path only |
| `UPLOAD_DIR` outside `.next` | **Pass** (env + local-fs) |
| `/uploads/products` traversal | **Pass** |
| SVG/HTML/JS upload | **Pass** (webp via sharp only) |
| Postgres exposed to internet (compose.prod) | **Pass** (no host port) |
| Container root | **Pass** (`USER nextjs`) |
| Open redirect `callbackUrl` | **Pass** (same-origin relative only) |
| Server Actions | **N/A** (none found) |

### Business logic — SELLER attempts

| Attempt | Result |
|---------|--------|
| SELLER → изменить OWNER / создать OWNER | **Blocked** |
| SELLER → storeId чужого магазина | **Forced** to own store |
| SELLER → чужой product mutate / price / cost | **403** |
| SELLER → users list/create | **403** |
| SELLER → OWNER analytics COGS | **Scrubbed** / no access |
| SELLER → продать больше остатка | **Rejected** (FIFO) |
| SELLER → finance cost on sale JSON | **Fixed** H1 |

---

## Files changed (this remediation)

- `src/lib/finance-visibility.ts`
- `src/app/api/sales/route.ts`
- `src/app/api/stores/[id]/sales/route.ts`
- `src/app/api/products/route.ts`
- `src/app/api/products/[id]/batches/route.ts`
- `src/lib/security/client-fingerprint.ts`
- `src/lib/security/password-change-rate-limit.ts` *(new)*
- `src/lib/security/action-rate-limit.ts` *(new)*
- `src/app/api/auth/change-password/route.ts`
- `src/lib/auth.ts`
- `src/lib/auth.config.ts`
- `src/lib/api.ts`
- `src/middleware.ts`
- `docker-compose.prod.yml`
- `.gitignore`
- `src/app/api/discount-requests/route.ts`
- `src/app/api/returns/route.ts`
- `src/app/api/me/preferences/route.ts`
- `src/app/api/expenses/route.ts`
- `src/app/api/reservations/[id]/route.ts`
- `src/app/api/warehouse/return-in/route.ts`
- `src/app/api/revisions/route.ts`
- `docs/SECURITY-AUDIT.md` *(this file)*

---

## Verification

```text
npx tsc --noEmit → 0
```

Commit/push not performed (await explicit instruction).

---

## Process note

Правильный цикл для следующих итераций:

**Audit → отчёт Critical/High → точечный fix → повторная проверка → тесты.**

Полный список «всех CVE мира» нецелесообразен; поддерживаем **классы** OWASP/API/CWE и бизнес-матрицу OWNER/SELLER.