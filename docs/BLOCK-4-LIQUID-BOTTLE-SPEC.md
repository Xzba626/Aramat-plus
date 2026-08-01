# Block 4 — Perfume Bottle & Liquid Inventory  
## Stage 0: Technical Specification (NO CODE YET)

**Status:** AWAITING APPROVAL  
**Date:** 2026-08-01  
**Principle:** extend existing Product → Batch → FIFO → Sale → Profit engine. Do **not** rewrite `stock.service`.  
**Done criterion:** full UI scenario  
`Receive liquid → Receive bottles → POS decant → dual FIFO → COGS → profit → analytics → revision → return`

Related: [PRODUCT-VISION-LAYER.md](PRODUCT-VISION-LAYER.md) · [PRODUCT-VISION-AUDIT.md](PRODUCT-VISION-AUDIT.md) · [batch-rules.md](batch-rules.md)

---

## 0. Executive decision

| Question | Decision |
|----------|----------|
| Separate Products per volume (`Dior 5ml`)? | **Forbidden** |
| Packaging = Product aroma variant? | **No** — packaging is its own catalog + stock |
| Rewrite FIFO? | **No** — call existing `deductBatchesFifo` / `addBatch` twice in one TX |
| PIECE goods (watches, sealed bottles)? | **Unchanged** |
| When bottle missing? | **Block sale** + suggest alternate volumes that have stock |
| Bottle only volume? | **No** — catalog includes material / color / cap (future-proof cost variants) |

---

## 1. Recommended data model

### 1.1 Why not four parallel tables that copy Batch?

Duplicating `PackagingBatch` + `PackagingStock` + custom FIFO would:

- fork COGS / transfer / revision logic;
- risk drift from proven `deductBatchesFifo`;
- violate “extend, don’t rewrite”.

### 1.2 Chosen architecture (reuse FIFO engine)

```
PackagingSku          ← catalog (what bottle IS: 30ml glass black gold)
        │
        ▼
Product (kind=PACKAGING, PIECE)   ← stockable unit (one Product per Sku)
        │
        ├── Batch (existing)      ← purchase lots with costPerUnit
        └── StockBalance (existing)

Product (kind=STANDARD, WEIGHT)   ← aroma Dior Sauvage, stock in ml
        │
        ├── Batch
        └── StockBalance

Sale (one TX)
  ├── SaleItem liquid: productId=aroma, quantity=30 (ml)
  └── SaleItem OR line link: packagingProductId, qty=1
        └── COGS = liquid FIFO cost + packaging FIFO cost
```

**Mental model for owner:**

- **Жидкость** = aroma Product (`WEIGHT`)
- **Тара** = packaging Products (`PIECE`, `kind=PACKAGING`) driven by PackagingSku catalog

FIFO stays one function: `deductBatchesFifo({ productId, location, qty })`.

### 1.3 Schema changes (proposed)

#### Enums

```prisma
enum ProductKind {
  STANDARD   // aroma, watches, sealed retail, etc.
  PACKAGING  // empty bottles / vials
}

enum DecantPolicy {
  REQUIRE_BOTTLE   // default — block if no matching packaging stock
  // future: ALLOW_WITHOUT_BOTTLE
}
```

#### PackagingSku (Bottle Catalog)

```prisma
model PackagingSku {
  id              String   @id @default(cuid())
  companyId       String
  name            String           // "Флакон 30 мл · стекло · чёрный · золото"
  volumeMl        Decimal  @db.Decimal(14, 3)
  material        String?          // glass | plastic | …
  color           String?
  cap             String?          // gold | black | …
  skuCode         String?
  defaultCost     Decimal? @db.Decimal(12, 4) // plan cost; real cost on Batch
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  company  Company   @relation(...)
  products Product[] // usually 1 active Product stock mirror

  @@unique([companyId, volumeMl, material, color, cap])
  @@index([companyId, volumeMl])
}
```

> **Why material/color/cap in uniqueness:**  
> 30 ml glass @ 2 с. ≠ 30 ml premium @ 5 с. Different Skus → different Products → different Batches → correct FIFO COGS. Avoids later model break.

#### Product extensions

```prisma
model Product {
  // existing fields…
  kind            ProductKind @default(STANDARD)
  packagingSkuId  String?
  packagingSku    PackagingSku? @relation(...)

  // optional company setting later:
  // defaultDecantPolicy via Setting key
}
```

Rules:

| kind | accountingType | meaning |
|------|----------------|---------|
| STANDARD + WEIGHT | ml | aroma liquid |
| STANDARD + PIECE | pcs | watches, sealed retail, deodorant |
| PACKAGING + PIECE | pcs | empty bottle stock |

