# FINAL PRODUCT CERTIFICATION — Aramat Plus CRM
**Date:** 2026-08-03  
**Mode:** Audit only (no code changes)  
**Methods:** Code review · HTTP probes under `manager@aromat.plus` · existing unit/recert scripts · i18n key diff  
**Browser UI walkthrough:** blocked in this environment (`chrome-error` to local Next); UI claims rely on prior proofs + code/HTTP.

---

## Verdict

**NOT ready for commercial multi-store (100 branches) yet.**

Recent Waves fixed wipe, packaging plan-cost, and *part* of Manager RBAC.  
Final cert found **remaining Critical store-scope IDOR** and **data-integrity risk in archive purge**.

| Gate | Result |
|------|--------|
| Wipe / empty CRM | PASS (recert) |
| Packaging cost OWNER path | PASS (recert) |
| Manager UI/API holes (users/journal/cost PATCH) | PASS (HTTP) |
| Manager store isolation (full) | **FAIL** |
| Archive purge safety | **FAIL** |
| i18n key parity RU↔TJ | PASS |
| Dynamic/seed RU strings in TJ mode | PARTIAL |
| Gift rules in POS | FAIL (feature incomplete) |
| OWNER_DIRECT after wipe | PARTIAL (by design empty; no in-app recreate) |

---

## Live HTTP evidence (Manager IDOR)

```
managerStoreId: cmsd8s335001eump064055md0  (own)
otherStoreId:   cmsd8s3ao001gump0l7k3j2i0  (foreign)

GET /api/stores/{other}           → 403  PASS (parent scoped)
GET /api/stores/{other}/sales     → 200  FAIL IDOR
GET /api/stores/{other}/stock     → 200  FAIL IDOR
GET /api/stores/{other}/returns   → 200  FAIL IDOR
GET /api/stores/{own}/sales       → 200  PASS
GET /api/users                    → 403  PASS
GET /api/journal                  → 403  PASS
GET /api/transfers                → 200  company-wide (len≥1)
GET /api/warehouse/stock          → 200  company warehouse
```

Script: `scripts/zt-final-cert-idor2.ts`

---

## Module certification matrix

| Module | Status | Notes |
|--------|--------|-------|
| Auth / login / session | PASS | Roles login; seller→POS, owner/mgr→dashboard |
| Dashboard (Owner) | PASS | Network KPIs coherent with sales/expenses |
| Dashboard (Manager) | PARTIAL | Scoped via `scopedStoreId`, but notifications inject **unscoped** `getDashboardPayload(companyId)` |
| Analytics / Finance | PARTIAL | Owner OK; Manager analytics scoped; export still exposes product **cost** to Manager |
| Reports / XLSX export | PARTIAL | Localized headers PASS; cost column leak for Manager; DB names RU in TJ |
| Stores list | PASS | Manager sees only assigned store |
| Store detail parent API | PASS | `requireStoreAccess` on `/api/stores/[id]` |
| Store child APIs (sales/stock/returns/…) | **FAIL** | IDOR — see evidence |
| Sales / transfers / reservations APIs | **FAIL** | No `scopedStoreId` force for Manager |
| Warehouse catalog / receive | PARTIAL | Owner flows OK; Manager can receive into central WH; cost `?? 1` invent risk |
| Packaging | PARTIAL | Autospeed off PASS; OWNER cost update PASS; Manager cost PATCH 403 PASS; invent cost=1 if empty |
| POS Seller | PASS* | Prior HTTP/POS proofs; *not re-walked in browser this session |
| Returns | PARTIAL | Approve OWNER-only (API+UI) PASS; Manager list scoped PASS; create-notif RU hardcoded |
| Discounts | PARTIAL | Approve OWNER-only; list store-scoped; gift rules UI without POS runtime |
| Gift rules | **FAIL** | UI/API exist; sale engine does not apply gifts |
| Reservations | PARTIAL | Works for seller; Manager API not fully store-forced |
| Revision | PARTIAL | Blind mode PASS; create scoped PASS; **PATCH** missing store-scope check |
| Expenses | PASS | Create OWNER-only; list scoped for Manager |
| Users / Team | PASS | Page+API OWNER-only |
| Journal | PASS | OWNER-only UI+API |
| Notifications | PARTIAL | Keys mostly OK; packaging/return create messages RU; dash merge unscoped for Manager |
| Settings company | PARTIAL | Owner OK; Manager can open page, write APIs 403 (confusing UX) |
| Wipe CRM | PASS | Empty catalog/stores; single wipe journal row; owner reset |
| OWNER_DIRECT after wipe | PARTIAL | Correctly deleted; **no** in-app recreate CTA (`ensureOwnerDirectStore` unused in app) |
| Archive + retention purge | **FAIL** | `hardDeleteProductCascade` deletes `saleItem` → history/COGS corruption risk |
| Write-offs | PASS | OWNER-only middleware+API |
| i18n RU/TJ keys | PASS | 1407/1407 parity |
| i18n runtime strings | PARTIAL | Notifications, analytics fallbacks, seed names still RU |
| Dirty data (NaN/stack) | PARTIAL | API errors sanitized; `formatDate*` can show Invalid Date; enum fallbacks raw |
| Performance | PARTIAL | Opportunistic archive purge on owner session; no cron; no deep render profiling this run |

