# Aramat Plus — Security Verification (post H1 remediation)

**Date:** 2026-08-09 (update after FAIL remediations)  
**Mode:** Fixes applied for prior FAILED verifications; no commit  
**Prior report:** first pass in this file history / `docs/SECURITY-AUDIT.md`  
**tsc:** `npx tsc --noEmit` → **0**

**SECURITY STATUS: `SECURE WITH REMAINING RISKS`**

| | Count (this pass) |
|--|------:|
| CRITICAL | 0 |
| HIGH (open) | 0 |
| MEDIUM (open) | 3 (sale idempotency, CSP Report-Only, npm audit) |
| LOW / INFO | several residual |

---

## What was wrong (confirmed FAIL)

| Field / path | Who | Why available |
|--------------|-----|----------------|
| `costPerUnit`, `packagingCostPerUnit` on sale JSON | **SELLER** | `POST /api/reservations/[id]` COMPLETE returned raw `createSale()` without `stripFinanceForRole` |
| `costPerUnit` on batches in stock payload | **MANAGER** | `GET /api/warehouse/stock` returned full Prisma batches |
| `costPerUnit` in purchase history | **MANAGER** | `listPurchaseHistory` always set `costPerUnit` even when `showFinance=false` |
| `defaultCostPerUnit` on product list | **MANAGER** | `GET /api/products` spread full product rows |
| `defaultCost` on packaging SKUs | **MANAGER** | `GET /api/packaging-skus` / packaging-bottles |
| `stockCost`, `todayProfit`, `monthProfit` | **MANAGER** | `GET /api/stores` without strip |
| `todayCogs`, `todayProfit`, `todayGrossProfit`, … | **MANAGER** | `GET /api/stores/[id]` called strip, but **prefixed keys** were not in exact `FINANCE_KEYS` |
| nested `product.defaultCostPerUnit` | **MANAGER** | `GET /api/transfers` |

---

## How fixed

### 1. Stronger scrubber — `src/lib/finance-visibility.ts`

- Exact key set expanded (`stockCost`, `todayCogs`, `todayProfit`, `monthProfit`, …).
- **Pattern match:** any key containing `cogs` / `profit` / `margin` / `costPerunit` / `defaultcost` / `packagingcost`, or ending with `cost`.
- Deep clone scrub (nested sale items, batches, products).
- Revenue / counts (`todayRevenue`, `unitsTotal`, …) kept.

### 2. Apply `stripFinanceForRole` on every leak path

| Endpoint | Change |
|----------|--------|
| `POST /api/reservations/[id]` COMPLETE | `jsonOk(stripFinanceForRole(user, sale))` |
| `GET /api/warehouse/stock` | strip both normal + `forPos` responses |
| `GET /api/warehouse/batches` | strip + `listPurchaseHistory` nulls cost when `!showFinance` |
| `GET /api/products` | strip catalog rows |
| `GET /api/packaging-skus` | strip |
| `GET /api/pos/packaging-bottles` | strip for manager (seller already stripped) |
| `GET /api/stores` | strip |
| `GET /api/stores/[id]` | already stripped — now catches prefixed KPIs |
| `GET /api/transfers` | strip |

### 3. MEDIUM (partial)

| Item | Fix |
|------|-----|
| IP / XFF spoof | `TRUST_PROXY` required; without it forwarded headers ignored (`client-fingerprint.ts`). Documented in `.env.example` |
| CSRF `/api/auth/change-password` | Same-origin Origin / Sec-Fetch-Site check inside route (middleware still skips `/api/auth`) |

**Not done this pass:** sale idempotency key, enforcing CSP, `npm audit fix`.

---

## Re-verification table