Invariant: `kind=PACKAGING` ⇒ `accountingType=PIECE` ∧ `packagingSkuId` set.

#### SaleItem extensions (decant link)

```prisma
model SaleItem {
  // existing…
  packagingProductId  String?   // bottle Product used for this line
  packagingQuantity   Decimal?  @db.Decimal(14, 3) // normally 1
  packagingCostPerUnit Decimal? @db.Decimal(12, 4) // FIFO snapshot
  isDecant            Boolean   @default(false)

  packagingProduct Product? @relation("SaleItemPackaging", ...)
}
```

Liquid COGS remains `costPerUnit` (from liquid FIFO).  
Line COGS for profit =  
`(qty × costPerUnit) + (packagingQuantity × packagingCostPerUnit)`.

#### SaleReturnItem extensions

```prisma
model SaleReturnItem {
  // existing quantity (liquid ml or piece)…
  returnPackaging     Boolean @default(false) // restore bottle stock?
  packagingQtyReturned Decimal? @db.Decimal(14, 3)
}
```

#### Company Setting keys (no new table required)

| key | default | meaning |
|-----|---------|---------|
| `decant.policy` | `REQUIRE_BOTTLE` | missing bottle → block |
| `decant.suggestAlternatives` | `true` | UI lists other volumes with stock |

#### InventorySession / Revision

Reuse `InventoryItem` on Products (both aroma WEIGHT and packaging PIECE).  
UI splits lists: **Жидкость** / **Тара**. No new revision tables.

#### Explicitly NOT adding (v1)

- `PackagingBatch` / `PackagingStock` / `PackagingMovement` as parallel engines  
- Gift bundling of free bottles  
- Auto-split “30 ml → 3×10 ml” without user choice  

---

## 2. Warehouse workflow

### 2.1 Receive aroma (unchanged path)

```
Product Dior Sauvage (WEIGHT)
→ POST /api/products/:id/batches
→ +5000 ml Batch @ costPerUnit
→ StockBalance WAREHOUSE += 5000
```

### 2.2 Receive bottles (new path, same engine)

```
PackagingSku "30ml glass black gold"
→ ensure Product(kind=PACKAGING, PIECE) exists
→ POST /api/products/:packagingProductId/batches
→ +100 pcs @ cost 2.00
→ StockBalance += 100
```

UI:

```
Склад
 ├── Жидкость   → filter kind=STANDARD & WEIGHT (+ sealed PIECE aromas optional tab)
 └── Тара       → filter kind=PACKAGING
```

Receive UI: tabs **Парфюм** | **Тара** (reuse receive form; product picker filtered).

### 2.3 Transfer

Same `transfer.service`: packaging Products transfer like any PIECE SKU.  
Warehouse → store carries bottle Batches with preserved `costPerUnit`.

### 2.4 Product card (aroma)

```
Dior Sauvage · WEIGHT · Разливной

Жидкость: 5000 ml (WH) · 340 ml (Store A) …

Рекомендуемая тара (from PackagingSku list + store stock):
  5ml  … 100
  10ml … 80
  30ml … 200
```

Not “variants of Dior” — stock of independent packaging Products.

---

## 3. POS workflow

### 3.1 Piece sale (unchanged)

`kind=STANDARD` + `PIECE` → current cart qty integers.

### 3.2 Decant sale (new)

1. Seller picks aroma (`WEIGHT`).
2. Mode: **Разлив** (auto if WEIGHT; sealed WEIGHT rare — still allow “целый объём партии” later if needed).
3. Choose volume preset: `5 | 10 | 30 | 50 | 100 | custom`.
4. System resolves packaging Product(s) for `volumeMl` at **seller’s store**:

```
availableLiquid = store stock aroma (physical − reservations)
candidates = Packaging Products with packagingSku.volumeMl == chosen
             AND store stock > 0
preferred = exact volume match, lowest cost or default SKU
```

5. UI shows:

```
Доступно: 4500 ml
Флакон 30ml glass: 150 шт
Цена продажи: (salePrice × ml) or price ladder (see 3.4)
Итого: …
```

6. Cart line stores:

```
{ productId, quantityMl, packagingProductId, packagingQty: 1, isDecant: true }
```

7. Checkout → `createSale` in **one transaction**:

```
assert liquid >= ml
assert packaging >= 1
consumedL = deductBatchesFifo(liquid…)
consumedP = deductBatchesFifo(packaging…)
SaleItem { … cost from L, packagingCost from P }
```

### 3.4 Pricing (v1)

- Use `Product.salePrice` as **price per ml** for WEIGHT (already unit-aligned in seed/UI), OR  
- Optional later: `DecantPriceTier` (30ml → fixed 45).  

