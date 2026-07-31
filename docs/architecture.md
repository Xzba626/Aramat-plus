# AROMAT PLUS — Architecture

Living map for developers. Updated as ERP modules evolve.

**Languages:** RU / TJ only (`src/messages`).  
**Stack:** Next.js App Router · Prisma · PostgreSQL · NextAuth · Zustand · Tailwind.

---

## Core inventory spine (do not break)

```
Product → Batch → FIFO (deductBatchesFifo) → StockBalance
                ↘ Transfer → Store stock
                ↘ Sale → FIFO deduct (STORE or WAREHOUSE for OWNER_DIRECT)
```

Services: `src/lib/services/stock.service.ts`, `sale.service.ts`, `transfer.service.ts`.

---

## ERP modules (Stage 2 IA)

Navigation reflects modules; **URLs still use legacy `/warehouse/*` paths** until a later redirect pass.

| Module | Responsibility | Current routes |
|--------|----------------|----------------|
| **Products** | Nomenclature, brands, categories, types | `/warehouse/products`, `/categories`, `/brands`, `/new`, `/[id]` |
| **Purchases** | Receipts, batches, suppliers (planned) | `/warehouse/receive`, `/batches` |
| **Inventory** | Balances, transfers, write-offs, revision, history | `/warehouse`, `/stock`, `/transfers`, `/return-in`, `/write-offs`, `/history`, `/revision` |
| **Sales** | Owner returns queue; seller POS separate shell | `/returns`; seller `/pos/*` |
| **Stores** | Branches, OWNER_DIRECT, store settings | `/stores`, `/stores/[id]` |
| **Users** | Employees, roles — **create only here** | `/users` |
| **Stores** | Branches; **assign** existing users (no create) | `/stores`, `/stores/[id]?tab=staff` |
| **Reports** | Analytics / KPI | `/analytics` |
| **System** | Settings, notifications, journal | `/settings`, `/notifications`, `/journal` |
| **Packaging** | Bottles (planned Stage 7) | — |

Nav source of truth: `src/lib/navigation/owner-nav.ts`, `warehouse-nav.ts`.

---

## Users ↔ Stores (Stage 3)

```
POST /api/users          → create User (OWNER only; storeId optional)
POST /api/stores/:id/staff { userId } → assign existing user (OWNER)
DELETE /api/stores/:id/staff?userId=  → unbind (OWNER; Sale history kept)
```

Store UI must not create users. Unassigned sellers can still exist (`storeId = null`).


| Role | Access |
|------|--------|
| OWNER | Full owner shell + users |
| MANAGER | Owner shell without users admin |
| SELLER | `/pos/*` only |

RBAC: `src/lib/rbac.ts`, `src/middleware.ts`.

---

## Business flows

### Purchase → stock

Supplier (planned) → Purchase receipt UI → `addBatch` → Batch + StockBalance (WAREHOUSE).

### Transfer

Warehouse Batch FIFO → Transfer → new Batch at STORE + StockBalance.

### Sale (piece / weight)

POS cart → `POST /api/sales` → `createSale` → FIFO at STORE (or WAREHOUSE for OWNER_DIRECT).

### Decant sale (planned Stage 7)

Product (oil, WEIGHT) + Packaging (bottle, PIECE) → one TX, two FIFO deducts.

### Return

SaleReturn request → Owner approve → stock restore via `addBatch` → Sale `RETURNED`.

---

## Layering

| Layer | Location | Rule |
|-------|----------|------|
| UI | `src/app`, `src/components` | Display + forms only |
| API | `src/app/api` | Auth, validate, call services |
| Services | `src/lib/services` | Business rules, transactions |
| DB | `prisma/schema.prisma` | Persistence |

Do not put FIFO / profit / stock mutation logic in React components.

---

## Planned stages

1. ~~Audit~~  
2. **Navigation + module boundaries** (this doc)  
3. Users + Stores (assign existing sellers)  
4. ProductType → AccountingType  
5. Purchases + Supplier + Warehouse KPI  
6. Inventory + Revision cycle  
7. Packaging + POS + mobile-first  
8. Cart persistence + idempotency  
9. Design system  
10. Performance + cleanup  

---

## Verification after each stage

```bash
npx tsc --noEmit
npm run build
npm run smoke:cycle
```