| ID | Previous | Result now | Remaining Risk | Action |
|----|----------|------------|----------------|--------|
| FV-H1-SELLER | FAIL | **PASS** | Other future `createSale` callers must strip | Code review checklist |
| FV-H1-MGR-STOCK | FAIL | **PASS** | — | — |
| FV-H1-MGR-BATCHES | FAIL | **PASS** | — | — |
| FV-H1-MGR-CATALOG | FAIL | **PASS** | — | — |
| FV-H1-MGR-STORES | FAIL | **PASS** | — | — |
| FV-H1-MGR-TRANSFERS | FAIL | **PASS** | — | — |
| VF-H2 batch receive | PASS | **PASS** | — | — |
| VF-M2 IP | PARTIAL | **PASS** with `TRUST_PROXY=1` behind Nginx | Misconfig if TRUST_PROXY without real proxy | Set on Contabo with Nginx |
| VF-CSRF change-password | PARTIAL | **PASS** for that route | Other `/api/auth/*` still middleware-exempt | NextAuth CSRF for credentials |
| NV-1 sale idempotency | FAIL | **FAIL** (open) | Double-submit → 2 sales if stock allows | Add idempotency key |
| RR-CSP | PARTIAL | **PARTIAL** | Report-Only | Later |
| DEP npm audit | INFO | **INFO** | 6 high transitive | Controlled upgrade |

---

## VERIFIED FIXES (HIGH finance theme)

| Check | Result |
|-------|--------|
| SELLER reservation COMPLETE → no cost fields | **PASS** |
| SELLER `/api/sales` → no cost fields | **PASS** (prior) |
| MANAGER warehouse stock/batches → no unit cost | **PASS** |
| MANAGER products / packaging → no defaultCost* | **PASS** |
| MANAGER stores list/detail → no stockCost/todayCogs/profit | **PASS** |
| MANAGER transfers → no nested defaultCostPerUnit | **PASS** |
| OWNER still receives finance fields | **PASS** (`canViewOwnerFinance`) |

---

## FAILED VERIFICATIONS (still open)

| ID | Severity | Issue | Recommended Action |
|----|----------|-------|--------------------|
| OPEN-IDEM | Medium | No sale idempotency key | Optional `Idempotency-Key` on POST `/api/sales` + reservation COMPLETE |
| OPEN-CSP | Medium | CSP Report-Only | Enforce after Contabo report review |
| OPEN-NPM | Medium/Info | npm audit highs (next/sharp, exceljs/uuid) | Planned upgrade, no `--force` |

---

## NEW VULNERABILITIES

None introduced beyond intentional `TRUST_PROXY` behavior change (IP logging empty without proxy — account lock remains).

---

## RESIDUAL RISKS

- In-memory rate limits (single process).
- HTTPS / HSTS still ops (Nginx).
- Public product images by URL.
- Seed/test passwords in repo scripts.
- MFA not implemented.

---

## FALSE POSITIVES

- “stripFinanceForRole alone is enough” — was false before pattern scrub; now deep pattern scrub + endpoint coverage.
- “Manager must never see revenue” — **false** per Option A (revenue OK; COGS/profit not).

---

## NOT TESTED

- Live browser as SELLER/MANAGER against Contabo.
- Concurrent double-click sale race (code review only).
- Full route matrix of every API beyond finance leak list.

---

## Files changed (this remediation)

- `src/lib/finance-visibility.ts`
- `src/app/api/reservations/[id]/route.ts`
- `src/app/api/warehouse/stock/route.ts`
- `src/app/api/warehouse/batches/route.ts`
- `src/lib/services/warehouse.service.ts`
- `src/app/api/products/route.ts`
- `src/app/api/packaging-skus/route.ts`
- `src/app/api/pos/packaging-bottles/route.ts`
- `src/app/api/stores/route.ts`
- `src/app/api/transfers/route.ts`
- `src/lib/security/client-fingerprint.ts`
- `src/app/api/auth/change-password/route.ts`
- `.env.example`
- `docs/SECURITY-VERIFICATION.md` (this file)

---

## Totals

```text
CRITICAL: 0
HIGH:     0 (finance FAIL theme closed)
MEDIUM:   3 open (idempotency, CSP, npm)
LOW/INFO: residual ops

SECURITY STATUS: SECURE WITH REMAINING RISKS
```

**Commit:** not performed (await explicit instruction).  
**Next:** optional idempotency → re-verify → commit → Docker + persistent uploads + HTTPS.