**Spec v1:** `lineRevenue = salePrice × quantityMl` (same as today for WEIGHT).  
Bottle is **not** sold as separate revenue line — cost only in COGS (common perfume retail: price is for filled bottle).

### 3.5 Missing bottle — business rule (v1)

| Situation | System |
|-----------|--------|
| Liquid OK, exact volume bottle **0** | **BLOCK** checkout |
| UI | “Недостаточно тары 30 ml” + list alternatives with stock (10ml, 50ml…) |
| Seller | Must pick another volume **or** cancel |
| Owner setting later | `ALLOW_WITHOUT_BOTTLE` — out of v1 |

**Not v1:** automatic “compose 30 ml from 3×10 ml” without explicit user choice (dangerous inventory UX).

If multiple Skus share 30 ml (glass vs premium):

- POS shows picker: material/color/cap + stock + cost hint;
- default = highest stock or owner “default” flag on PackagingSku (optional field `isDefaultForVolume`).

---

## 4. COGS & profit

```
liquidCogs   = Σ (ml_i × costPerUnit_i)     // FIFO slices
bottleCogs   = Σ (pcs_j × costPerUnit_j)    // usually 1 × batch cost
lineCogs     = liquidCogs + bottleCogs
lineProfit   = lineRevenue - lineCogs
```

Net profit / expenses allocation: unchanged (`withNetProfit`).

Dashboard / analytics: include packaging COGS in existing sale item cost sums (extend aggregation to add `packagingCostPerUnit * packagingQuantity`).

---

## 5. Analytics

New / extended metrics (WEIGHT + packaging):

| Metric | Source |
|--------|--------|
| Sold ml by aroma | `SaleItem.quantity` where product WEIGHT / `isDecant` |
| Revenue / profit per ml | revenue ÷ ml; profit ÷ ml |
| Top aromas by ml | aggregate |
| Top fill volumes | from `packagingSku.volumeMl` or quantity buckets |
| Bottle consumption pcs | sum `packagingQuantity` by PackagingSku |
| Still show check count | separate from ml |

UI: analytics **Types** / new tab **Разлив** — ml columns, not “20 pcs” for WEIGHT.

---

## 6. Revision

Same `InventorySession` / `InventoryItem`:

- Session can include both WEIGHT and PACKAGING products at a store.
- UI sections: Жидкость (ml expected/fact/diff) · Тара (pcs).
- Approve: existing revision adjust via FIFO / addBatch — works for both kinds.

---

## 7. Returns

| Case | Liquid | Bottle |
|------|--------|--------|
| Full return unopened | restore ml via `addBatch` RETURN | `returnPackaging=true` → restore 1 bottle |
| Partial ml return (e.g. 50→20) | restore 20 ml | bottle **not** restored (opened / used) unless owner marks “return packaging” |
| Piece sealed product | existing path | n/a |

Seller UI: checkbox “Вернуть тару” only when full quantity returned and policy allows.

Profit: existing return netting + packaging cost reversal when bottle restored.

---

## 8. RBAC

| Action | OWNER | MANAGER | SELLER |
|--------|-------|---------|--------|
| PackagingSku CRUD | ✓ | ✓ | ✗ |
| Receive bottles | ✓ | ✓ | ✗ |
| Decant sale | — | — | ✓ (own store) |
| See bottle costs | ✓ | ✓ | ✗ (POS: availability only) |

`WAREHOUSE` / `ACCOUNTANT` roles: **not in Block 4** (later); managers cover receive for now.

---

## 9. API list (proposed)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/packaging-skus` | catalog CRUD |
| PATCH | `/api/packaging-skus/:id` | archive / default |
| POST | `/api/products` | allow `kind=PACKAGING` + `packagingSkuId` (or auto-create Product on first receive) |
| POST | `/api/products/:id/batches` | unchanged — works for packaging Products |
| GET | `/api/pos/decant-options?productId=` | ml presets + bottle availability at store |
| POST | `/api/sales` | accept `items[].packagingProductId`, `isDecant` |
| GET | `/api/analytics?period=` | extend with ml / bottle burn |
| POST | `/api/returns` | `returnPackaging` flag |

---

## 10. Services list

| Service | Change |
|---------|--------|
| `stock.service` | **no rewrite**; reuse `addBatch` / `deductBatchesFifo` |
| `packaging.service` (new) | PackagingSku CRUD; ensure stock Product; resolve bottle by volume+store |
| `sale.service` | dual deduct in same TX; persist packaging cost; rollback both on fail |
| `sale-return.service` | optional packaging restore |
| `pos-catalog.service` | expose WEIGHT + decant options |
| `analytics.service` | ml sold, bottle burn, profit/ml |
| `dashboard.service` | optional weightSold already — keep; add bottle alerts later |
| `revision.service` | no core change; UI filter by kind |
| `transfer.service` | no change (packaging = Product) |