\*Seller POS: prior certs in repo; not visually re-verified today.

---

## Critical / High findings (must fix before 100-store launch)

### C1. Manager IDOR on store child routes — CRITICAL
**What:** Parent store denied, but `/sales|/stock|/returns|/discounts|/revisions|/requests|/staff` return 200 for another branch.  
**Why:** Only `companyId` checked.  
**Fix:** `requireStoreAccess(user, id)` on every `/api/stores/[id]/*`; same for revision PATCH, sales/transfers/reservations GET/POST.  
**Where:** `src/app/api/stores/[id]/*/route.ts`, `sales/route.ts`, `transfers/route.ts`, `reservations/route.ts`, `revisions/route.ts` PATCH.

### C2. Archive purge deletes sale lines — CRITICAL
**What:** `hardDeleteProductCascade` → `saleItem.deleteMany`.  
**Why:** Soft-archive TTL can erase COGS history → wrong profit/exports.  
**Fix:** Block purge if sales exist, or soft-null product refs without deleting sale items.  
**Where:** `src/lib/services/archive-retention.service.ts`.

### H1. Notifications / warehouse / transfers leak network view to Manager — HIGH
**Where:** `notifications/route.ts` (unscoped dashboard), `warehouse/*`, `transfers`.

### H2. Export product costs to Manager — HIGH
**Where:** `src/app/api/export/route.ts`.

### H3. Packaging receive invents cost `1` — HIGH
**Where:** `packaging/page.tsx` `?? 1`; manager path can still send cost if plan null.

### H4. OWNER_DIRECT absent after wipe with no recreate UX — HIGH (ops)
**Where:** wipe + unused `ensureOwnerDirectStore` in app runtime.

### H5. Gift rules incomplete — HIGH (product honesty)
**Where:** discounts UI vs `sale.service.ts` (no gift apply).

---

## Medium / Low (non-blocking for pilot, blocking for polish)

| ID | Severity | Issue |
|----|----------|-------|
| M1 | Medium | Manager opens Settings→Company / wipe card → 403s |
| M2 | Medium | RU notifications (packaging low stock, return create) |
| M3 | Medium | Analytics fallbacks «Разливной/Штучный» |
| M4 | Medium | `formatDate*` Invalid Date risk |
| M5 | Medium | Nav «Остатки магазинов» → central WH all stores |
| M6 | Medium | Archive purge only when Owner opens app (no cron) |
| L1 | Low | Dead `/more` redirect; orphan route names |
| L2 | Low | Filename `aramat-*.xlsx` English OK |

---

## What already PASSes (do not regress)

- Wipe: no packaging autospeed; all stores deleted; single «CRM очищена…» journal row; owner → `owner@aromat.plus` / `owner1234`
- Packaging: OWNER receive updates plan cost; Manager `PATCH defaultCost` → 403
- Users/Journal/Wipe/Write-offs: Manager blocked UI+API
- Product create/edit/price/cost: OWNER-only
- Revision blind discrepancy for non-Owner
- Expense create: OWNER-only
- RU/TJ message catalog key parity

---

## Recommended next Wave (fixes only — no new features)

1. Close **C1** store-scope IDOR across all Manager-readable/writable APIs + HTTP proof.  
2. Close **C2** archive purge / sale history.  
3. Scope notifications + transfers + warehouse reads for Manager (or explicitly document WH as company-shared).  
4. Strip cost from Manager export; require explicit cost on packaging receive.  
5. OWNER_DIRECT empty-state + one-click ensure after wipe.  
6. Hide gift UI or wire into sale (decide one).  
7. Then re-run this cert + real Browser Walkthrough on Owner/Manager/Seller.

---

## Certification statement

> Aramat Plus is **not** certified for unsupervised multi-store commercial deployment until Critical **C1** and **C2** are closed and re-proven.  
> Core Owner warehouse/POS/wipe paths are substantially stronger than earlier waves; remaining risk is concentrated in **Manager cross-store data access** and **destructive archive cascade**.
