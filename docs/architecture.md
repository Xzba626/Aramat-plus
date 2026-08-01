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

**Profit formula (stores):**  
`Net profit = Sales revenue − COGS (FIFO) − Store expenses`

---

## End-to-end data chain (no duplicates)

```
Warehouse (receive / Batch)
  → Inventory (StockBalance, transfers, write-offs, revision)
    → Store (branch stock)
      → Seller (User.storeId)
        → Sale (paymentMethod: CASH | CARD | TRANSFER)
          → Analytics / Reports
```

Owner must be able to trace stock from central warehouse to a completed sale.

---

## ERP modules (Stage 2 IA)

Navigation reflects modules; **URLs still use legacy `/warehouse/*` paths** until a later redirect pass.

| Module | Responsibility | Current routes |
|--------|----------------|----------------|
| **Products** | Nomenclature, brands, categories, types, accounting rules | `/warehouse/products`, `/categories`, `/brands`, `/new`, `/[id]` |
| **Purchases** | Receipts, batches, suppliers | `/warehouse/receive`, `/batches` |
| **Inventory** | Balances, transfers, write-offs, revision, history | `/warehouse`, `/stock`, `/transfers`, `/return-in`, `/write-offs`, `/history`, `/revision` |
| **Packaging** | `PackagingSku` — bottles (not products), Stage 4 | Gate: [block-4-packaging-gate.md](block-4-packaging-gate.md) |
| **Sales** | Returns queue; seller POS shell | `/returns`; seller `/pos/*` |
| **Stores** | Branches, OWNER_DIRECT, expenses, staff **assign** (no user create) | `/stores`, `/stores/[id]` |
| **Users** | Create/archive employees; optional store on create | `/users` |
| **Reports** | Analytics, payment mix, KPI | `/analytics` |
| **System** | Settings, notifications, journal, **safe system reset** (Owner) | `/settings`, … |

Nav source of truth: `src/lib/navigation/owner-nav.ts`, `warehouse-nav.ts`.

---

## Users ↔ Stores

```
POST /api/users                    → create User (OWNER; storeId optional)
POST /api/stores                   → create Store; may assign existing sellerIds
POST /api/stores/:id/staff {userId}→ assign (OWNER)
DELETE /api/stores/:id/staff?...   → unbind (OWNER; Sale history kept)
```

| Action | Rule |
|--------|------|
| Create user | **Only** `/users` |
| Create store | May pick **existing** sellers to bind |
| Soft-delete / archive user | Prefer archive if sales history exists; hard delete only if safe |
| Soft-delete / archive store | Prefer archive if sales/stock/history; hard delete only if empty |

---

## Roles

| Role | Access |
|------|--------|
| OWNER | Full owner shell + users + system reset |
| MANAGER | Owner shell without users admin / reset |
| SELLER | `/pos/*` only |

RBAC: `src/lib/rbac.ts`, `src/middleware.ts`.

---

## Business flows

### Purchase → stock

Supplier → Purchase receipt UI → `addBatch` → Batch + StockBalance (WAREHOUSE).

### Transfer

Warehouse Batch FIFO → Transfer → new Batch at STORE + StockBalance.

### Sale (piece / weight)

POS cart → `POST /api/sales` → `createSale` → FIFO + `paymentMethod`.

### Decant sale (Stage 7)

Product (oil, WEIGHT) + Packaging (bottle, PIECE) → **one TX, two FIFO deducts**.  
If either fails → full rollback.

### Return

SaleReturn → approve → stock restore → Sale `RETURNED`.

### Store expenses

Per-store expenses (rent, salary, utilities, …) → reduce store net profit in analytics.

---

## Layering

| Layer | Location | Rule |
|-------|----------|------|
| UI | `src/app`, `src/components` | Display + forms; loading ≠ empty |
| API | `src/app/api` | Auth, validate, call services |
| Services | `src/lib/services` | Business rules, transactions |
| DB | `prisma/schema.prisma` | Persistence |

Do not put FIFO / profit / stock mutation logic in React components.  
Empty states only after fetch completes with zero rows (use skeleton / loading first).

---

## Staged roadmap (approved + extensions)

Done:

1. ~~Full audit~~  
2. ~~Navigation + module boundaries~~  
3. ~~Users create-only + store assign/unbind~~  
3.1 ~~Users ↔ Stores complete~~ (create store + staff; archive/safe-delete; dates; loading ≠ empty)
4. ~~ProductType → AccountingType~~ (`src/lib/product-accounting.ts`; enforced on POST/PATCH products)
5. ~~Purchases + Supplier + Warehouse KPI~~ (Supplier; receive flow; purchase history; warehouse financial KPIs)

Next (order preserved; extensions slotted in):

| Stage | Scope | Includes new requirements |
|-------|--------|---------------------------|
| **5.1** | Stores depth | Store card metrics (open date, SKU, sellers/managers, stock, today sales/profit/expenses/net); **full store expenses** categories |
| **6** | Inventory + Revision | Full revision cycle; chain Warehouse→…→Sale audit |
| **7** | Packaging + POS + mobile-first | Bottles CRUD/archive/stock; decant sale (oil+bottle); mobile POS |
| **8** | Cart persistence + idempotency | IndexedDB drafts; `clientRequestId`; request states |
| **9** | Design system + loading UX | Tokens; **skeleton loading**; never flash “empty” while loading |
| **10** | Performance + Reports polish + System reset | Payment analytics (cash/card/transfer); list virtualization; **Owner system wipe** (phrase confirm, one TX, keep settings) |

### Product Vision Completion Phase (канон)

См. [PRODUCT-VISION-LAYER.md](PRODUCT-VISION-LAYER.md).

| Block | Scope | Status |
|-------|--------|--------|
| 1 | Discount seller → owner → sale | ✅ |
| 2 | POS Persistent Cart (+ seller/store scope) | ✅ |
| **3.1** | **Owner Control Center** (деньги, магазины, решения, Finance) | 🔄 код harden — **UI-приёмка** |
| **4** | **Perfume Bottle & Liquid Inventory** | 📋 **следующий core** (расширение склада) |
| **5** | **Notifications / Owner Inbox** | 📋 после Block 4 |
| 6 | Store↔store workflow | pending |
| 7 | Customer CRM | pending |
| 8 | PDF / Excel / Import | pending (после ядра) |

Аудит без правок кода: [PRODUCT-VISION-AUDIT.md](PRODUCT-VISION-AUDIT.md).

Также в фазе (не «забыть»): Backup / Demo / Full Reset · роли WAREHOUSE / ACCOUNTANT · глобальный поиск.

Criterion: function is done only when owner/seller completes the full scenario in UI and sees the result.

---

## Stage 10 — System reset (Owner only)

**Wipe:** products, batches, stock, sales, returns, transfers, movements, expenses, stores (non–owner-direct policy TBD), non-Owner users, derived analytics.  

**Keep:** app settings, roles config, locales, design tokens, company shell, Owner account.  

**UI:** warning → confirm → type phrase → single transaction → no accidental trigger.

---

## Verification after each stage

```bash
npx tsc --noEmit
npm run build
npm run smoke:cycle
```

Before coding each stage: file list + risk note.  
No FIFO rewrites. No parallel business logic. No UI-only rules.