---

## 11. UI pages

| Surface | Work |
|---------|------|
| `/warehouse/packaging` (new) | PackagingSku catalog + stock snapshot |
| `/warehouse/receive` | tab Тара |
| `/warehouse` overview | liquid vs packaging KPIs |
| `/warehouse/[id]` aroma | liquid + linked bottle availability |
| `/warehouse/[id]` packaging product | pcs batches |
| Seller `/pos` | volume presets + bottle status |
| Seller `/pos/cart` | decant line display; block if no bottle |
| `/analytics` | Разлив metrics |
| `/revision` | dual sections |
| Owner nav | under Склад → Тара |

---

## 12. Test plan — `test:liquid-bottle-flow`

```
1. Create WEIGHT Product Dior
2. addBatch +1000 ml @ 0.50/ml
3. Create PackagingSku 10ml + Product PACKAGING
4. addBatch +100 bottles @ 2.00
5. Transfer liquid 200ml + bottles 20 to Store
6. createSale decant 30ml + bottle 10ml×1  → MUST FAIL (volume mismatch) OR only allow matching volume
7. createSale 10ml + bottle 10ml
8. Assert liquid store 190; bottles 19
9. Assert sale COGS = 10*0.50 + 2.00 = 7.00
10. Analytics: sold ml = 10; bottle burn = 1
11. Partial return 5ml, packaging false → liquid 195; bottles 19
12. ActivityLog: SALE_CREATE + batch movements
13. Revision: liquid + packaging counts
```

Also: PIECE regression smoke (watch sale) must pass.

After implementation: re-run `test:acceptance` + `test:final-gate`.

---

## 13. Migration risks

| Risk | Mitigation |
|------|------------|
| Existing WEIGHT products | `kind=STANDARD` default; no behavior change until POS uses decant mode |
| Historical sales without packaging | `packagingProductId` null; COGS liquid-only |
| salePrice semantics (per ml vs per bottle) | document; seed WEIGHT as per-ml; UI label “цена за мл” |
| Multiple 30ml Skus | POS must pick Sku; no silent pick of wrong cost |
| Dual deduct partial failure | single Prisma `$transaction`; no half-sale |
| Store without bottles | clear POS error + alternatives |
| Product create still bundling batch | keep out of Block 4 scope (audit P1) |
| Neon migrate lock | additive migration only; nullable columns |

Migration SQL shape:

1. enums `ProductKind`  
2. table `PackagingSku`  
3. `Product.kind`, `Product.packagingSkuId`  
4. `SaleItem` packaging columns  
5. `SaleReturnItem` packaging columns  
6. seed default Skus 5/10/30/50/100 (glass, null color/cap) optional  

---

## 14. Implementation phases (after this spec is approved)

| Phase | Scope | Exit |
|-------|-------|------|
| **4a** | Schema + PackagingSku CRUD + receive tarа UI | owner sees bottle stock |
| **4b** | `sale.service` dual FIFO + POS decant | one successful decant sale in UI |
| **4c** | Analytics ml + bottle burn | owner sees ml metrics |
| **4d** | Revision sections + returns packaging rules | audit scenario green |
| **4e** | `test:liquid-bottle-flow` + final-gate | Block 4 ACCEPT |

Do **not** start Notifications (Block 5) until 4e accepted.

---

## 15. Open questions — ANSWERED

1. **salePrice WEIGHT** = **per ml** ✅  
2. **Seed defaults** 5/10/30/50/100 glass ✅ (expandable)  
3. **Bottle revenue** = no; COGS only ✅  
4. **Bottle on return** = restore bottle **only if sealed/unused** (`packagingReturned`); opened → no bottle restore ✅  
5. **Custom ml** = exact volume match only in v1 ✅  

Impact map: [BLOCK-4-PHASE-4A-IMPACT.md](BLOCK-4-PHASE-4A-IMPACT.md).

## 16. Approval checklist

- [x] Model PackagingSku + Product(PACKAGING) + reuse Batch/FIFO  
- [x] Missing bottle = block + alternatives (4b)  
- [x] Catalog material/color/cap  
- [x] Dual deduct one TX; no stock.service rewrite  
- [x] Answers to open questions  

**Phase 4a:** Schema + catalog CRUD + receive тары — in progress / done in code.  
**Phase 4b+:** await 4a accept.