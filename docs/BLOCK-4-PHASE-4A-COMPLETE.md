# Block 4 Phase 4a — Completion Report

**Status:** READY FOR ACCEPTANCE (awaiting your UI pass)  
**Date:** 2026-08-01  
**Scope:** Schema + PackagingSku CRUD + Receive packaging · **no POS / dual FIFO**

Spec answers (Q1–Q5) locked as approved, including sealed-vs-open bottle return field for later UI.

---

## 1. Changed / added files

### Docs
- `docs/BLOCK-4-LIQUID-BOTTLE-SPEC.md` (answers locked)
- `docs/BLOCK-4-PHASE-4A-IMPACT.md` (**impact map**)
- `docs/PRODUCT-VISION-LAYER.md` (Block 4 pointer)

### Schema / migration
- `prisma/schema.prisma`
- `prisma/migrations/20260801140000_block4_packaging_sku/migration.sql`
- `prisma/seed.ts` (delete PackagingSku; seed default Skus)

### Backend
- `src/lib/services/packaging.service.ts` (**new**)
- `src/app/api/packaging-skus/route.ts` (**new**)
- `src/app/api/products/route.ts` (`?kind=STANDARD|PACKAGING|all`)
- `src/lib/validators/index.ts` (`packagingSkuSchema`)
- `src/lib/i18n/labels.ts` (actions/entities)

### UI / nav
- `src/app/(owner)/warehouse/packaging/page.tsx` (**new**)
- `src/app/(owner)/warehouse/receive/page.tsx` + `receive-client.tsx` (tabs Жидкость / Тара)
- `src/lib/navigation/warehouse-nav.ts`
- `src/lib/navigation/owner-nav.ts`
- `src/messages/ru.json` · `src/messages/tj.json`

### Tests / scripts
- `scripts/test-packaging-4a.ts`
- `package.json` → `test:packaging-4a`

**Not modified:** `src/lib/services/stock.service.ts` (FIFO untouched).

---

## 2. Migration details

**Name:** `20260801140000_block4_packaging_sku`  
**Applied on Neon:** yes (2026-08-01)

| Change | Detail |
|--------|--------|
| Enum | `ProductKind` = `STANDARD` \| `PACKAGING` |
| Table | `PackagingSku` (volumeMl, material, color, cap, defaultCost, isActive, …) |
| Unique | `(companyId, volumeMl, material, color, cap)` — expandable sizes without code change |
| Product | `kind` default STANDARD, `packagingSkuId` nullable FK |
| SaleItem | `isDecant`, `packagingProductId`, `packagingQuantity`, `packagingCostPerUnit` (**nullable, unused until 4b**) |
| SaleReturnItem | `packagingReturned` Boolean (**sealed restore flag for 4d**; no UI yet) |

---

## 3. What was added (4a exit criteria)

| Criterion | Status |
|-----------|--------|
| Owner sees packaging stock UI | ✅ `/warehouse/packaging` |
| Create PackagingSku | ✅ form + API POST |
| Receive packaging batch | ✅ Receive → tab **Тара** → existing `addBatch` |
| See bottle quantities | ✅ `warehouseQty` on catalog cards |
| API CRUD | ✅ GET/POST/PATCH `/api/packaging-skus` |
| Default Skus 5/10/30/50/100 glass | ✅ `ensureDefaultPackagingSkus` (+ seed) |
| material / color / cap on Sku | ✅ (field name `cap` = capType) |
| RBAC: SELLER blocked | ✅ API `requireOwnerOrManager`; owner layout redirects SELLER → `/pos` |
| Impact map before schema | ✅ `BLOCK-4-PHASE-4A-IMPACT.md` |
| No Dior 5ml products | ✅ packaging is separate ProductKind.PACKAGING |
| FIFO not rewritten | ✅ |

---

## 4. What was NOT done (out of 4a scope)

- POS decant / volume picker  
- Dual FIFO in `createSale`  
- Analytics ml / bottle burn  
- Revision UI split liquid vs packaging  
- Return UI for sealed/open bottle (field only)  
- Notifications / Block 5  
- Store→store packaging UX polish  

→ **Phase 4b+ only after you accept 4a.**

---

## 5. Tests

```bash
npm run test:packaging-4a
```

Checks: defaults ≥5 volumes · 30ml → PACKAGING/PIECE Product · `addBatch` +50 pcs updates `StockBalance` · catalog shows qty.

Full liquid+bottle sale flow = `test:liquid-bottle-flow` in **4e**, not 4a.

---

## 6. Errors and fixes during 4a

| Issue | Fix |
|-------|-----|
| Neon P1001 unreachable during first migrate | Retried later — migration applied successfully |
| TS: `material: string \| null` vs input type | PackagingSkuInput allows `null` |
| Seed logging with fake `actorId: "system"` | Defaults seed without invalid user FK |
| Receive `useSearchParams` | Wrapped in `Suspense` via `receive-client.tsx` |
| Smoke test called `addBatch` without `tx` | Fixed: `prisma.$transaction` + `addBatch(tx, …)` |

---

## UI acceptance checklist (for you)

1. Login OWNER → **Склад → Тара**  
2. See 5/10/30/50/100 ml glass (after first open or seed)  
3. Create optional custom Sku (e.g. 15 ml)  
4. **Приёмка → Тара** → accept 50 × 30 ml  
5. Catalog stock increases  
6. Login SELLER → no access to `/warehouse/packaging` (redirect POS)

Reply **«4a принято»** to start Phase 4b (POS dual FIFO only).
